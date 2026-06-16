import express from "express"
import cors from "cors"
import helmet from "helmet"
import { join } from "path"
import { fileURLToPath } from "url"
import { toNodeHandler, fromNodeHeaders } from "better-auth/node"
import { auth } from "./auth"
import { db } from "./db/index"
import { settings, translations } from "./db/schema"
import { eq, and, sql } from "drizzle-orm"

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
