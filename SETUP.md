# Portfolio Axel - setup

Vue 3 · TypeScript · Tailwind · Express · Drizzle ORM · PostgreSQL · Better Auth · Resend · Three.js

The public site is a portfolio. The content behind it lives in the database and
is edited in place, on the page itself, by the single admin account.

---

## Run it locally

```bash
bun install
cp .env.example .env
```

Fill `DATABASE_URL` (the dev database, through the SSH tunnel) and
`BETTER_AUTH_SECRET` (`openssl rand -base64 32`). Then:

```bash
bun run db:push        # create the tables in the dev database
bun run seed:i18n      # interface labels, inserts the missing keys only
bun run dev            # vite on 5173, express on 3001
```

Vite proxies `/api` and `/media` to the Express server on 3001.

There is no `GITHUB_TOKEN` and no `.npmrc`. The shared package this used to
install from a private registry is gone: the template is copied into the repo,
never linked.

---

## The single account

This site has exactly one account and it is the admin.

1. Open `/login` and register. Nothing links to that address; you type it.
2. Promote the row by hand, which is the only way in:
   ```sql
   UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
   ```
3. Restart the app. `enforceSingleAccount()` runs at boot and deletes every
   account that is not the admin.

From the moment one account exists, `/sign-up/email` answers 400 to everyone.
Sign-up cannot grant the admin role, `/update-user` cannot set it, and no API
route accepts it as a value.

Forgot the password: `/forgot-password` sends a reset link through Resend. With
`RESEND_API_KEY` empty the link is printed to the server log instead.
`EMAIL_FROM` must be on a domain verified in Resend - the sandbox sender is
refused at boot, since it only ever delivers to the Resend account owner.

---

## Content

Everything on the page is a row: `main_project`, `gallery_project`,
`experience`, `software`, `model_3d`, `profile`. There is no JSON file to edit -
sign in, switch on edit mode from the gear, and change the page directly.

Images, models and HDRIs are uploaded through the same screens, stored at
`storage/files/{uuid}{ext}` and served from `/media`. Rows in the `file` table
can be removed; the bytes on disk stay.

Uploads accept raster images, video, `.glb` / `.gltf` and `.hdr` / `.exr` only.
`.svg` and `.html` are refused on purpose: `/media` serves from the site's own
origin, so either one would run its script as if the site had written it.

---

## Deploy

ONE Dokploy compose service named `stack` holds everything.

| Service | Reached by | Host port |
|---|---|---|
| `app` | Traefik, through the Dokploy domain | none, `expose: 3000` |
| `db` | the app, by service name | `127.0.0.1:$DB_HOST_PORT` |
| `db-dev` | nothing inside the stack | `127.0.0.1:$DB_DEV_HOST_PORT` |

Both database ports are bound to 127.0.0.1, so an SSH tunnel is the only way in.
Pick two ports no other project uses - read the list, do not guess:

```bash
ssh vps "ss -tlnp | grep :54"
```

`docker-entrypoint.sh` applies the migrations and seeds the interface labels
before serving. Generate and commit a migration whenever `db/schema.ts` changes:

```bash
bun run db:generate
```

The `storage` volume holds the uploads at `/app/storage/files`. Dokploy's managed
database backups only cover its own database service type, so set up a Volume
Backup on this compose service instead.

Local commands go through the tunnel: `db:push` and `db:studio` reach `db-dev`
via `DATABASE_URL`, `db:push:prod` and `db:studio:prod` reach `db` via
`PROD_DATABASE_URL`.

### Refreshing dev from prod

```bash
ssh vps "docker exec axel-stack-<suffix>-db-1 pg_dump -U axel -Fc axel > /root/prod.dump"
ssh vps "docker cp /root/prod.dump axel-stack-<suffix>-db-dev-1:/tmp/prod.dump"
ssh vps "docker exec axel-stack-<suffix>-db-dev-1 pg_restore -U axel -d axel_dev --no-owner --clean --if-exists /tmp/prod.dump"
```

Run these from PowerShell: the ssh in Git Bash does not see the Windows key
agent, and the failed attempts get the IP banned by fail2ban.
