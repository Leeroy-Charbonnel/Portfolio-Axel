import express from "express"
import cors from "cors"
import helmet from "helmet"
import multer from "multer"
import { join, extname } from "path"
import { mkdirSync } from "fs"
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
const storageDir = join(__dirname, "storage", "files")
mkdirSync(storageDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: storageDir,
    filename: (_req, file, cb) => {
      const id  = randomUUID()
      const ext = extname(file.originalname).toLowerCase()
      cb(null, `${id}${ext}`)
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, //100 MB per file - large enough for short videos
})

function inferKind(mimeType: string): "image" | "video" | "other" {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  return "other"
}

//POST /api/files - admin only. Returns the new file row + ready-to-use url
app.post("/api/files", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "no file uploaded" })
    return
  }
  //the filename comes from our multer config above as `{uuid}.{ext}` so we
  //can recover the uuid as the file id
  const id = req.file.filename.split(".")[0]!
  const [row] = await db.insert(fileTable).values({
    id,
    originalFilename: req.file.originalname,
    storedFilename:   req.file.filename,
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
    stats:       { vertices: 0, edges: 0, faces: 0 },
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
    stats:       { vertices: 0, edges: 0 },
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
app.post("/api/software", requireAuth, requireAdmin, async (_req, res) => {
  const sortOrder = await nextSortOrder(software)
  //find first file row to use as a logo placeholder; if no files exist yet the
  //admin must upload one before the row can be inserted (logoFileId is not null)
  const [firstFile] = await db.select({ id: fileTable.id }).from(fileTable).limit(1)
  if (!firstFile) { res.status(400).json({ error: "upload at least one logo file before adding software" }); return }
  const [row] = await db.insert(software).values({
    key:        `Software ${sortOrder + 1}`,
    logoFileId: firstFile.id,
    url:        "https://",
    sortOrder,
  }).returning()
  res.json(row)
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

app.delete("/api/software/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? ""), 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: "bad id" }); return }
  await db.delete(software).where(eq(software.id, id))
  res.json({ ok: true })
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
      .map((s) => ({ key: s.key, url: s.url, logoUrl: urlOf(s.logoFileId) }))

    return {
      id:                  p.id,
      modelId:             p.modelId,
      layout:              p.layout,
      title:               p.title,
      description:         p.description,
      mainImageUrl:        urlOf(p.mainImageFileId),
      mainWireframeUrl:    urlOf(p.mainWireframeFileId),
      videoUrl:            urlOf(p.videoFileId),
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
    software:        softwareRows.map((s) => ({ key: s.key, url: s.url, logoUrl: urlOf(s.logoFileId) })),
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
