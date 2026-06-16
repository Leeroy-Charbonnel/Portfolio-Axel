#!/usr/bin/env bun
//SEED the translations table from src/locales/seed-translations.json.
//Idempotent: re-running just upserts the same rows.
//
//Usage: bun run seed:i18n

import { db } from "../db/index"
import { translations } from "../db/schema"
import { sql } from "drizzle-orm"
import seed from "../src/locales/seed-translations.json"

async function main() {
  const rows: { id: string; lang: string; value: string }[] = []
  for (const lang of Object.keys(seed)) {
    const dict = (seed as Record<string, Record<string, string>>)[lang]!
    for (const id of Object.keys(dict)) {
      rows.push({ id, lang, value: dict[id]! })
    }
  }
  console.log(`upserting ${rows.length} translation rows...`)

  await db
    .insert(translations)
    .values(rows)
    .onConflictDoUpdate({
      target: [translations.id, translations.lang],
      set:    { value: sql`excluded.value` },
    })

  console.log("done")
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
