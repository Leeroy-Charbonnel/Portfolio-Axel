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

6. **Settings table schema is FIXED across projects:** `key / value / description / type / group / options / userId`. The vue-shared-ui `<SettingsPage />` reads this exact shape. Adding a setting = inserting a row, not changing the schema.

7. **Prefer module-scoped composables over `provide`/`inject` for shared state.** Inject is fragile (Symbol identity bugs across reloads, optimizer caches, etc.). `useAuth`, `useTheme`, `useLang`, `useSettings` etc. are all module-level refs - import and use directly.

8. **One CSS color system: shadcn-vue HSL (`--primary`, `--background`, `--foreground`, etc.).** Every other token (`--color-primary`, `--text-main`, `--vsui-*`) must DERIVE from these. Changing one HSL var should flow through the whole UI.

9. **`useAccent()` writes to `--primary` in HSL.** The accent_color setting is the single knob that retints the whole app.

## Behavior

10. **No speculative features.** Don't add a flag, env var, helper, or abstraction "in case we need it later". If a real requirement appears, add it then.

11. **Fix the root cause, not the symptom.** Don't `git checkout .` the broken file, don't `--no-verify` past a failing hook, don't catch and ignore the error. Find why it broke.

12. **Secrets never in committed files.** No tokens, no passwords, no API keys in `package.json`, `.env.example`, source code, or comments. Real `.env` is gitignored; `.env.example` shows the keys with empty values only.

12. **Bun + private GitHub repos: use GitHub Packages.** Don't write custom postinstall scripts to clone the dep. Don't use `file:` for cross-project sharing (breaks on Windows because of `.git` folders). The vue-shared-ui workflow is the reference: scoped package, `.npmrc` + `${GITHUB_TOKEN}`, Dokploy passes the token as a Build-time Argument.

13. **When in doubt, ask. When sure, ship.** Don't ask three confirmations for a small reversible change. Don't push twenty commits trying to rebuild a feature that the user already validated once.

---

## Tech baseline

- Vue 3 + TypeScript (strict mode, no `any` unless explicitly justified)
- Bun as runtime + package manager
- Express + Drizzle ORM + Postgres
- Better Auth (email/password + Google OAuth) with createAppAuth factory from vue-shared-ui
- Resend for transactional email
- Tailwind + shadcn-vue (HSL color tokens)
- vue-shared-ui (GitHub Packages) for: useToast, useAuth, useTheme, useLang, useSettings, useAccent, AppNav, ToastHost, Login/Pending/Banned/Forgot/Reset/Settings pages, structural CSS variables

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
| A composable | `src/composables/` for project-only logic. If it's truly reusable across projects, propose it for `vue-shared-ui` |
| A reusable Vue component | `src/components/` for project-only. shadcn-vue primitives in `src/components/ui/<name>/` |
| A shadcn-vue component the template doesn't ship yet | Copy the component folder from a fit-tracker / trading-bot installation, or run `npx shadcn-vue add <name>` |
| A chart | Add `chart.js + vue-chartjs` to deps if needed; chart components live in `src/components/charts/` per project (not shared - too domain-specific) |
| A modal / dialog | Use the shadcn-vue `Dialog` primitives (already in the template). Don't reinvent. |
| A toast | `useToast()` from `vue-shared-ui`. `<ToastHost />` is already mounted in `src/App.vue`. |
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
