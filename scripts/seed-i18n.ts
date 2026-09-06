#!/usr/bin/env bun
//SEED the translations table from src/locales/seed-translations.json.
//
//INSERTS THE MISSING KEYS AND TOUCHES NOTHING ELSE. The entrypoint runs this on
//every deploy, and the same table is edited from the admin screens: an upsert
//would quietly hand every edited label back to whatever the JSON file says, on
//each deploy. The file is the source for keys that do not exist yet; the
//database is the source for their text.
//
//Usage: bun run seed:i18n

import { db } from "../db/index"
import { translations } from "../db/schema"
import seed from "../src/locales/seed-translations.json"

async function main() {
  const rows: { id: string; lang: string; value: string }[] = []
  for (const lang of Object.keys(seed)) {
    const dict = (seed as Record<string, Record<string, string>>)[lang]!
    for (const id of Object.keys(dict)) {
      rows.push({ id, lang, value: dict[id]! })
    }
  }
  console.log(`seeding ${rows.length} translation rows (existing ones are left alone)...`)

  const inserted = await db
    .insert(translations)
    .values(rows)
    .onConflictDoNothing({ target: [translations.id, translations.lang] })
    .returning({ id: translations.id })

  console.log(`done: ${inserted.length} new row(s), ${rows.length - inserted.length} already present`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
