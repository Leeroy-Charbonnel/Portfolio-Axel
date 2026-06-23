//Restore `src/tmp/project-N/*.png` straight onto a production volume.
//For each tmp/project-N folder (matched to mainProjects[N-1] by sortOrder):
//  - upload main.png            -> mainImageFileId
//  - upload thumbnailX.png + -w -> thumbnails[].fileId / .wireframeFileId
//Patches the project row via PUT /api/main-project/:id.
//
//Usage (PowerShell):
//  $env:PROD_URL = "https://your-prod-domain"
//  Either:
//    $env:ADMIN_EMAIL = "admin@..."
//    $env:ADMIN_PASSWORD = "..."
//  Or (Google-auth users who don't have a password): paste the session
//  cookie value (grab it from devtools after logging in in a browser):
//    $env:SESSION_COOKIE = "<long-base64-ish-value>"
//    $env:SESSION_COOKIE_NAME = "__Secure-better-auth.session_token"
//
//  bun scripts/restore-tmp-to-prod.ts
//
//Files are uploaded via the normal /api/files endpoint so new UUIDs are
//assigned - we don't try to preserve old IDs.

import { readdirSync, readFileSync } from "fs"
import { join, basename, dirname } from "path"
import { fileURLToPath } from "url"

const PROD_URL       = process.env.PROD_URL
const EMAIL          = process.env.ADMIN_EMAIL
const PASSWORD       = process.env.ADMIN_PASSWORD
const SESSION_COOKIE = process.env.SESSION_COOKIE
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "__Secure-better-auth.session_token"

if (!PROD_URL || (!SESSION_COOKIE && (!EMAIL || !PASSWORD))) {
  console.error("PROD_URL is required, plus either SESSION_COOKIE or (ADMIN_EMAIL + ADMIN_PASSWORD)")
  process.exit(1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const TMP_DIR    = join(__dirname, "..", "src", "tmp")

let cookie: string

if (SESSION_COOKIE) {
  //Pre-supplied session cookie (typical for Google-auth users who don't
  //have a password to script). The cookie name varies between dev and
  //prod (https) so we make it configurable via SESSION_COOKIE_NAME.
  cookie = `${SESSION_COOKIE_NAME}=${SESSION_COOKIE}`
  console.log(`[restore] using pre-supplied session cookie (${SESSION_COOKIE_NAME})`)
} else {
  //SIGN IN via better-auth and pick up the session cookie. The cookie
  //header we get back includes the session token; we forward it on every
  //subsequent request so the admin guard accepts us.
  console.log(`[restore] signing in as ${EMAIL}...`)
  const signIn = await fetch(`${PROD_URL}/api/auth/sign-in/email`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!signIn.ok) {
    console.error(`signin failed: ${signIn.status} ${await signIn.text()}`)
    process.exit(1)
  }
  const cookieHeader = signIn.headers.getSetCookie?.().join("; ")
    ?? signIn.headers.get("set-cookie")
    ?? ""
  cookie = cookieHeader.split(";")[0] ?? ""
  if (!cookie) {
    console.error("no session cookie returned by sign-in")
    process.exit(1)
  }
}

console.log(`[restore] fetching portfolio...`)
const portfolio = await fetch(`${PROD_URL}/api/portfolio`).then((r) => r.json()) as {
  mainProjects: { id: number; sortOrder: number; title?: { en: string } }[]
}
const projects = [...portfolio.mainProjects].sort((a, b) => a.sortOrder - b.sortOrder)
console.log(`[restore] found ${projects.length} projects in prod`)

async function uploadFile(path: string, mime: string): Promise<string> {
  const buf = readFileSync(path)
  const fd = new FormData()
  fd.append("file", new Blob([buf], { type: mime }), basename(path))
  const res = await fetch(`${PROD_URL}/api/files`, {
    method:  "POST",
    body:    fd,
    headers: { cookie },
  })
  if (!res.ok) throw new Error(`upload ${path} failed: ${res.status} ${await res.text()}`)
  const row = await res.json() as { id: string }
  return row.id
}

const projectDirs = readdirSync(TMP_DIR)
  .filter((d) => /^project-\d+$/.test(d))
  .sort((a, b) => parseInt(a.replace("project-", "")) - parseInt(b.replace("project-", "")))
console.log(`[restore] found ${projectDirs.length} tmp project dirs`)

for (const dir of projectDirs) {
  const n    = parseInt(dir.replace("project-", ""), 10)
  const proj = projects[n - 1]
  if (!proj) {
    console.warn(`[restore] no prod project at index ${n - 1}, skipping ${dir}`)
    continue
  }
  console.log(`[restore] === ${dir} -> prod project #${proj.id} (${proj.title?.en ?? "?"})`)

  const dirPath = join(TMP_DIR, dir)
  const files   = readdirSync(dirPath)
  const patch: Record<string, unknown> = {}

  if (files.includes("main.png")) {
    const id = await uploadFile(join(dirPath, "main.png"), "image/png")
    console.log(`[restore]   main.png -> file ${id}`)
    patch.mainImageFileId = id
  }

  //thumbnails: pair thumbnailX.png with thumbnailX-w.png when present
  const thumbs: { fileId: string; wireframeFileId: string | null; description: { en: string; fr: string } }[] = []
  const thumbFiles = files.filter((f) => /^thumbnail\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]))
  for (const tf of thumbFiles) {
    const wf = tf.replace(".png", "-w.png")
    const fileId = await uploadFile(join(dirPath, tf), "image/png")
    let wireframeFileId: string | null = null
    if (files.includes(wf)) {
      wireframeFileId = await uploadFile(join(dirPath, wf), "image/png")
    }
    console.log(`[restore]   ${tf} -> ${fileId}${wireframeFileId ? `  (+wf ${wireframeFileId})` : ""}`)
    thumbs.push({ fileId, wireframeFileId, description: { en: "", fr: "" } })
  }
  if (thumbs.length > 0) patch.thumbnails = thumbs

  if (Object.keys(patch).length === 0) {
    console.log(`[restore]   nothing to patch`)
    continue
  }

  const put = await fetch(`${PROD_URL}/api/main-project/${proj.id}`, {
    method:  "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body:    JSON.stringify(patch),
  })
  if (!put.ok) {
    console.error(`[restore]   PATCH failed: ${put.status} ${await put.text()}`)
    continue
  }
  console.log(`[restore]   patched`)
}

console.log("[restore] done")
