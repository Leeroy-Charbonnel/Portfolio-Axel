/*Run with: bun run scripts/push-tmp-files-to-prod.ts
Reads FILES_FORWARD_URL + FILES_FORWARD_SECRET from .env and uploads
the assets that prod's volume is currently missing:

  - src/tmp/project-{4..8}/main.png  -> bound to gallery_project id 4..8
  - src/tmp/*.glb                    -> rebinds main_project.glb_file_id
  - storage/files/hdri/*.exr         -> repushes the HDRs that the
                                       viewerSettings reference

Each upload hits prod's POST /api/files with the X-Files-Forward-Secret
header (the same bypass requireAuth uses for tunneled writes). The DB
row prod inserts is then linked to the right portfolio row.

NO LOCAL STORAGE: nothing is written to local disk by this script.*/

import { readFileSync, existsSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import postgres from "postgres"

const env = await Bun.file(".env").text().then((t) => {
  const out: Record<string, string> = {}
  for (const line of t.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 0) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
})

const FORWARD_URL        = env.FILES_FORWARD_URL?.replace(/\/$/, "")
const FORWARD_SECRET     = env.FILES_FORWARD_SECRET ?? ""
const PROD_BASE_URL      = (env.PROD_BASE_URL ?? "https://axel.somerandomcreator.com").replace(/\/$/, "")
const PROD_SESSION_COOKIE = env.PROD_SESSION_COOKIE ?? ""
const DATABASE_URL       = env.DATABASE_URL

if (!DATABASE_URL) {
  console.error("[push-tmp] DATABASE_URL missing - abort")
  process.exit(1)
}

//Two auth modes, in priority order:
//  1) FILES_FORWARD_URL + FILES_FORWARD_SECRET -> tunnel path. Requires
//     prod to be on the tunnel commit AND to share FILES_FORWARD_SECRET.
//  2) PROD_SESSION_COOKIE -> raw better-auth cookie from the user's
//     browser (devtools > Application > Cookies). Hits prod directly,
//     no tunnel deploy needed. The cookie format is
//     `better-auth.session_token=<token>.<signature>` - paste the whole
//     value (everything to the right of `=`) into the env var.
const useTunnel  = Boolean(FORWARD_URL && FORWARD_SECRET)
const useCookie  = Boolean(PROD_SESSION_COOKIE)
if (!useTunnel && !useCookie) {
  console.error("[push-tmp] need either (FILES_FORWARD_URL+FILES_FORWARD_SECRET) or PROD_SESSION_COOKIE in .env - abort")
  process.exit(1)
}
const targetUrl  = useTunnel ? FORWARD_URL! : PROD_BASE_URL
const authHeader = useTunnel
  ? { "x-files-forward-secret": FORWARD_SECRET }
  : { "cookie": `better-auth.session_token=${PROD_SESSION_COOKIE}` }
console.log(`[push-tmp] auth mode: ${useTunnel ? "TUNNEL secret" : "PROD session cookie"}`)
console.log(`[push-tmp] target: ${targetUrl}`)

const sql = postgres(DATABASE_URL)

async function uploadOne(localPath: string, originalName: string, mimeType: string): Promise<{ id: string; storedFilename: string; url: string }> {
  const buf  = readFileSync(localPath)
  const form = new FormData()
  form.append("file", new Blob([new Uint8Array(buf)], { type: mimeType }), originalName)

  const res = await fetch(`${targetUrl}/api/files`, {
    method:  "POST",
    headers: { ...authHeader },
    body:    form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`upload ${originalName} -> ${res.status}: ${text}`)
  }
  return await res.json() as { id: string; storedFilename: string; url: string }
}

//=== SOFTWARE LOGOS - bind new uploads to software rows by key ===
console.log("\n== software logos ==")
const logoMap: Record<string, string> = {
  "blender-logo.png":     "Blender",
  "substance-logo.png":   "Substance",
  "photoshop-logo.png":   "Photoshop",
  "illustrator-logo.png": "Illustrator",
}
for (const [filename, swKey] of Object.entries(logoMap)) {
  const localPath = join("src", "tmp", filename)
  if (!existsSync(localPath)) { console.warn(`  skip ${filename} - missing`); continue }
  const row = await uploadOne(localPath, filename, "image/png")
  await sql`UPDATE software SET logo_file_id = ${row.id}::uuid WHERE key = ${swKey}`
  console.log(`  software key=${swKey} logo <- ${row.url}`)
}

//=== GALLERY 4..8 - bind new uploads to gallery_project rows by id ===
console.log("\n== gallery 4..8 ==")
for (const id of [4, 5, 6, 7, 8]) {
  const localPath = join("src", "tmp", `project-${id}`, "main.png")
  if (!existsSync(localPath)) { console.warn(`  skip gallery id=${id} - ${localPath} missing`); continue }
  const row = await uploadOne(localPath, `gallery-${id}.png`, "image/png")
  await sql`UPDATE gallery_project SET image_file_id = ${row.id}::uuid WHERE id = ${id}`
  console.log(`  gallery id=${id} <- ${row.url}`)
}

//=== MAIN PROJECT .glb - match each .glb in src/tmp/ to a main_project ===
console.log("\n== .glb in src/tmp ==")
const glbMap: Record<string, number> = {
  "table__chair_office.glb":                1,
  "cylinder_seat__table__bamboo_lamp.glb":  2,
  "high_table__high_chairs.glb":            3,
}
for (const [filename, mpId] of Object.entries(glbMap)) {
  const localPath = join("src", "tmp", filename)
  if (!existsSync(localPath)) { console.warn(`  skip ${filename} - missing`); continue }
  const row = await uploadOne(localPath, filename, "model/gltf-binary")
  await sql`UPDATE main_project SET glb_file_id = ${row.id}::uuid WHERE id = ${mpId}`
  console.log(`  main_project id=${mpId} glb <- ${row.url}`)
}

//=== HDRs - push every .exr currently in local storage/files/hdri/ then
//=== rewrite the URL inside each main_project.viewer_settings JSON so the
//=== refs point at the freshly uploaded UUIDs.
console.log("\n== HDR .exr ==")
const hdriDir = join("storage", "files", "hdri")
if (existsSync(hdriDir)) {
  const oldToNew: Record<string, { id: string; url: string }> = {}
  for (const fn of readdirSync(hdriDir).filter((f) => f.toLowerCase().endsWith(".exr"))) {
    const localPath = join(hdriDir, fn)
    const row       = await uploadOne(localPath, fn, "image/x-exr")
    const oldId     = basename(fn, ".exr")
    oldToNew[oldId] = { id: row.id, url: row.url }
    console.log(`  ${oldId} -> ${row.id} (${row.url})`)
  }

  //rewrite viewerSettings hdrId + hdrUrl on every main_project
  const mps = await sql`SELECT id, viewer_settings FROM main_project`
  for (const mp of mps) {
    const vs = mp.viewer_settings as any
    if (!vs) continue
    let dirty = false
    for (const mode of ["normalMode", "wireframeMode"] as const) {
      const oldId = vs[mode]?.hdrId
      if (oldId && oldToNew[oldId]) {
        vs[mode].hdrId  = oldToNew[oldId].id
        vs[mode].hdrUrl = oldToNew[oldId].url
        dirty = true
      }
    }
    if (dirty) {
      await sql`UPDATE main_project SET viewer_settings = ${vs}::jsonb WHERE id = ${mp.id}`
      console.log(`  main_project id=${mp.id} viewer_settings rewritten`)
    }
  }
} else {
  console.warn(`  skip - ${hdriDir} not present`)
}

await sql.end()
console.log("\ndone.")
