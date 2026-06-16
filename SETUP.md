# Vue + PostgreSQL Template

Vue 3 · TypeScript · Tailwind · Express · Drizzle ORM · PostgreSQL · Better Auth · Resend · vue-shared-ui

What you get out of the box:
- email + password + Google OAuth signup/login, email verification, password reset
- three auth modes: `public` (no auth), `open` (anyone can register), `restricted` (admin approves)
- transactional email via Resend (sandbox in dev, your domain in prod)
- DB-backed `settings` table with 7 typed inputs (bool/string/number/color/select/list/json)
- DB-backed `translations` table - every UI string in fr/en, switch live, public read endpoint
- `theme` (light/dark) + `language` (fr/en) + `accent_color` self-seed on first login
- shadcn-vue minimal set (Button/Card/Input/Label/Dialog/Badge) + reka-ui primitives
- `<AppNav />` responsive top/bottom + gear dropdown
- `<ToastHost />` for global notifications
- Docker + Dokploy deployment ready
- `vue-shared-ui` consumed via GitHub Packages (private scoped registry)

---

## Start a new project

**1. Copy this folder and rename it**

**2. Set up the `GITHUB_TOKEN` env var** (one-time per machine)

`vue-shared-ui` lives on GitHub Packages as a private scoped package `@leeroy-charbonnel/vue-shared-ui`. To install it, your machine needs a Personal Access Token with `read:packages` scope.

Generate a token at https://github.com/settings/tokens?type=beta:
- Token name: `bun-private-deps` (or whatever)
- Resource owner: `Leeroy-Charbonnel`
- Repository access: `vue-shared-ui` (or all private repos if you want one token for everything)
- Permissions: **Account permissions → Packages → Read**
- Generate, copy `github_pat_...`

Persist it on Windows (PowerShell, one-time):
```powershell
[System.Environment]::SetEnvironmentVariable("GITHUB_TOKEN", "github_pat_...", "User")
```
Reopen your terminal so the env var is picked up.

The template's `.npmrc` (committed in the repo) references this var: `${GITHUB_TOKEN}` gets substituted at install time. Nothing secret is committed.

**3. Install dependencies**
```bash
bun install
```

**3. Create the `.env` file**
```bash
cp .env.example .env
```
Fill in at minimum:
```
DATABASE_URL=postgresql://user:password@your-server-ip:5433/dbname
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=http://localhost:3001
PUBLIC_APP_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
```

Then optionally:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — enables the "Continue with Google" button
- `RESEND_API_KEY` — enables email verification + password reset (leave empty in dev to log emails to the console)

**4. Define your tables** in `db/schema.ts`. The template ships:
- `items` — example CRUD table (delete or rename for your app)
- `setting` — common shape per project, drives the shared settings page (do NOT rename or change columns)
- Auth tables: `user`, `session`, `account`, `verification` (better-auth)

**5. Push the schema to the DB**
```bash
bun run db:push
```

**6. Add your API routes** in `server.ts` (the `/api/items` block is the example).

**7. Run**
```bash
bun run server   # terminal 1
bun run dev      # terminal 2
```

App: `http://localhost:5173`

---

## Google OAuth

Each project gets its **own** Google OAuth client (one per project — avoids shared blast radius if one secret leaks, gives clean per-app consent screens).

1. https://console.cloud.google.com → create a project → OAuth consent screen → Credentials → "OAuth 2.0 Client ID" → "Web application"
2. **Authorized JavaScript origins:**
   ```
   http://localhost:3001
   https://your-domain.tld
   ```
3. **Authorized redirect URIs:**
   ```
   http://localhost:3001/api/auth/callback/google
   https://your-domain.tld/api/auth/callback/google
   ```
4. Paste the credentials into `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

Leave both empty to hide the Google button entirely (the template detects missing creds and skips registering the provider).

---

## Email (Resend)

Email verification on sign-up and password reset both go through Resend.

1. Create a free account at https://resend.com (3000 mails/month free)
2. Grab your API key from the dashboard
3. **In dev:** use the sandbox sender — set `EMAIL_FROM=onboarding@resend.dev` (any FROM works, but only deliverable to your own Resend-account email until you verify a domain)
4. **In prod:** verify your domain in Resend (one DNS TXT record), then use `EMAIL_FROM=noreply@your-domain.tld`
5. Paste in `.env`:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM=noreply@your-domain.tld
   APP_NAME=My App
   ```

**Without RESEND_API_KEY**, the template logs the email to the server console instead of sending — useful for local dev. In production, missing the key throws.

To swap providers (SMTP, Postmark, etc.), only `server/email.ts` needs to change — the rest of the code calls `sendEmail({ to, subject, html })`.

---

## DB commands

```bash
bun run db:push      # sync schema to DB (dev)
bun run db:generate  # generate migration files
bun run db:migrate   # run migrations (prod)
bun run db:studio    # visual DB browser
```

---

## Structure

```
db/
  schema.ts          # table definitions (items, setting, user/session/account/verification)
  index.ts           # db connection
server/
  email.ts           # Resend wrapper + verify/reset email templates
src/
  pages/
    HomePage.vue     # empty, yours to fill
    DataPage.vue     # example CRUD UI (/data)
  router/index.ts    # routes + auth guard (shared auth pages from vue-shared-ui)
  composables/
    useTheme.ts      # dark/light toggle
    useLanguage.ts   # fr/en i18n
    useAuth.ts       # session, signIn, signUp, signInWithGoogle, requestPasswordReset, resetPassword, signOut
  lib/
    auth-client.ts   # better-auth Vue client
  locales/
    fr/index.json    # french translations
    en/index.json    # english translations
  App.vue            # provides authKey/themeKey/langKey for vue-shared-ui, mounts <AppNav /> and <ToastHost />
server.ts            # express API (items + settings + better-auth)
auth.ts              # better-auth config (email/password + Google + email verify + reset)
drizzle.config.ts    # drizzle config
.env.example         # env template
Dockerfile           # production build
```

The shared auth pages (Login, Pending, Banned, ForgotPassword, ResetPassword) and the `/settings` page come from `vue-shared-ui` — no files to maintain in this repo.

---

## Settings page (free of charge)

The `/settings` route renders the shared `<SettingsPage />` that lists rows from the `setting` table grouped by `group`. Each row's `type` (`bool` | `string` | `number` | `json`) drives the input rendered.

Seed a setting from your app:
```ts
import { db } from "./db/index"
import { setting } from "./db/schema"

await db.insert(setting).values({
  userId,
  key:         "notifications_enabled",
  value:       "true",
  description: "Send a daily summary email",
  type:        "bool",
  group:       "notifications",
})
```

Then the row appears automatically in `/settings`. Hide the "All settings" link in the gear dropdown by passing `<AppNav :show-settings="false">` in `App.vue`.

---

## Auth modes

Set `VITE_AUTH_MODE` to one of:

| Mode | Behavior |
|---|---|
| `public` | No auth required, Better Auth is unused |
| `open` | Account required, anyone can register |
| `restricted` | Account required, admin must approve each user |

In `restricted` mode:
- The **first user to register** is automatically `admin`
- New users get role `pending` and see the shared waiting screen
- Admin approves by changing the role to `user` via Drizzle Studio
- After approval, the user must log out and log back in

---

## User roles

Managed via the `role` column in the `user` table (Drizzle Studio).

| Role | Description |
|---|---|
| `pending` | Registered but not yet approved — restricted mode only |
| `user` | Normal access |
| `admin` | First registered user — same access as `user` for now |
| `banned` | Blocked from all access, sees `/banned` page |

---

## Production env

Add these to Dokploy:
```
DATABASE_URL=postgresql://user:password@nom-du-service-db:5432/dbname
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=https://mon-projet.somerandomcreator.com
PUBLIC_APP_URL=https://mon-projet.somerandomcreator.com
ALLOWED_ORIGINS=https://mon-projet.somerandomcreator.com
VITE_AUTH_MODE=open
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@mon-projet.somerandomcreator.com
APP_NAME=Mon Projet

#REQUIRED to install @leeroy-charbonnel/vue-shared-ui from GitHub Packages
#create a fine-grained PAT at https://github.com/settings/tokens?type=beta
#scope: Packages -> Read (under Account permissions)
GITHUB_TOKEN=github_pat_...
```

---

## How to extend the template

Recipes for the most common things you'll do on top of the scaffolding. Each recipe lists the file(s) to touch and the order to do it in.

### Add a new page

1. Create the Vue component: `src/pages/MyPage.vue`
2. Wire the route in `src/router/index.ts`:
   ```ts
   import MyPage from "../pages/MyPage.vue"
   // ...
   { path: "/my-page", component: MyPage, meta: { requiresAuth: true } }
   ```
3. Add a nav link in `src/App.vue`:
   ```vue
   <RouterLink to="/my-page" class="nav-link">{{ lang.t('myPageNav') }}</RouterLink>
   ```
4. Add the translation key for the nav label (see "Add a translation" below)

### Add a translation

1. Edit `src/locales/seed-translations.json` - add the key in both `fr` and `en`:
   ```json
   "fr": { "myPageNav": "Ma page" },
   "en": { "myPageNav": "My page" }
   ```
2. Run `bun run seed:i18n` (idempotent; upserts existing rows)
3. Use it in any component: `{{ t('myPageNav') }}`

If the key is missing at runtime, the UI shows the raw key + a `console.warn` (per project rule: no silent fallback).

### Add a new database table

1. Add the table in `db/schema.ts`:
   ```ts
   export const expense = pgTable("expense", {
     id:        serial("id").primaryKey(),
     userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
     amount:    integer("amount").notNull(),
     createdAt: timestamp("created_at").notNull().defaultNow(),
   })
   ```
2. `bun run db:push` to sync the schema
3. Use it in `server.ts` for API routes (see "Add an API route" below)

### Add an API route

1. In `server.ts`, after the auth middleware definition, register the route:
   ```ts
   app.get("/api/expenses", requireAuth, async (req, res) => {
     const userId = (req as any).user.id as string
     const rows = await db.select().from(expense).where(eq(expense.userId, userId))
     res.json(rows)
   })
   ```
2. Always scope to the current user via `(req as any).user.id` unless the route is genuinely global.
3. Use `requireAuth` middleware on every route that touches user data. Public read endpoints (translations) skip it deliberately.

### Add a user setting

1. Call the setting from a composable or page (it auto-seeds on first write):
   ```ts
   const { update } = useSettings()
   await update("dark_mode_strength", "0.8", {
     type:        "number",
     description: "SETTING_dark_mode_strength_DESC",
     group:       "appearance",
   })
   ```
2. Add translations for the label + description in `seed-translations.json`:
   ```json
   "SETTING_dark_mode_strength_LABEL": "Dark mode strength",
   "SETTING_dark_mode_strength_DESC":  "How aggressive the dark mode is (0-1)"
   ```
3. `bun run seed:i18n` - the new keys appear, the setting now shows up in `/settings` automatically with the right input type

### Add a navigation entry on the AppNav

1. In `src/App.vue` inside `<template #links>`, add a `<RouterLink>` with a translated label

### Read the user's accent color anywhere

```ts
import { useSettings } from "vue-shared-ui"
const { getString } = useSettings()
const hex = getString("accent_color", "#0891b2")
```

But you usually don't need to - the CSS `--primary` var already updates live when accent_color changes.

### Show a toast

```ts
import { useToast } from "vue-shared-ui"
const { success, error, info, warning } = useToast()
success("Saved!")
error("Something blew up")
```

`<ToastHost />` is mounted once in App.vue; you only call the composable.

### Add a confirmation dialog

The template ships shadcn-vue's `Dialog`. Use it directly:
```vue
<Dialog v-model:open="isOpen">
  <DialogContent>
    <DialogTitle>Are you sure?</DialogTitle>
    <DialogFooter>
      <Button variant="outline" @click="isOpen = false">Cancel</Button>
      <Button variant="destructive" @click="onConfirm">Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Updating vue-shared-ui

When the shared package gets a new release on GitHub Packages:

```bash
bun update vue-shared-ui
```

The version range in `package.json` is `^0.2.0` so minor + patch updates pick up automatically. For a major bump, edit `package.json` manually.

**Publishing a new version of vue-shared-ui** (do this in the `vue-shared-ui` repo):
1. Bump version in `package.json` (e.g. `0.2.1` → `0.2.2`)
2. Commit + push to main
3. The GitHub Action publishes to the registry automatically

**Local dev across both repos**: if you're editing `vue-shared-ui` in parallel, use `bun link`:
```bash
cd C:/Projects/Code/vue-shared-ui
bun link

cd C:/Projects/Code/your-project
bun link vue-shared-ui   # uses local source until you bun unlink
```

---

## Local vs Production DB

The `.env` local uses the **external** URL (access from your PC):
```
DATABASE_URL=postgresql://user:password@46.225.225.3:5432/dbname
```

Dokploy uses the **internal** URL (between containers on the VPS):
```
DATABASE_URL=postgresql://user:password@nom-du-service-db:5432/dbname
```

Same DB, different network path.

**Schema change workflow:**
1. Edit `db/schema.ts` locally
2. `bun run db:push` locally (external connection)
3. Push to git → Dokploy rebuilds automatically

---

## Domain (Namecheap)

Each project gets its own subdomain. Namecheap → **Advanced DNS** → add an A record:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `mon-projet` | `46.225.225.3` | Automatic |

The project is reachable at `mon-projet.somerandomcreator.com`.

---

## Dokploy

- Build type: **Dockerfile**
- Dockerfile path: `./Dockerfile`
- Container port: `3000`
- Domain: `mon-projet.somerandomcreator.com` — empty path, Let's Encrypt on
- Add all the env vars listed above
