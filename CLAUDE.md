# Project rules (read every time before writing code)

These rules apply to this project and every project that descends from this template (it's copied to new repos along with the rest of the template). Treat them as a contract: violating any of them is a regression even if the code "works".

---

## Code style

1. **All code comments in English.** Even when chatting in French, comments stay English. No mixed-language files.

2. **Never combine `border-left` (or any single-side border) with `border-radius`** on the same element. They render ugly corners. Pick one: full border + radius, or single-side border + no radius.

3. **CSS variables for every meaningful value.** No hardcoded hex/px/rem in component CSS. If a token doesn't exist yet, add it to the canonical scale (shadcn HSL vars + `--vsui-space-*` / `--vsui-radius` / etc.) and reuse it. The only allowed hardcoded values: `0`, `100%`, `auto`, fully transparent.

4. **No silent fallbacks.** If something fails, surface it: throw, toast, log loudly. Don't `?? default`, don't `try/catch { /*ignore*/ }`, don't return a placeholder hoping the user won't notice. Empty data is fine, hidden errors are not.

## Architecture

5. **If a value lives in the DB, it does NOT live in localStorage.** Pick one source of truth. The settings table is the canonical store for user preferences (theme, language, accent_color, etc.).

6. **Settings table schema is FIXED across projects:** `key / value / description / type / group / options / userId`. `SettingsPage.vue` reads this exact shape. Adding a setting = inserting a row, not changing the schema.

7. **Prefer module-scoped composables over `provide`/`inject` for shared state.** Inject is fragile (Symbol identity bugs across reloads, optimizer caches, etc.). `useAuth`, `useTheme`, `useLang`, `useSettings` etc. are all module-level refs - import and use directly.

8. **One CSS color system: shadcn-vue HSL (`--primary`, `--background`, `--foreground`, etc.).** Every other token (`--color-primary`, `--text-main`, `--vsui-*`) must DERIVE from these. Changing one HSL var should flow through the whole UI.

9. **`useAccent()` writes to `--primary` in HSL.** The accent_color setting is the single knob that retints the whole app.

## Behavior

10. **No speculative features.** Don't add a flag, env var, helper, or abstraction "in case we need it later". If a real requirement appears, add it then.

11. **Fix the root cause, not the symptom.** Don't `git checkout .` the broken file, don't `--no-verify` past a failing hook, don't catch and ignore the error. Find why it broke.

12. **Secrets never in committed files.** No tokens, no passwords, no API keys in `package.json`, `.env.example`, source code, or comments. Real `.env` is gitignored; `.env.example` shows the keys with empty values only.

12. **The template is copied, not linked.** There is no shared UI package. Auth pages, composables, tokens and the nav live in this repo, duplicated from the template. That is deliberate: the shared package meant a private registry, an `.npmrc`, a `GITHUB_TOKEN` build arg in Dokploy, and a version bump to ship a one-line fix. The cost is real - a fix to `LoginPage` has to be copied per project - and it is the cheaper side. It was also where the privilege escalation lived.

13. **When in doubt, ask. When sure, ship.** Don't ask three confirmations for a small reversible change. Don't push twenty commits trying to rebuild a feature that the user already validated once.

---

## Tech baseline

- Vue 3 + TypeScript (strict mode, no `any` unless explicitly justified)
- Bun as runtime + package manager
- Express + Drizzle ORM + Postgres
- Better Auth (email + password only), configured in `auth.ts`
- Resend for transactional email
- Tailwind + shadcn-vue (HSL color tokens)
- Shipped in-repo: useToast, useAuth, useTheme, useLang, useSettings, useTranslations, ToastHost, Login/Forgot/Reset/Settings pages, structural CSS variables in `src/tokens.css`

## Anti-patterns spotted in past work

- Auto-seeding random "example" rows in the DB at user request - we removed that, only `accent_color`/`theme`/`language` self-seed via their composables.
- Two parallel theme stores (localStorage + DB) - resolved: DB only.
- Provide/inject for cross-package state - resolved: module composables.
- Custom postinstall to fetch private deps - resolved: GitHub Packages + `.npmrc`.

---

## Where to put what (file locations)

When you (or Claude) extend this template, drop new code in the right place. The full how-to with copy-pasteable snippets is in `SETUP.md` under "How to extend". Quick reference:

| What you're adding | Where it goes |
|---|---|
| A new route / page | New file in `src/pages/`, wire it in `src/router/index.ts`, link from `src/App.vue` nav |
| A translatable string | `src/locales/seed-translations.json` (fr + en) then `bun run seed:i18n` |
| A new DB table | `db/schema.ts`, then `bun run db:push` |
| An API route | `server.ts`, always behind `requireAuth` unless deliberately public, scope by `req.user.id` |
| A user setting | Call `useSettings().update(key, value, {type, description, group, options})` once anywhere - it self-seeds. Add the `SETTING_<key>_LABEL` and `SETTING_<key>_DESC` translations |
| A composable | `src/composables/`. If it is reusable across projects, add it to the template so future clones get it |
| A reusable Vue component | `src/components/` for project-only. shadcn-vue primitives in `src/components/ui/<name>/` |
| A shadcn-vue component the template doesn't ship yet | Copy the component folder from a fit-tracker / trading-bot installation, or run `npx shadcn-vue add <name>` |
| A chart | Add `chart.js + vue-chartjs` to deps if needed; chart components live in `src/components/charts/` per project (not shared - too domain-specific) |
| A modal / dialog | Use the shadcn-vue `Dialog` primitives (already in the template). Don't reinvent. |
| A toast | `useToast()` from `src/composables/useToast`. `<ToastHost />` is already mounted in `src/App.vue`. |
| A new env var | `.env.example` (with empty / placeholder value), then your local `.env`, then production env in Dokploy. Never commit a real value. |

## What NOT to add to the template

These belong in the consuming project, not in the template:
- Charts (only fit-tracker and trading-bot use them today)
- Three.js / 3D rendering (geo-quizz only)
- Background polling loops (trading-bot only)
- File upload handlers
- Domain-specific composables (`useExercises`, `usePortfolios`, `useQuiz`)
- Project-specific DB tables (`exercise`, `portfolio`, `question`)

The template stays minimal so cloning it for a new app means deleting nothing.

## What NOT to do when extending

- Don't add a new composable for theme/lang/accent - they already exist and are DB-backed
- Don't add a new localStorage key for user preferences - use the `settings` table
- Don't add provide/inject for cross-page state - use a module-scoped ref in a composable
- Don't duplicate translations across locale files manually - the seed JSON is the single source
- Don't add `border-left: ...; border-radius: ...` on the same element (rule #2)
- Don't catch errors silently. Surface them via a toast or `console.warn` at minimum (rule #4)

---

# One account, one role

This site has exactly one account and it is the admin. No invite, no role
granted through the app, no auth mode.

The sign-up form on /login stays: it is how the first account is created, once.
It answers 400 to everyone from the moment an account exists, so it is a door
that closes behind the person who walks through it.

- `emailAndPassword` is on, but a `before` hook on `/sign-up/email` refuses the
  request as soon as one account exists. The first registration is the only one.
- `role` is declared `input: false`. Without that line better-auth accepts the
  field from the client on sign-up and on `/update-user`, which is exactly how
  the shared package let anyone make themselves an admin.
- The `create.before` database hook forces `role: "user"`. Nothing in the app
  writes `"admin"`. Promotion is one statement, run by hand:
  `UPDATE "user" SET role = 'admin' WHERE email = '...';`
- `enforceSingleAccount()` runs at boot: once an admin exists, every other
  account is deleted. Sessions, accounts and settings cascade with the row.
- Nothing links to `/login`. It is reached by typing the address.
- `pending` and `banned` are gone with the roles. A role that is not `admin` can
  do nothing, and the next boot removes it.

`/` and `/project/:id` are public: the detail page renders read-only for
everyone and only becomes an editor when `useAdmin().editMode` is on.
`/settings` and `/edit-3d/:id` carry `requiresAdmin`.

# Uploads

`server.ts` accepts files on the admin-only routes and serves `storage/files`
under `/media`. Three things are load-bearing:

- `fileFilter` checks the extension against a list AND the declared type against
  a prefix list. `.svg` and `.html` are not on it: `/media` serves from the
  site's own origin, so either one would run its script as if the site had
  written it.
- the stored name is `{uuid}{ext}`, generated here, never the client's.
- `/media` sends `X-Content-Type-Options: nosniff`.

Files are never deleted from disk: rows can go from the `file` table, the bytes
stay.

# The i18n seed inserts, it does not overwrite

`scripts/seed-i18n.ts` runs on every boot and the `translations` table is edited
from the admin screens. It uses `onConflictDoNothing`: the JSON file seeds keys
that do not exist yet, the database owns their text. An upsert there handed
every edited label back to the file, once per deploy.

# One stack, two databases

ONE Dokploy compose service named `stack` holds the app, the production database
and the dev database. Rule 10 is kept - one service per project, no standalone
database on the shared dokploy-network - and the second database costs a host
port instead of a second service.

| Service | Reached by | Host port |
|---|---|---|
| `app` | Traefik, through the Dokploy domain | none, `expose: 3000` |
| `db` | the app, by service name | `127.0.0.1:5449`, for the SSH tunnel |
| `db-dev` | nothing inside the stack | `127.0.0.1:5450`, for the SSH tunnel |

The app is wired to `db` and must stay that way. The standalone database this
replaced published `0.0.0.0:5440`, which put it on the internet; both ports here
are bound to loopback. The `storage` volume holds the uploads at
`/app/storage/files` and replaces the mount that was declared in the Dokploy UI.

postgres:18 matches what production ran, and the volume is mounted at
`/var/lib/postgresql`, not `.../data`: 18 stores the cluster in a version
subdirectory and refuses to start when the mount sits on the old path.
