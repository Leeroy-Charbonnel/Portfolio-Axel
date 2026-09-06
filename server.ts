//FIRST IMPORT ON PURPOSE: it refuses to start when a required variable is
//missing, before anything else opens a pool or builds an auth instance
import { ALLOWED_ORIGINS } from "./env"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import multer from "multer"
import { join, extname, relative } from "path"
import { mkdirSync, unlinkSync, readdirSync } from "fs"
import { fileURLToPath } from "url"
import { randomUUID } from "crypto"
import { toNodeHandler, fromNodeHeaders } from "better-auth/node"
import { auth, enforceSingleAccount } from "./auth"
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
  model3d,
} from "./db/schema"
import { eq, and, asc, sql, type SQL } from "drizzle-orm"

const app       = express()

//ONE PROXY IN FRONT: Traefik. Without this, req.ip is the proxy's address for
//every visitor, which is what better-auth rate-limits on and what a session row
//records as ipAddress.
app.set("trust proxy", 1)
const isProd    = process.env.NODE_ENV === "production"
const __dirname = fileURLToPath(new URL(".", import.meta.url))

type SessionUser = typeof auth.$Infer.Session.user

const allowedOrigins = ALLOWED_ORIGINS

//SECURITY HEADERS
app.use(helmet({
  contentSecurityPolicy:   false,
  strictTransportSecurity: isProd ? { maxAge: 31536000 } : false,
}))

//CORS - credentials required for better-auth cookies
app.use(cors({ origin: allowedOrigins, credentials: true }))

//AUTH HANDLER - must be before express.json()
app.all("/api/auth/{*path}", toNodeHandler(auth))

//ViewerSettings save payloads can include serialized hdr URLs, dozens
//of materials + lights + emissive entries. The default 100kb cap was
//bouncing them with a bare 500. 10mb gives headroom for any realistic
//model without changing intent (we still reject huge files via multer).
app.use(express.json({ limit: "10mb" }))

//FILES LIVE ONLY ON THE PRODUCTION VOLUME. Dev is read-only for files: reads hit
//prod's /media through the vite proxy, and every upload or delete happens on the
//prod site itself, in admin edit mode. A dev server therefore REFUSES file writes
//rather than quietly dropping binaries on a local disk, which would desync the
//rows from the volume they point at.
//
//The tunnel that used to forward those writes to production has been removed. It
//carried a shared-secret header that stood in for an admin session, so a request
//holding it was served as `{ id: null, role: "admin" }` without any session at
//all. The compose file never passed either variable, so it was dead in
//production and alive only as a way in.
function requireProdStorage(res: express.Response): boolean {
  if (isProd) return true
  console.error("[files] REFUSED local write - upload files from the PROD site (admin edit mode); dev never stores binaries locally")
  res.status(500).json({
    error: "uploads are disabled in dev",
    detail: "files live on the prod volume only - do this upload on the prod site (admin edit mode)",
  })
  return false
}

//AUTH MIDDLEWARE
async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  //Forward-secret bypass: prod accepts forwarded requests from a trusted
  //local Express (the user already passed local auth before the forward).
  //user.id is left null so the file table FK stays valid (uploaded_by has
  //onDelete: set null, so null is acceptable here).
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) {
    res.status(401).json({ error: "unauthorized" })
    return
  }
  //There is one account on this site and it is the admin, so a session is only
  //the first half of the question - requireAdmin below asks the other half. The
  //"banned" and "pending" branches that used to sit here are gone with the roles
  //themselves: an account that is not the admin can do nothing, and the boot
  //deletes it.
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

//ROUTE HELPERS - thin wrappers that handlers were re-implementing
//inline 10-14 times each. Keeping behaviour identical (same status
//codes, same body shape) so this is a pure factorisation.
function parseIntParam(req: express.Request, key: string, res: express.Response): number | null {
  const n = parseInt(String(req.params[key] ?? ""), 10)
  if (Number.isNaN(n)) {
    res.status(400).json({ error: `bad ${key}` })
    return null
  }
  return n
}
function respondOk(res: express.Response): void {
  res.json({ ok: true })
}

//UUID route params (file ids, model_3d ids). Same contract as parseIntParam:
//responds 400 + returns null on garbage so handlers can early-return.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function parseUuidParam(req: express.Request, key: string, res: express.Response): string | null {
  const v = String(req.params[key] ?? "")
  if (!UUID_RE.test(v)) {
    res.status(400).json({ error: `bad ${key}` })
    return null
  }
  return v
}

//postgres.js returns arrays, node-postgres wraps them in { rows } - normalize once
function rowsOf<T = any>(result: unknown): T[] {
  return ((result as any).rows ?? result) as T[]
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

//The bootstrap that used to copy pre-baked binaries from /app/seed-files on an
//empty volume has been removed with the bootDiag object that reported on it:
//seed-files/ is in .gitignore and the image is built from the repository, so the
//directory was never there and the branch logged "doesn't exist in image" on
//every boot. Uploads are what fills this volume.
//
//mkdir is wrapped so a permission problem on the mount cannot take the boot
//down with it: uploads then fail one by one with a 500, and the rest is served.
console.log(`[boot] Portfolio-Axel starting, NODE_ENV=${process.env.NODE_ENV}`)
try {
  mkdirSync(storageDir, { recursive: true })
  console.log(`[boot] storage ready at ${storageDir}, ${readdirSync(storageDir).length} entry(ies)`)
} catch (e) {
  console.error(`[boot] storage mkdir FAILED at ${storageDir} - every upload will 500:`, e)
}

//UPLOAD ROUTING - uploads are sorted into sub-directories by extension so
//the single storage volume stays organized:
//   storage/files/models/  - .glb / .gltf
//   storage/files/hdri/    - .hdr / .exr / .hdri
//   storage/files/images/  - everything else (jpg, png, webp, mp4, ...)
//Existing files at the root of storage/files/ (pre-split) keep working
//because their stored_filename has no sub-dir prefix and express.static
//still resolves /media/<flat-file> against the root.
//200 MB - a .glb can be chunky
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

//No .svg and no .html: both are documents that carry script, and /media serves
//this directory to the browser on the site's own origin. Raster images, video,
//3D models and environment maps only.
const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif",
  ".mp4", ".webm",
  ".glb", ".gltf",
  ".hdr", ".exr", ".hdri",
])

//a .glb arrives as application/octet-stream or model/gltf-binary depending on
//the browser, and an .hdr has no registered type at all
//A file refused here is a bad request, and the client is an admin who needs to
//read why. Without the status the global handler below answers "internal server
//error" with a 500 for a wrong extension.
function refused(message: string): Error & { status?: number } {
  return Object.assign(new Error(message), { status: 400 })
}

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "model/",
  "application/octet-stream",
]

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
  limits: { fileSize: MAX_UPLOAD_BYTES },
  //WHAT MAY BE STORED, DECIDED HERE AND NOWHERE ELSE. /media serves this
  //directory as static files on the site's own origin, so an .svg or an .html
  //accepted here runs its script in a visitor's browser as if the site had
  //written it. The extension comes from the client's filename and cannot be
  //trusted on its own: both it and the declared type have to be on the list.
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(refused(`extension not allowed: ${ext || "(none)"}`))
      return
    }
    if (!ALLOWED_MIME_PREFIXES.some(prefix => file.mimetype.startsWith(prefix))) {
      cb(refused(`content type not allowed: ${file.mimetype}`))
      return
    }
    cb(null, true)
  },
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

//a model row whose file has been deleted is a broken reference, not an empty
//field: the viewer gets "" either way, the log is what makes it findable
function logMissingFile(modelId: string, fileId: string): string {
  console.error(`[models] model ${modelId} points at file ${fileId}, which has no row`)
  return ""
}

//FILE REFERENCE COUNT - single source of truth for "which rows point at a
//file id". GET /api/files, DELETE /api/files/orphans and DELETE /api/files/:id
//all derive from this one expression, so a new FK to `file` is added HERE
//and nowhere else. Covers direct fk columns, main_project.thumbnails jsonb,
//model_3d assets, the profile avatar (stored as a /media URL string, not a
//FK - matched via stored_filename) and every detail-page block shape:
//fileId (image / video), beforeFileId / afterFileId (compare) and
//items[].fileId (carousel).
function fileRefCountSql(idExpr: SQL): SQL {
  return sql`(
    COALESCE((SELECT COUNT(*) FROM main_project    WHERE main_image_file_id     = ${idExpr}), 0) +
    COALESCE((SELECT COUNT(*) FROM main_project    WHERE main_wireframe_file_id = ${idExpr}), 0) +
    COALESCE((SELECT COUNT(*) FROM main_project    WHERE video_file_id          = ${idExpr}), 0) +
    COALESCE((SELECT COUNT(*) FROM gallery_project WHERE image_file_id          = ${idExpr}), 0) +
    COALESCE((SELECT COUNT(*) FROM software        WHERE logo_file_id           = ${idExpr}), 0) +
    COALESCE((SELECT COUNT(*) FROM model_3d        WHERE glb_file_id = ${idExpr} OR thumbnail_file_id = ${idExpr}), 0) +
    COALESCE((
      SELECT COUNT(*)
      FROM profile p, file fa
      WHERE fa.id = ${idExpr} AND p.avatar_url = '/media/' || fa.stored_filename
    ), 0) +
    COALESCE((
      SELECT COUNT(*)
      FROM main_project mp, jsonb_array_elements(mp.thumbnails) AS thumb
      WHERE thumb->>'fileId' = (${idExpr})::text OR thumb->>'wireframeFileId' = (${idExpr})::text
    ), 0) +
    COALESCE((
      SELECT COUNT(*)
      FROM main_project mp2, jsonb_array_elements(mp2.detail_page->'blocks') AS blk
      WHERE blk->'content'->>'fileId'       = (${idExpr})::text
         OR blk->'content'->>'beforeFileId' = (${idExpr})::text
         OR blk->'content'->>'afterFileId'  = (${idExpr})::text
    ), 0) +
    COALESCE((
      SELECT COUNT(*)
      FROM main_project mp3,
           jsonb_array_elements(mp3.detail_page->'blocks') AS blk2,
           jsonb_array_elements(COALESCE(blk2->'content'->'items', '[]'::jsonb)) AS item
      WHERE item->>'fileId' = (${idExpr})::text
    ), 0)
  )::int`
}

//GET /api/files - admin only. Returns every row in the file table with a
//reference count: how many portfolio rows currently point at this file id.
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
      ${fileRefCountSql(sql.raw("f.id"))} AS reference_count
    FROM file f
    ORDER BY f.created_at DESC
  `)
  const rows = rowsOf(result)
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
  if (!requireProdStorage(res)) return
  //HDRs (.hdr/.exr/.hdri) and 3D models (.glb/.gltf) are KEPT even when
  //unreferenced - the author swaps between them in the editor picker,
  //so deleting them just because no project currently points at one
  //would force a re-upload. The orphan sweep only nukes image-like
  //files (and other random uploads).
  const result = await db.execute(sql`
    SELECT f.id, f.stored_filename FROM file f WHERE
      f.original_filename !~* '\.(hdr|exr|hdri|glb|gltf)$' AND
      ${fileRefCountSql(sql.raw("f.id"))} = 0
  `)
  const orphans = rowsOf<{ id: string; stored_filename: string }>(result)
  let deleted = 0
  for (const o of orphans) {
    try {
      unlinkSync(join(storageDir, o.stored_filename))
    } catch (e) {
      //row still gets removed - DB is source of truth - but leave a trace
      console.warn(`[files] orphan disk unlink failed for ${o.stored_filename}:`, e)
    }
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
  if (!requireProdStorage(res)) return
  //Garbage ids used to hit the ::uuid cast below and 500 - validate first.
  const id = parseUuidParam(req, "id", res)
  if (id === null) return
  const [row] = await db.select().from(fileTable).where(eq(fileTable.id, id))
  if (!row) { res.status(404).json({ error: "not found" }); return }

  //reference count for this file - same expression as the list + orphan routes
  const refResult = await db.execute(sql`SELECT ${fileRefCountSql(sql`${id}::uuid`)} AS c`)
  const refCount = Number(rowsOf<{ c: number }>(refResult)[0]?.c ?? 0)
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
  respondOk(res)
})

//POST /api/files - admin only. Returns the new file row + ready-to-use url
app.post("/api/files", requireAuth, requireAdmin, async (req, res, next) => {
  if (!requireProdStorage(res)) return
  upload.single("file")(req, res, async (err: unknown) => {
    if (err) return next(err)
    if (!req.file) {
      res.status(400).json({ error: "no file uploaded" })
      return
    }
    //filename = `{uuid}.{ext}` per our multer config so the file id is
    //recoverable from it without a separate column.
    const id = req.file.filename.split(".")[0]!
    const stored = relativeStoredName(req.file)
    try {
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
    } catch (e) {
      //DB insert failed - remove the binary so the volume doesn't
      //accumulate dead bytes (same rollback the software route does).
      try {
        unlinkSync(join(storageDir, stored))
      } catch (unlinkErr) {
        console.warn(`[files] rollback unlink failed for ${stored}:`, unlinkErr)
      }
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[files] upload insert failed:", msg)
      res.status(500).json({ error: "file insert failed", detail: msg })
    }
  })
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
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  const [row] = await db.update(mainProject)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(mainProject.id, id))
    .returning()
  if (!row) { res.status(404).json({ error: "not found" }); return }
  res.json(row)
})

app.delete("/api/main-project/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  await db.delete(mainProject).where(eq(mainProject.id, id))
  respondOk(res)
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
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  const [row] = await db.update(galleryProject)
    .set(req.body)
    .where(eq(galleryProject.id, id))
    .returning()
  if (!row) { res.status(404).json({ error: "not found" }); return }
  res.json(row)
})

app.delete("/api/gallery-project/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  await db.delete(galleryProject).where(eq(galleryProject.id, id))
  respondOk(res)
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
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  const [row] = await db.update(experience)
    .set(req.body)
    .where(eq(experience.id, id))
    .returning()
  if (!row) { res.status(404).json({ error: "not found" }); return }
  res.json(row)
})

app.delete("/api/experience/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  await db.delete(experience).where(eq(experience.id, id))
  respondOk(res)
})

//SOFTWARE ---
//POST is multipart: the client uploads the logo image alongside key + url so
//creating a software is a single round-trip instead of two (upload then link).
//The logo lands in the file table the same way a regular /api/files upload
//does, then we insert the software row referencing it.
app.post("/api/software", requireAuth, requireAdmin, async (req, res, next) => {
  if (!requireProdStorage(res)) return
  upload.single("logo")(req, res, async (err: unknown) => {
    if (err) return next(err)
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
      //file row + binary back so the upload doesn't accumulate dead bytes.
      //Rollback failures are logged: a leftover orphan is worth a trace.
      try {
        unlinkSync(join(storageDir, storedRel))
      } catch (unlinkErr) {
        console.warn(`[software] rollback unlink failed for ${storedRel}:`, unlinkErr)
      }
      await db.delete(fileTable).where(eq(fileTable.id, fileId))
        .catch((dbErr) => console.warn(`[software] rollback file-row delete failed for ${fileId}:`, dbErr))
      res.status(409).json({ error: e instanceof Error ? e.message : "software insert failed" })
    }
  })
})

app.put("/api/software/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  const [row] = await db.update(software)
    .set(req.body)
    .where(eq(software.id, id))
    .returning()
  if (!row) { res.status(404).json({ error: "not found" }); return }
  res.json(row)
})

//Deleting a software row also removes its logo file (the user explicitly
//asked for cascading delete - the file would otherwise become an orphan in
//the file table). The file table FK uses ON DELETE RESTRICT, so we have to
//drop the software row FIRST then the file. Junction rows in
//main_project_software cascade automatically via their own ON DELETE.
app.delete("/api/software/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  const [row] = await db.select().from(software).where(eq(software.id, id))
  if (!row) { respondOk(res); return }

  await db.delete(software).where(eq(software.id, id))

  //check if the logo file is now an orphan (no other software pointing at it)
  const [stillRef] = await db.select({ id: software.id }).from(software).where(eq(software.logoFileId, row.logoFileId)).limit(1)
  if (!stillRef) {
    const [fileRow] = await db.select().from(fileTable).where(eq(fileTable.id, row.logoFileId))
    if (fileRow) {
      try { unlinkSync(join(storageDir, fileRow.storedFilename)) } catch (e) { console.warn(`[software] disk unlink failed:`, e) }
      await db.delete(fileTable).where(eq(fileTable.id, row.logoFileId))
        .catch((e) => console.warn(`[software] logo file-row delete failed for ${row.logoFileId}:`, e))
    }
  }

  respondOk(res)
})

//Resolve a file id to its public /media URL (null when the id is null or
//the file row is gone). Shared by the single-model / single-project GETs.
async function mediaUrlFor(fileId: string | null): Promise<string | null> {
  if (!fileId) return null
  const [f] = await db.select({ storedFilename: fileTable.storedFilename })
    .from(fileTable).where(eq(fileTable.id, fileId))
  return f ? `/media/${f.storedFilename}` : null
}

//MODEL_3D CRUD - reusable 3D assets. Files (.glb + thumbnail) must
//already exist in the file table (use POST /api/files first); these
//endpoints only handle the model_3d row.
app.get("/api/models", requireAuth, requireAdmin, async (_req, res) => {
  const rows = await db.select().from(model3d).orderBy(asc(model3d.name), asc(model3d.id))
  res.json(rows)
})

//GET single model - the 3D editor (/edit-3d/:modelId) calls this on
//load. URLs resolved server-side so the page can hand them straight
//to ThreeViewer / loadGlb.
app.get("/api/models/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseUuidParam(req, "id", res)
  if (id === null) return
  const [row] = await db.select().from(model3d).where(eq(model3d.id, id))
  if (!row) { res.status(404).json({ error: "not found" }); return }
  const glbUrl       = await mediaUrlFor(row.glbFileId)
  const thumbnailUrl = await mediaUrlFor(row.thumbnailFileId)
  res.json({ ...row, glbUrl, thumbnailUrl })
})

//PUT viewerSettings (full replacement of the JSON blob).
app.put("/api/models/:id/viewer-settings", requireAuth, requireAdmin, async (req, res) => {
  const id = parseUuidParam(req, "id", res)
  if (id === null) return
  try {
    const [row] = await db.update(model3d)
      .set({ viewerSettings: req.body, updatedAt: new Date() })
      .where(eq(model3d.id, id))
      .returning({ id: model3d.id })
    if (!row) { res.status(404).json({ error: "not found" }); return }
    respondOk(res)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[/api/models/${id}/viewer-settings] update failed:`, msg)
    res.status(500).json({ error: "viewer-settings update failed", detail: msg })
  }
})

//PARTIAL save - patches ONLY startView / startViewMobile inside
//viewerSettings. Mirrors /api/main-project/:id/viewer-settings/
//start-view; the editor uses it for fast "save current camera"
//captures that shouldn't clobber materials / lights / HDR state.
app.put("/api/models/:id/viewer-settings/start-view", requireAuth, requireAdmin, async (req, res) => {
  const id = parseUuidParam(req, "id", res)
  if (id === null) return
  try {
    const [row] = await db.select({ viewerSettings: model3d.viewerSettings })
      .from(model3d).where(eq(model3d.id, id))
    if (!row) { res.status(404).json({ error: "not found" }); return }
    const current = (row.viewerSettings as Record<string, unknown> | null) ?? {}
    const next: Record<string, unknown> = { ...current }
    if ("startView"       in (req.body ?? {})) next.startView       = req.body.startView       ?? null
    if ("startViewMobile" in (req.body ?? {})) next.startViewMobile = req.body.startViewMobile ?? null
    await db.update(model3d)
      .set({ viewerSettings: next, updatedAt: new Date() })
      .where(eq(model3d.id, id))
    respondOk(res)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[/api/models/${id}/viewer-settings/start-view] update failed:`, msg)
    res.status(500).json({ error: "start-view update failed", detail: msg })
  }
})

app.post("/api/models", requireAuth, requireAdmin, async (req, res) => {
  const { name, glbFileId, thumbnailFileId, views, viewerSettings } = req.body ?? {}
  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "name required" }); return }
  if (typeof glbFileId !== "string" || !glbFileId) { res.status(400).json({ error: "glbFileId required" }); return }
  const [row] = await db.insert(model3d).values({
    name:            name.trim(),
    glbFileId,
    thumbnailFileId: typeof thumbnailFileId === "string" ? thumbnailFileId : null,
    views:           Array.isArray(views) ? views : [],
    viewerSettings:  viewerSettings ?? null,
  }).returning()
  res.status(201).json(row)
})

app.put("/api/models/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseUuidParam(req, "id", res)
  if (id === null) return
  //Only patch fields the caller actually sent - keeps the Views tab
  //from clobbering viewerSettings, and the Material tab from clobbering
  //views, etc.
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof req.body?.name === "string")            patch.name            = req.body.name.trim()
  if (typeof req.body?.glbFileId === "string")       patch.glbFileId       = req.body.glbFileId
  if ("thumbnailFileId" in (req.body ?? {}))         patch.thumbnailFileId = req.body.thumbnailFileId
  if (Array.isArray(req.body?.views))                patch.views           = req.body.views
  if ("viewerSettings" in (req.body ?? {}))          patch.viewerSettings  = req.body.viewerSettings
  try {
    const [row] = await db.update(model3d).set(patch).where(eq(model3d.id, id)).returning({ id: model3d.id })
    if (!row) { res.status(404).json({ error: "not found" }); return }
    respondOk(res)
  } catch (e) {
    //Surface the actual DB error (FK violation, type mismatch, etc.)
    //so the client toast shows something diagnosable instead of a bare 500.
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[/api/models/${id}] update failed:`, msg)
    res.status(500).json({ error: "model update failed", detail: msg })
  }
})

//DELETE - refuses if the model is still referenced by a project (FK
//set-null would silently break the project's viewer) OR by any
//viewer3d detail-page block (jsonb, no FK). Returns 409 + the list
//of usages so the admin can clean up first.
app.delete("/api/models/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseUuidParam(req, "id", res)
  if (id === null) return
  const usages = await findModelUsages(id)
  if (usages.length > 0) {
    res.status(409).json({ error: "model in use", usages })
    return
  }
  await db.delete(model3d).where(eq(model3d.id, id))
  respondOk(res)
})

//Helper - where-used scan for a model id. Hits both main_project.model3dId
//and main_project.detailPage.blocks[type=viewer3d].content.model3dId.
//Returns a flat list { projectId, kind: "main" | "block", blockId? }.
async function findModelUsages(modelId: string): Promise<Array<{ projectId: number; kind: "main" | "block"; blockId?: string }>> {
  const out: Array<{ projectId: number; kind: "main" | "block"; blockId?: string }> = []
  const direct = await db.select({ id: mainProject.id }).from(mainProject).where(eq(mainProject.model3dId, modelId))
  for (const r of direct) out.push({ projectId: r.id, kind: "main" })
  const all = await db.select({ id: mainProject.id, detailPage: mainProject.detailPage }).from(mainProject)
  for (const r of all) {
    const blocks = (r.detailPage?.blocks ?? []) as Array<{ id: string; type: string; content: Record<string, unknown> }>
    for (const b of blocks) {
      if (b.type === "viewer3d" && b.content?.model3dId === modelId) {
        out.push({ projectId: r.id, kind: "block", blockId: b.id })
      }
    }
  }
  return out
}

//The two /api/main-project/:id/viewer-settings routes that used to sit here are
//gone: the editor saves through /api/models/:id/viewer-settings, and nothing in
//the front end ever called these. The mainProject.viewerSettings column stays -
//it still holds data for all four projects and useEffectiveViewerSettings reads
//it as a fallback - so dropping it is a data migration, not a cleanup.

//GET single project - returns the editor everything it needs without
//pulling the whole portfolio. Used by the /edit-3d page.
app.get("/api/main-project/:id", async (req, res) => {
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  const [row] = await db.select().from(mainProject).where(eq(mainProject.id, id))
  if (!row) { res.status(404).json({ error: "not found" }); return }

  //resolve glb URL the same way the portfolio endpoint does
  const glbUrl = await mediaUrlFor(row.glbFileId)
  res.json({ ...row, glbUrl })
})

//MAIN_PROJECT <-> SOFTWARE junction
app.put("/api/main-project/:id/software", requireAuth, requireAdmin, async (req, res) => {
  const id = parseIntParam(req, "id", res)
  if (id === null) return
  const softwareIds = req.body.softwareIds as number[]
  if (!Array.isArray(softwareIds)) { res.status(400).json({ error: "softwareIds must be an array" }); return }
  //replace strategy: wipe existing junction rows, re-insert in order
  await db.delete(mainProjectSoftware).where(eq(mainProjectSoftware.mainProjectId, id))
  if (softwareIds.length > 0) {
    await db.insert(mainProjectSoftware).values(
      softwareIds.map((softwareId, i) => ({ mainProjectId: id, softwareId, sortOrder: i }))
    )
  }
  respondOk(res)
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
app.put("/api/translations/:id", requireAuth, requireAdmin, async (req, res) => {
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
//used by the seed script + by the composables that need to ensure
//their description keys exist in the DB
app.put("/api/translations", requireAuth, requireAdmin, async (req, res) => {
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


//SETTINGS - common shape, consumed by SettingsPage.
//Admin like every other mutating route: /settings is an admin screen, and these
//were the only two that stopped at requireAuth. An account created before the
//promotion lives until the next boot, and could write rows here in the meantime.
app.get("/api/settings", requireAuth, requireAdmin, async (req, res) => {
  const userId = (req as any).user.id as string
  const rows = await db.select().from(settings).where(eq(settings.userId, userId))
  res.json(rows)
})

//PUT is an upsert - creates the row if missing (with type/description/group/options),
//otherwise updates just the value. Lets the composables seed their own baseline
//settings without needing a separate /seed endpoint.
app.put("/api/settings/:key", requireAuth, requireAdmin, async (req, res) => {
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
      //3D MODEL - canonical reference now lives on model_3d. Project
      //picks which named view to render per breakpoint.
      model3dId:           p.model3dId,
      model3dDesktopView:  p.model3dDesktopView,
      model3dMobileView:   p.model3dMobileView,
      //LEGACY - kept on the response while the migration runs so any
      //pre-migration project can still render. Removed in a follow-up.
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
      //DETAIL PAGE blocks - resolve every file reference into a /media
      //url in the same shape the editor expects on round-trip:
      //fileId (image / video), beforeFileId / afterFileId (compare),
      //items[].fileId (carousel).
      detailPage: {
        blocks: ((p.detailPage?.blocks ?? []) as Array<{
          id: string; type: string; x: number; y: number; w: number; h: number;
          mobileY?: number; mobileH?: number;
          content: Record<string, unknown>
        }>).map((b) => {
          if (b.type === "image" || b.type === "video") {
            const fid = (b.content?.fileId as string | null | undefined) ?? null
            return { ...b, content: { ...b.content, fileId: fid, url: urlOf(fid) } }
          }
          if (b.type === "compare") {
            const before = (b.content?.beforeFileId as string | null | undefined) ?? null
            const after  = (b.content?.afterFileId  as string | null | undefined) ?? null
            return { ...b, content: {
              ...b.content,
              beforeFileId: before, beforeUrl: urlOf(before),
              afterFileId:  after,  afterUrl:  urlOf(after),
            } }
          }
          if (b.type === "carousel" || b.type === "marquee") {
            const items = Array.isArray(b.content?.items) ? b.content.items as Array<Record<string, unknown>> : []
            return { ...b, content: {
              ...b.content,
              items: items.map((it) => ({ ...it, url: urlOf((it.fileId as string | null | undefined) ?? null) })),
            } }
          }
          return b
        }),
      },
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

  //EDITOR PREFS - the admin's editor3d_* settings rows. Public viewers
  //(ThreeViewer) need them so global wireframe knobs (line color, mode
  //color, shared material) override the per-project values that got
  //frozen into viewerSettings at save time. Picks any admin's row - in
  //a single-author portfolio there's only one user anyway.
  const editorPrefRows = await db.execute(sql`
    SELECT s.key, s.value
    FROM settings s
    JOIN "user" u ON u.id = s.user_id
    WHERE u.role = 'admin' AND s.key LIKE 'editor3d_%'
    ORDER BY s.user_id, s.key
  `)
  const editorPrefMap: Record<string, string> = {}
  for (const r of rowsOf<{ key: string; value: string }>(editorPrefRows)) {
    if (!(r.key in editorPrefMap)) editorPrefMap[r.key] = r.value
  }
  const editorPrefs = {
    wireframeLineColor: editorPrefMap["editor3d_wireframe_line_color"] ?? null,
    wireframeModeColor: editorPrefMap["editor3d_wireframe_mode_color"] ?? null,
    wireframeMaterial:  editorPrefMap["editor3d_wireframe_material"]   ?? null,
  }

  //3D MODELS - reusable assets referenced by MainProject.model3dId and
  //by viewer3d detail-page blocks. URLs resolved here so the client
  //picker and ThreeViewer can use them directly.
  const model3dRows = await db
    .select()
    .from(model3d)
    .orderBy(asc(model3d.name), asc(model3d.id))
  const models = model3dRows.map((m) => ({
    id:              m.id,
    name:            m.name,
    glbFileId:       m.glbFileId,
    //glbFileId is NOT NULL in the schema, so an empty url here means the file row
    //it points at has gone: say so rather than shipping "" to a viewer that will
    //fail on it without a reason
    glbUrl:          urlOf(m.glbFileId) ?? logMissingFile(m.id, m.glbFileId),
    thumbnailFileId: m.thumbnailFileId,
    thumbnailUrl:    urlOf(m.thumbnailFileId),
    viewerSettings:  m.viewerSettings,
    views:           m.views ?? [],
  }))

  res.json({
    software:        softwareRows.map((s) => ({ id: s.id, key: s.key, url: s.url, logoFileId: s.logoFileId, logoUrl: urlOf(s.logoFileId) })),
    models,
    mainProjects,
    galleryProjects,
    editorPrefs,
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
  //Belt on top of the upload allowlist: whatever is stored here, the browser
  //must not sniff it into active content on this origin.
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
  },
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
//An error that names its own status says so on purpose - a refused upload, for
//one. Anything else is ours and stays a 500 with no detail.
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  if (err.status && err.status < 500) {
    res.status(err.status).json({ error: err.message })
    return
  }
  res.status(500).json({ error: "internal server error" })
})

const port = process.env.PORT ?? 3001

app.listen(port, async () => {
  console.log(`server running on http://localhost:${port}`)

  //ONE ACCOUNT ON THIS SITE. Promotion to admin is an UPDATE run in the
  //database, so this is the first moment the app can see it: once an admin
  //exists, every other account is deleted. Registration is already refused
  //while any account exists, so this only has something to remove when someone
  //got there before the promotion did.
  try {
    const removed = await enforceSingleAccount()
    if (removed > 0) console.log(`[boot] removed ${removed} account(s) that were not the admin`)
  } catch (err) {
    //not fatal, and not silent: the server has no useful work without the
    //database anyway, and the next boot tries again
    console.error("[boot] could not enforce the single-account rule:", err)
  }
})
