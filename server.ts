import express from "express"
import cors from "cors"
import helmet from "helmet"
import multer from "multer"
import { join, extname, relative } from "path"
import { mkdirSync, unlinkSync, readdirSync, copyFileSync, existsSync } from "fs"
import { fileURLToPath } from "url"
import { randomUUID } from "crypto"
import { toNodeHandler, fromNodeHeaders } from "better-auth/node"
import { auth } from "./auth"
import { db } from "./db/index"
import {
  settings,
  translations,
  file as fileTable,
  software,
  mainProject,
  mainProjectSoftware,
  galleryProject,
  experience,
  profile,
} from "./db/schema"
import { eq, and, asc, sql } from "drizzle-orm"

const app       = express()
const isProd    = process.env.NODE_ENV === "production"
const AUTH_MODE = process.env.VITE_AUTH_MODE ?? "open"
const __dirname = fileURLToPath(new URL(".", import.meta.url))

type SessionUser = typeof auth.$Infer.Session.user

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:5173"]

//SECURITY HEADERS
app.use(helmet({
  contentSecurityPolicy:   false,
  strictTransportSecurity: isProd ? { maxAge: 31536000 } : false,
}))

//CORS - credentials required for better-auth cookies
app.use(cors({ origin: allowedOrigins, credentials: true }))

//AUTH HANDLER - must be before express.json()
app.all("/api/auth/{*path}", toNodeHandler(auth))

app.use(express.json())

//AUTH MIDDLEWARE
async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) {
    res.status(401).json({ error: "unauthorized" })
    return
  }
  //banned users cannot access the API (all modes)
  if ((session.user as SessionUser).role === "banned") {
    res.status(403).json({ error: "banned" })
    return
  }

  //in restricted mode, pending users cannot access the API
  if (AUTH_MODE === "restricted" && (session.user as SessionUser).role === "pending") {
    res.status(403).json({ error: "pending" })
    return
  }
  ;(req as any).user = session.user as SessionUser
  next()
}

//ADMIN MIDDLEWARE - chain after requireAuth
function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if ((req as any).user?.role !== "admin") {
    res.status(403).json({ error: "admin only" })
    return
  }
  next()
}


//FILE UPLOAD --------------------------------------------------------------
//multer disk storage: every upload lands at storage/files/{uuid}.{ext}.
//Files are never deleted from disk - the admin can wipe rows from the
//`file` table but the binary stays. This keeps history intact even if a
//project/gallery row is removed (per project decision).
//
//mkdir is wrapped so a permission issue on the Docker volume mount can't
//crash the whole boot. If it fails, uploads will fail later with a 500 -
//but at least the server starts and serves the rest of the app.
const storageDir = join(__dirname, "storage", "files")
const seedDir    = join(__dirname, "seed-files")

//BOOT diagnostics - state captured at server startup so the /_diag endpoint
//and the stdout logs both surface the same numbers.
const bootDiag = {
  startedAt:     new Date().toISOString(),
  storageDir,
  seedDir,
  storageExisted:    existsSync(storageDir),
  seedExisted:       existsSync(seedDir),
  mkdirOk:           false,
  mkdirError:        null as string | null,
  storageFilesAfterMkdir: 0,
  seedFileCount:     0,
  seedCopied:        0,
  seedSkippedReason: null as string | null,
  seedErrors:        [] as string[],
}

console.log(`[boot] ============================`)
console.log(`[boot] Portfolio-Axel server starting`)
console.log(`[boot] NODE_ENV   = ${process.env.NODE_ENV}`)
console.log(`[boot] storageDir = ${storageDir} (exists: ${bootDiag.storageExisted})`)
console.log(`[boot] seedDir    = ${seedDir} (exists: ${bootDiag.seedExisted})`)

try {
  mkdirSync(storageDir, { recursive: true })
  bootDiag.mkdirOk = true
  console.log(`[boot] storage mkdir OK`)
} catch (e: any) {
  bootDiag.mkdirError = String(e?.message ?? e)
  console.error(`[boot] storage mkdir FAILED: ${bootDiag.mkdirError}`)
  console.error(`[boot] uploads + seed copy will both fail`)
}

//count what's currently in storage AFTER the mkdir attempt
try {
  bootDiag.storageFilesAfterMkdir = readdirSync(storageDir).length
} catch { /* dir doesn't exist or unreadable */ }
console.log(`[boot] storage currently contains ${bootDiag.storageFilesAfterMkdir} file(s)`)

//BOOTSTRAP SEED - if the storage volume is empty on first boot, copy the
//pre-baked binaries from /app/seed-files (committed to git, baked into the
//image). Idempotent: once the volume has anything in it, this skips.
try {
  if (!existsSync(seedDir)) {
    bootDiag.seedSkippedReason = "seed dir doesn't exist in image"
    console.log(`[boot] seed: ${bootDiag.seedSkippedReason}`)
  } else {
    const seedFiles = readdirSync(seedDir)
    bootDiag.seedFileCount = seedFiles.length
    console.log(`[boot] seed contains ${seedFiles.length} file(s) available`)

    if (bootDiag.storageFilesAfterMkdir > 0) {
      bootDiag.seedSkippedReason = `storage already has ${bootDiag.storageFilesAfterMkdir} file(s) - skipping seed`
      console.log(`[boot] seed: ${bootDiag.seedSkippedReason}`)
    } else {
      console.log(`[boot] seed: storage is empty, copying ${seedFiles.length} file(s)...`)
      for (const f of seedFiles) {
        try {
          copyFileSync(join(seedDir, f), join(storageDir, f))
          bootDiag.seedCopied++
        } catch (e: any) {
          const msg = `${f}: ${e?.message ?? e}`
          bootDiag.seedErrors.push(msg)
          console.warn(`[boot] seed copy failed for ${msg}`)
        }
      }
      console.log(`[boot] seed: done, copied ${bootDiag.seedCopied}/${seedFiles.length} file(s)`)
    }
  }
} catch (e: any) {
  bootDiag.seedSkippedReason = `unexpected error: ${e?.message ?? e}`
  console.warn(`[boot] seed: ${bootDiag.seedSkippedReason}`)
}

console.log(`[boot] ============================`)

//PUBLIC diagnostic page - no auth. Visit /diag in the browser to see at a
//glance whether the container is running the latest code (build marker),
//whether the storage volume bootstrapped correctly, etc. Plain HTML so it
//renders even with browser caching turned off.
//
//Bumped build marker on every commit so you can SEE the version with one
//URL. If the marker doesn't match the latest commit hash on GitHub, the
//container is stale.
const BUILD_MARKER = "diag-v3-2976663-plus"

app.get(["/diag", "/api/_diag"], (_req, res) => {
  const storageNow = (() => {
    try { return readdirSync(storageDir) } catch { return [] }
  })()

  const ok    = (txt: string) => `<span style="color:#4ade80">${txt}</span>`
  const bad   = (txt: string) => `<span style="color:#f87171">${txt}</span>`
  const muted = (txt: string) => `<span style="color:#9ca3af">${txt}</span>`
  const yesno = (b: boolean) => b ? ok("yes") : bad("no")

  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Portfolio-Axel diag</title>
  <style>
    body { background:#0a0a0a; color:#e5e5e5; font-family:ui-monospace,Consolas,monospace; padding:2rem; line-height:1.6; }
    h1 { font-size:1.6rem; margin:0 0 .5rem; color:#fff; letter-spacing:.05em; text-transform:uppercase; }
    h2 { font-size:.95rem; margin:1.5rem 0 .25rem; color:#9ca3af; letter-spacing:.1em; text-transform:uppercase; border-bottom:1px solid #333; padding-bottom:.25rem; }
    .marker { font-size:1.1rem; background:#1f2937; padding:.5rem 1rem; border-left:3px solid #4ade80; display:inline-block; margin-bottom:1rem; }
    .grid { display:grid; grid-template-columns:max-content 1fr; gap:.25rem 1.5rem; }
    .grid > .key { color:#9ca3af; }
    .grid > .val { color:#e5e5e5; font-weight:bold; }
    pre { background:#1f2937; padding:.75rem; border:1px solid #333; overflow:auto; font-size:.85rem; margin:.5rem 0; }
    .small { color:#6b7280; font-size:.85rem; }
  </style>
</head>
<body>
  <h1>Portfolio-Axel diagnostics</h1>

  <div class="marker">build marker: ${BUILD_MARKER}</div>
  <p class="small">If you don't see this marker (or the green color), your container is on an OLD image - the new build hasn't taken effect.</p>

  <h2>Storage volume</h2>
  <div class="grid">
    <span class="key">Mount path (container)</span>     <span class="val">${storageDir}</span>
    <span class="key">Existed at boot</span>             <span class="val">${yesno(bootDiag.storageExisted)}</span>
    <span class="key">mkdir at boot</span>               <span class="val">${bootDiag.mkdirOk ? ok("ok") : bad(bootDiag.mkdirError ?? "failed")}</span>
    <span class="key">Files after mkdir</span>           <span class="val">${bootDiag.storageFilesAfterMkdir}</span>
    <span class="key">Files RIGHT NOW</span>             <span class="val">${storageNow.length}</span>
  </div>

  <h2>Seed bootstrap (from baked image)</h2>
  <div class="grid">
    <span class="key">Seed dir (in image)</span>        <span class="val">${seedDir}</span>
    <span class="key">Seed exists in image</span>        <span class="val">${yesno(bootDiag.seedExisted)}</span>
    <span class="key">Seed file count</span>             <span class="val">${bootDiag.seedFileCount}</span>
    <span class="key">Copied at boot</span>              <span class="val">${bootDiag.seedCopied > 0 ? ok(String(bootDiag.seedCopied)) : muted(String(bootDiag.seedCopied))}</span>
    <span class="key">Skipped reason</span>              <span class="val">${bootDiag.seedSkippedReason ?? muted("(none)")}</span>
  </div>
  ${bootDiag.seedErrors.length > 0 ? `<pre>${bootDiag.seedErrors.join("\n")}</pre>` : ""}

  <h2>Environment</h2>
  <div class="grid">
    <span class="key">NODE_ENV</span>             <span class="val">${process.env.NODE_ENV ?? muted("(unset)")}</span>
    <span class="key">VITE_AUTH_MODE</span>       <span class="val">${AUTH_MODE}</span>
    <span class="key">DATABASE_URL set</span>     <span class="val">${yesno(Boolean(process.env.DATABASE_URL))}</span>
    <span class="key">BETTER_AUTH_SECRET set</span> <span class="val">${yesno(Boolean(process.env.BETTER_AUTH_SECRET))}</span>
    <span class="key">RESEND_API_KEY set</span>   <span class="val">${yesno(Boolean(process.env.RESEND_API_KEY))}</span>
    <span class="key">GOOGLE_CLIENT_ID set</span> <span class="val">${yesno(Boolean(process.env.GOOGLE_CLIENT_ID))}</span>
  </div>

  <h2>Boot started at</h2>
  <p>${bootDiag.startedAt}</p>

  ${storageNow.length > 0 ? `<h2>First 5 files currently in storage</h2><pre>${storageNow.slice(0, 5).join("\n")}</pre>` : ""}
</body>
</html>`)
})

//UPLOAD ROUTING - uploads are sorted into sub-directories by extension so
//the single storage volume stays organized:
//   storage/files/models/  - .glb / .gltf
//   storage/files/hdri/    - .hdr / .exr / .hdri
//   storage/files/images/  - everything else (jpg, png, webp, mp4, ...)
//Existing files at the root of storage/files/ (pre-split) keep working
//because their stored_filename has no sub-dir prefix and express.static
//still resolves /media/<flat-file> against the root.
function uploadSubdirFor(filename: string): "models" | "hdri" | "images" {
  if (/\.(glb|gltf)$/i.test(filename))       return "models"
  if (/\.(hdr|exr|hdri)$/i.test(filename))   return "hdri"
  return "images"
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      const sub = uploadSubdirFor(file.originalname)
      const dir = join(storageDir, sub)
      mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      const id  = randomUUID()
      const ext = extname(file.originalname).toLowerCase()
      cb(null, `${id}${ext}`)
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, //200 MB - .glb can be chunky
})

//For each upload we store the path RELATIVE to storageDir (with the
//subdir prefix) so /media/<storedFilename> resolves to the right file.
function relativeStoredName(file: Express.Multer.File): string {
  const rel = relative(storageDir, join(file.destination, file.filename)).split("\\").join("/")
  return rel
}

function inferKind(mimeType: string): "image" | "video" | "other" {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  return "other"
}

//GET /api/files - admin only. Returns every row in the file table with a
//reference count: how many portfolio rows currently point at this file id.
//References include direct fk columns AND thumbnail jsonb scans on main_project.
//Used by the file manager UI in /settings.
app.get("/api/files", requireAuth, requireAdmin, async (_req, res) => {
  const result = await db.execute(sql`
    SELECT
      f.id,
      f.original_filename,
      f.stored_filename,
      f.mime_type,
      f.size_bytes,
      f.kind,
      f.created_at,
      (
        COALESCE((SELECT COUNT(*) FROM main_project    WHERE main_image_file_id     = f.id), 0) +
        COALESCE((SELECT COUNT(*) FROM main_project    WHERE main_wireframe_file_id = f.id), 0) +
        COALESCE((SELECT COUNT(*) FROM main_project    WHERE video_file_id          = f.id), 0) +
        COALESCE((SELECT COUNT(*) FROM gallery_project WHERE image_file_id          = f.id), 0) +
        COALESCE((SELECT COUNT(*) FROM software        WHERE logo_file_id           = f.id), 0) +
        COALESCE((
          SELECT COUNT(*)
          FROM main_project mp, jsonb_array_elements(mp.thumbnails) AS thumb
          WHERE thumb->>'fileId' = f.id::text OR thumb->>'wireframeFileId' = f.id::text
        ), 0)
      )::int AS reference_count
    FROM file f
    ORDER BY f.created_at DESC
  `)
  const rows = (result as any).rows ?? result
  res.json(rows.map((row: any) => ({
    id:               row.id,
    originalFilename: row.original_filename,
    storedFilename:   row.stored_filename,
    mimeType:         row.mime_type,
    sizeBytes:        row.size_bytes,
    kind:             row.kind,
    createdAt:        row.created_at,
    referenceCount:   Number(row.reference_count),
    url:              `/media/${row.stored_filename}`,
  })))
})

//DELETE /api/files/orphans - admin only. Bulk-delete every row whose ref
//count is 0. Returns the number actually removed. MUST be declared BEFORE
//"/api/files/:id" so express doesn't match "orphans" as a uuid param.
app.delete("/api/files/orphans", requireAuth, requireAdmin, async (_req, res) => {
  const result = await db.execute(sql`
    SELECT f.id, f.stored_filename FROM file f WHERE
      NOT EXISTS (SELECT 1 FROM main_project    WHERE main_image_file_id     = f.id) AND
      NOT EXISTS (SELECT 1 FROM main_project    WHERE main_wireframe_file_id = f.id) AND
      NOT EXISTS (SELECT 1 FROM main_project    WHERE video_file_id          = f.id) AND
      NOT EXISTS (SELECT 1 FROM gallery_project WHERE image_file_id          = f.id) AND
      NOT EXISTS (SELECT 1 FROM software        WHERE logo_file_id           = f.id) AND
      NOT EXISTS (
        SELECT 1 FROM main_project mp, jsonb_array_elements(mp.thumbnails) AS thumb
        WHERE thumb->>'fileId' = f.id::text OR thumb->>'wireframeFileId' = f.id::text
      )
  `)
  const orphans = ((result as any).rows ?? result) as { id: string; stored_filename: string }[]
  let deleted = 0
  for (const o of orphans) {
    try { unlinkSync(join(storageDir, o.stored_filename)) } catch { /* already gone */ }
    await db.delete(fileTable).where(eq(fileTable.id, o.id))
    deleted++
  }
  res.json({ deletedCount: deleted })
})

//DELETE /api/files/:id - admin only. Removes the row AND the binary on disk.
//Refuses (409) if the file is still referenced anywhere. The UI surfaces the
//ref count so the admin always knows before clicking.
//Declared AFTER /orphans so express's matcher doesn't claim "orphans" as a uuid.
app.delete("/api/files/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id ?? "")
  const [row] = await db.select().from(fileTable).where(eq(fileTable.id, id))
  if (!row) { res.status(404).json({ error: "not found" }); return }

  //reference count for this file
  const refResult = await db.execute(sql`
    SELECT (
      COALESCE((SELECT COUNT(*) FROM main_project    WHERE main_image_file_id     = ${id}::uuid), 0) +
      COALESCE((SELECT COUNT(*) FROM main_project    WHERE main_wireframe_file_id = ${id}::uuid), 0) +
      COALESCE((SELECT COUNT(*) FROM main_project    WHERE video_file_id          = ${id}::uuid), 0) +
      COALESCE((SELECT COUNT(*) FROM gallery_project WHERE image_file_id          = ${id}::uuid), 0) +
      COALESCE((SELECT COUNT(*) FROM software        WHERE logo_file_id           = ${id}::uuid), 0) +
      COALESCE((
        SELECT COUNT(*)
        FROM main_project mp, jsonb_array_elements(mp.thumbnails) AS thumb
        WHERE thumb->>'fileId' = ${id} OR thumb->>'wireframeFileId' = ${id}
      ), 0)
    )::int AS c
  `)
  const refCount = Number(((refResult as any).rows ?? refResult)[0]?.c ?? 0)
  if (refCount > 0) {
    res.status(409).json({ error: "file is still referenced", referenceCount: refCount })
    return
  }

  //best-effort unlink first (DB still wins as source of truth even if unlink fails)
  try {
    unlinkSync(join(storageDir, row.storedFilename))
  } catch (e) {
    console.warn(`[files] disk unlink failed for ${row.storedFilename}:`, e)
  }
  await db.delete(fileTable).where(eq(fileTable.id, id))
  res.json({ ok: true })
})

//POST /api/files - admin only. Returns the new file row + ready-to-use url
app.post("/api/files", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "no file uploaded" })
    return
  }
  //the filename comes from our multer config above as `{uuid}.{ext}` so we
  //can recover the uuid as the file id
  const id = req.file.filename.split(".")[0]!
  const stored = relativeStoredName(req.file)
  const [row] = await db.insert(fileTable).values({
    id,
    originalFilename: req.file.originalname,
    storedFilename:   stored,
    mimeType:         req.file.mimetype,
    sizeBytes:        req.file.size,
    kind:             inferKind(req.file.mimetype),
    uploadedBy:       (req as any).user.id,
  }).returning()
  res.json({ ...row, url: `/media/${row!.storedFilename}` })
})


//PORTFOLIO MUTATIONS ------------------------------------------------------
//PUT routes accept a partial body and only update the fields present in it.
//POST routes create a new row with sensible default placeholders so the
//admin can fill them in inline. DELETE removes the row only; files stay on
//disk and in the `file` table (per project decision).

async function nextSortOrder<T extends { sortOrder: any; id: any }>(table: T): Promise<number> {
  const r = await db.select({ max: sql<number>`coalesce(max(${table.sortOrder}), -1)` }).from(table as any)
  return ((r[0]?.max ?? -1) as number) + 1
}

//MAIN PROJECT ---
app.post("/api/main-project", requireAuth, requireAdmin, async (_req, res) => {
  const sortOrder = await nextSortOrder(mainProject)
  const [row] = await db.insert(mainProject).values({
    modelId:     "",
    title:       { en: "New project", fr: "Nouveau projet" },
    description: { en: "Project description", fr: "Description du projet" },
    thumbnails:  [],
    wireframeParameters: { whiteMaterialColor: "ffffff", lightsOverwrite: [], emissiveMaterialsOverwrite: [] },
    stats:       { vertices: 0, edges: 0, faces: 0, triangles: 0 },
    sortOrder,
  }).returning()
  res.json(row)
})

app.put("/api/main-project/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  const [row] = await db.update(mainProject)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(mainProject.id, id))
    .returning()
  res.json(row)
})

app.delete("/api/main-project/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  await db.delete(mainProject).where(eq(mainProject.id, id))
  res.json({ ok: true })
})

//GALLERY PROJECT ---
app.post("/api/gallery-project", requireAuth, requireAdmin, async (_req, res) => {
  const sortOrder = await nextSortOrder(galleryProject)
  const [row] = await db.insert(galleryProject).values({
    title:       { en: "New gallery item", fr: "Nouvel élément" },
    link:        "",
    stats:       { vertices: 0, edges: 0, faces: 0, triangles: 0 },
    sortOrder,
  }).returning()
  res.json(row)
})

app.put("/api/gallery-project/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  const [row] = await db.update(galleryProject)
    .set(req.body)
    .where(eq(galleryProject.id, id))
    .returning()
  res.json(row)
})

app.delete("/api/gallery-project/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  await db.delete(galleryProject).where(eq(galleryProject.id, id))
  res.json({ ok: true })
})

//EXPERIENCE ---
app.post("/api/experience", requireAuth, requireAdmin, async (_req, res) => {
  const sortOrder = await nextSortOrder(experience)
  const [row] = await db.insert(experience).values({
    period:      { en: "YYYY-YYYY", fr: "AAAA-AAAA" },
    title:       { en: "Role", fr: "Poste" },
    company:     "Company",
    location:    "City",
    summary:     { en: "", fr: "" },
    description: { en: [], fr: [] },
    sortOrder,
  }).returning()
  res.json(row)
})

app.put("/api/experience/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  const [row] = await db.update(experience)
    .set(req.body)
    .where(eq(experience.id, id))
    .returning()
  res.json(row)
})

app.delete("/api/experience/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  await db.delete(experience).where(eq(experience.id, id))
  res.json({ ok: true })
})

//SOFTWARE ---
//POST is multipart: the client uploads the logo image alongside key + url so
//creating a software is a single round-trip instead of two (upload then link).
//The logo lands in the file table the same way a regular /api/files upload
//does, then we insert the software row referencing it.
app.post("/api/software", requireAuth, requireAdmin, upload.single("logo"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "logo file is required" }); return }
  const key = String(req.body?.key ?? "").trim()
  const url = String(req.body?.url ?? "").trim()
  if (!key) { res.status(400).json({ error: "key is required" }); return }

  const fileId = req.file.filename.split(".")[0]!
  const storedRel = relativeStoredName(req.file)
  await db.insert(fileTable).values({
    id:               fileId,
    originalFilename: req.file.originalname,
    storedFilename:   storedRel,
    mimeType:         req.file.mimetype,
    sizeBytes:        req.file.size,
    kind:             inferKind(req.file.mimetype),
    uploadedBy:       (req as any).user?.id ?? null,
  })

  try {
    const sortOrder = await nextSortOrder(software)
    const [row] = await db.insert(software).values({
      key,
      logoFileId: fileId,
      url:        url || "https://",
      sortOrder,
    }).returning()
    res.json(row)
  } catch (e) {
    //software insert failed (unique key collision, etc.) - roll the orphaned
    //file row + binary back so the upload doesn't accumulate dead bytes
    try { unlinkSync(join(storageDir, storedRel)) } catch { /* ignore */ }
    await db.delete(fileTable).where(eq(fileTable.id, fileId)).catch(() => {})
    res.status(409).json({ error: e instanceof Error ? e.message : "software insert failed" })
  }
})

app.put("/api/software/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  const [row] = await db.update(software)
    .set(req.body)
    .where(eq(software.id, id))
    .returning()
  res.json(row)
})

//Deleting a software row also removes its logo file (the user explicitly
//asked for cascading delete - the file would otherwise become an orphan in
//the file table). The file table FK uses ON DELETE RESTRICT, so we have to
//drop the software row FIRST then the file. Junction rows in
//main_project_software cascade automatically via their own ON DELETE.
app.delete("/api/software/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  const [row] = await db.select().from(software).where(eq(software.id, id))
  if (!row) { res.json({ ok: true }); return }

  await db.delete(software).where(eq(software.id, id))

  //check if the logo file is now an orphan (no other software pointing at it)
  const [stillRef] = await db.select({ id: software.id }).from(software).where(eq(software.logoFileId, row.logoFileId)).limit(1)
  if (!stillRef) {
    const [fileRow] = await db.select().from(fileTable).where(eq(fileTable.id, row.logoFileId))
    if (fileRow) {
      try { unlinkSync(join(storageDir, fileRow.storedFilename)) } catch (e) { console.warn(`[software] disk unlink failed:`, e) }
      await db.delete(fileTable).where(eq(fileTable.id, row.logoFileId)).catch(() => {})
    }
  }

  res.json({ ok: true })
})

//VIEWER SETTINGS - the entire editor snapshot (materials / lights / HDR /
//wireframe state) as a single jsonb blob. Frontend posts its full payload
//on Save and we just store it; the viewer applies it on load.
app.put("/api/main-project/:id/viewer-settings", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  await db.update(mainProject)
    .set({ viewerSettings: req.body, updatedAt: new Date() })
    .where(eq(mainProject.id, id))
  res.json({ ok: true })
})

//GET single project - returns the editor everything it needs without
//pulling the whole portfolio. Used by the /edit-3d page.
app.get("/api/main-project/:id", async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  const [row] = await db.select().from(mainProject).where(eq(mainProject.id, id))
  if (!row) { res.status(404).json({ error: "not found" }); return }

  //resolve glb URL the same way the portfolio endpoint does
  let glbUrl: string | null = null
  if (row.glbFileId) {
    const [f] = await db.select({ storedFilename: fileTable.storedFilename })
      .from(fileTable).where(eq(fileTable.id, row.glbFileId))
    if (f) glbUrl = `/media/${f.storedFilename}`
  }
  res.json({ ...row, glbUrl })
})

//MAIN_PROJECT <-> SOFTWARE junction
app.put("/api/main-project/:id/software", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  const softwareIds = req.body.softwareIds as number[]
  if (!Array.isArray(softwareIds)) { res.status(400).json({ error: "softwareIds must be an array" }); return }
  //replace strategy: wipe existing junction rows, re-insert in order
  await db.delete(mainProjectSoftware).where(eq(mainProjectSoftware.mainProjectId, id))
  if (softwareIds.length > 0) {
    await db.insert(mainProjectSoftware).values(
      softwareIds.map((softwareId, i) => ({ mainProjectId: id, softwareId, sortOrder: i }))
    )
  }
  res.json({ ok: true })
})

//PROFILE - singleton, only PUT
app.put("/api/profile", requireAuth, requireAdmin, async (req, res) => {
  const [existing] = await db.select().from(profile).limit(1)
  if (!existing) {
    const [row] = await db.insert(profile).values({
      about:     { en: "", fr: "" },
      contact:   { phone: "", email: "", instagram: "" },
      interests: { games: [], art: [] },
      avatarUrl: "",
      ...req.body,
    }).returning()
    res.json(row); return
  }
  const [row] = await db.update(profile).set(req.body).where(eq(profile.id, existing.id)).returning()
  res.json(row)
})


//TRANSLATIONS - public read so auth pages (no session) can render in the right language.
//returns a flat map { id: value } for the requested language.
app.get("/api/translations", async (req, res) => {
  const lang = String(req.query.lang ?? "en")
  const rows = await db
    .select({ id: translations.id, value: translations.value })
    .from(translations)
    .where(eq(translations.lang, lang))
  const map: Record<string, string> = {}
  for (const r of rows) map[r.id] = r.value
  res.json(map)
})

//upsert a single translation - admin only
app.put("/api/translations/:id", requireAuth, async (req, res) => {
  if ((req as any).user.role !== "admin") {
    res.status(403).json({ error: "admin only" })
    return
  }
  const id = req.params.id as string
  const { lang, value } = req.body
  if (typeof lang !== "string" || typeof value !== "string") {
    res.status(400).json({ error: "lang and value must be strings" })
    return
  }
  await db
    .insert(translations)
    .values({ id, lang, value })
    .onConflictDoUpdate({
      target: [translations.id, translations.lang],
      set: { value },
    })
  res.json({ id, lang, value })
})

//bulk upsert - admin only, accepts { lang: { id: value } } maps
//used by the seed script + by vue-shared-ui composables that need to ensure
//their description keys exist in the DB
app.put("/api/translations", requireAuth, async (req, res) => {
  if ((req as any).user.role !== "admin") {
    res.status(403).json({ error: "admin only" })
    return
  }
  const body = req.body as Record<string, Record<string, string>>
  if (typeof body !== "object" || body === null) {
    res.status(400).json({ error: "body must be an object keyed by lang" })
    return
  }
  const rows: { id: string; lang: string; value: string }[] = []
  for (const lang of Object.keys(body)) {
    for (const id of Object.keys(body[lang])) {
      rows.push({ id, lang, value: body[lang][id]! })
    }
  }
  if (rows.length === 0) {
    res.json({ inserted: 0 })
    return
  }
  await db
    .insert(translations)
    .values(rows)
    .onConflictDoUpdate({
      target: [translations.id, translations.lang],
      set: { value: sql`excluded.value` },
    })
  res.json({ inserted: rows.length })
})


//SETTINGS - common shape, consumed by vue-shared-ui SettingsPage
app.get("/api/settings", requireAuth, async (req, res) => {
  const userId = (req as any).user.id as string
  const rows = await db.select().from(settings).where(eq(settings.userId, userId))
  res.json(rows)
})

//PUT is an upsert - creates the row if missing (with type/description/group/options),
//otherwise updates just the value. Lets vue-shared-ui composables seed their own
//baseline settings (e.g., accent_color) without needing a separate /seed endpoint.
app.put("/api/settings/:key", requireAuth, async (req, res) => {
  const userId = (req as any).user.id as string
  const key = req.params.key as string
  const { value, description, type, group, options } = req.body
  if (typeof value !== "string") {
    res.status(400).json({ error: "value must be a string" })
    return
  }
  const existing = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)))
  if (existing.length === 0) {
    //CREATE
    const inserted = await db.insert(settings).values({
      userId,
      key,
      value,
      description: typeof description === "string" ? description : "",
      type:        typeof type        === "string" ? type        : "string",
      group:       typeof group       === "string" ? group       : "general",
      options:     typeof options     === "string" ? options     : "",
    }).returning()
    res.json(inserted[0])
    return
  }
  //UPDATE value only - keep schema metadata stable once a setting exists
  const updated = await db
    .update(settings)
    .set({ value, updatedAt: new Date() })
    .where(and(eq(settings.userId, userId), eq(settings.key, key)))
    .returning()
  res.json(updated[0])
})


//PORTFOLIO ------------------------------------------------------------------
//public read endpoint - serves the whole portfolio in one fetch so the
//Vue side can render the page from a single API call. File ids are
//resolved to media URLs server-side so the frontend stays unaware of
//storage internals.
app.get("/api/portfolio", async (_req, res) => {
  //load every file row once, then build a lookup from id -> /media URL
  const fileRows = await db.select({ id: fileTable.id, storedFilename: fileTable.storedFilename }).from(fileTable)
  const urlById: Record<string, string> = {}
  for (const f of fileRows) urlById[f.id] = `/media/${f.storedFilename}`

  function urlOf(id: string | null | undefined): string | null {
    return id ? (urlById[id] ?? null) : null
  }

  //SOFTWARE - load all rows so we can attach them to each main project
  const softwareRows = await db
    .select()
    .from(software)
    .orderBy(asc(software.sortOrder), asc(software.id))

  const softwareById: Record<number, typeof softwareRows[number]> = {}
  for (const s of softwareRows) softwareById[s.id] = s

  //MAIN PROJECTS - keep wireframe / stats / thumbnails as-is; resolve file urls
  const mainProjectRows = await db
    .select()
    .from(mainProject)
    .orderBy(asc(mainProject.sortOrder), asc(mainProject.id))

  const mpsRows = await db
    .select()
    .from(mainProjectSoftware)
    .orderBy(asc(mainProjectSoftware.sortOrder))

  const mainProjects = mainProjectRows.map((p) => {
    const projectSoftware = mpsRows
      .filter((j) => j.mainProjectId === p.id)
      .map((j) => softwareById[j.softwareId])
      .filter((s): s is typeof softwareRows[number] => Boolean(s))
      .map((s) => ({ id: s.id, key: s.key, url: s.url, logoFileId: s.logoFileId, logoUrl: urlOf(s.logoFileId) }))

    return {
      id:                  p.id,
      modelId:             p.modelId,
      layout:              p.layout,
      title:               p.title,
      description:         p.description,
      mainImageUrl:        urlOf(p.mainImageFileId),
      mainWireframeUrl:    urlOf(p.mainWireframeFileId),
      videoUrl:            urlOf(p.videoFileId),
      //3D MODEL - when glbFileId is non-null the frontend renders via the
      //local Three.js viewer (using viewerSettings); otherwise it falls
      //back to the Sketchfab iframe (modelId).
      glbFileId:           p.glbFileId,
      glbUrl:              urlOf(p.glbFileId),
      viewerSettings:      p.viewerSettings,
      thumbnails: (p.thumbnails ?? []).map((t) => ({
        //expose both file ids (for round-tripping edits back into the jsonb)
        //and resolved URLs (for direct img/iframe rendering on the client)
        fileId:          t.fileId,
        wireframeFileId: t.wireframeFileId,
        url:             urlOf(t.fileId),
        wireframeUrl:    urlOf(t.wireframeFileId),
        description:     t.description,
      })),
      wireframeParameters: p.wireframeParameters,
      stats:               p.stats,
      software:            projectSoftware,
    }
  })

  //GALLERY PROJECTS
  const galleryRows = await db
    .select()
    .from(galleryProject)
    .orderBy(asc(galleryProject.sortOrder), asc(galleryProject.id))

  const galleryProjects = galleryRows.map((g) => ({
    id:       g.id,
    title:    g.title,
    link:     g.link,
    imageUrl: urlOf(g.imageFileId),
    stats:    g.stats,
  }))

  //EXPERIENCE
  const experienceRows = await db
    .select()
    .from(experience)
    .orderBy(asc(experience.sortOrder), asc(experience.id))

  //PROFILE - only one row
  const [profileRow] = await db.select().from(profile)

  res.json({
    software:        softwareRows.map((s) => ({ id: s.id, key: s.key, url: s.url, logoFileId: s.logoFileId, logoUrl: urlOf(s.logoFileId) })),
    mainProjects,
    galleryProjects,
    experiences:     experienceRows.map((e) => ({
      id:          e.id,
      period:      e.period,
      title:       e.title,
      company:     e.company,
      location:    e.location,
      summary:     e.summary,
      description: e.description,
    })),
    profile: profileRow ? {
      about:     profileRow.about,
      contact:   profileRow.contact,
      interests: profileRow.interests,
      avatarUrl: profileRow.avatarUrl,
    } : null,
  })
})

//MEDIA - static file storage. Files live at storage/files/{stored_filename}
//and are served under /media/{stored_filename}. Public access since portfolio
//media is meant to be visible to everyone.
const mediaDir = join(__dirname, "storage", "files")
app.use("/media", express.static(mediaDir, {
  immutable: true,
  maxAge:    "30d",
}))


//SERVE STATIC FILES IN PRODUCTION
if (isProd) {
  const dist = join(__dirname, "dist")
  app.use(express.static(dist))
  app.get("/{*path}", (_req, res) => {
    res.sendFile(join(dist, "index.html"))
  })
}

//GLOBAL ERROR HANDLER
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: "internal server error" })
})

const port = process.env.PORT ?? 3001
app.listen(port, () => console.log(`server running on http://localhost:${port}`))
