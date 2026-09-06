#!/bin/sh
#The production database lives inside the compose stack and publishes its port on
#127.0.0.1 only, so it cannot be reached from a laptop without a tunnel. Schema
#changes are applied here, at boot, rather than by running db:push by hand.
#
#Both steps are idempotent: migrate applies only the files it has not seen, and
#seed-i18n upserts.
set -e

echo "[entrypoint] applying migrations"
bunx drizzle-kit migrate --config=drizzle.config.ts

echo "[entrypoint] seeding interface labels"
bun scripts/seed-i18n.ts

echo "[entrypoint] starting server"
exec bun server.ts
