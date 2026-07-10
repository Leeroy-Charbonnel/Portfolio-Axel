//MIGRATION - model_3d.id: serial (1, 2, 3...) -> uuid.
//
//Rewrites everything that points at a model id:
//  - model_3d.id itself (new uuid PK, gen_random_uuid())
//  - main_project.model_3d_id (FK, backfilled through the old int id)
//  - main_project.detail_page blocks[type=viewer3d].content.model3dId (jsonb)
//
//Idempotent: exits cleanly if model_3d.id is already uuid. Runs in a single
//transaction - any failure rolls the whole thing back.
//
//Run with: bun scripts/migrate-model3d-uuid.ts

import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set - aborting")
  process.exit(1)
}

const sql = postgres(url, { ssl: false, max: 1 })

//idempotence guard - bail out if a previous run already converted the column
const [col] = await sql`
  SELECT data_type FROM information_schema.columns
  WHERE table_name = 'model_3d' AND column_name = 'id'
`
if (!col) {
  console.error("model_3d table not found - aborting")
  await sql.end()
  process.exit(1)
}
if (col.data_type === "uuid") {
  console.log("model_3d.id is already uuid - nothing to do")
  await sql.end()
  process.exit(0)
}

//link count BEFORE, to verify the backfill lost nothing
const [{ count: linkedBefore }] = await sql`
  SELECT COUNT(*)::int AS count FROM main_project WHERE model_3d_id IS NOT NULL
`
console.log(`main_project rows linked to a model before migration: ${linkedBefore}`)

await sql.begin(async (tx) => {
  //1 - add the new uuid columns alongside the old ints
  await tx`ALTER TABLE model_3d ADD COLUMN id_new uuid NOT NULL DEFAULT gen_random_uuid()`
  await tx`ALTER TABLE main_project ADD COLUMN model_3d_id_new uuid`

  //2 - backfill the FK through the old int id
  await tx`
    UPDATE main_project mp SET model_3d_id_new = m.id_new
    FROM model_3d m WHERE mp.model_3d_id = m.id
  `
  const [{ count: linkedAfter }] = await tx`
    SELECT COUNT(*)::int AS count FROM main_project WHERE model_3d_id_new IS NOT NULL
  `
  if (Number(linkedAfter) !== Number(linkedBefore)) {
    throw new Error(`FK backfill mismatch: ${linkedBefore} linked rows before, ${linkedAfter} after - rolling back`)
  }

  //3 - old int -> new uuid mapping, for the jsonb rewrites + the log
  const mapping = await tx`SELECT id, id_new, name FROM model_3d ORDER BY id`
  console.log("id mapping:")
  const byOldId = new Map<number, string>()
  for (const r of mapping) {
    byOldId.set(Number(r.id), String(r.id_new))
    console.log(`  ${r.id} -> ${r.id_new}  (${r.name})`)
  }

  //4 - rewrite viewer3d detail-page blocks (content.model3dId was a number)
  const projects = await tx`SELECT id, detail_page FROM main_project`
  for (const p of projects) {
    const blocks = p.detail_page?.blocks
    if (!Array.isArray(blocks)) continue
    let changed = false
    const nextBlocks = blocks.map((b: any) => {
      if (b?.type !== "viewer3d" || typeof b?.content?.model3dId !== "number") return b
      const mapped = byOldId.get(b.content.model3dId) ?? null
      if (mapped === null) {
        console.warn(`  project ${p.id} block ${b.id}: model3dId ${b.content.model3dId} has no matching model - set to null`)
      }
      changed = true
      return { ...b, content: { ...b.content, model3dId: mapped } }
    })
    if (changed) {
      const nextDetailPage = { ...p.detail_page, blocks: nextBlocks }
      await tx`UPDATE main_project SET detail_page = ${tx.json(nextDetailPage)} WHERE id = ${p.id}`
      console.log(`  project ${p.id}: viewer3d block ids rewritten`)
    }
  }

  //5 - swap the columns: drop old FK + PK + int columns, promote the uuids
  await tx`ALTER TABLE main_project DROP CONSTRAINT IF EXISTS main_project_model_3d_id_model_3d_id_fk`
  await tx`ALTER TABLE main_project DROP COLUMN model_3d_id`
  await tx`ALTER TABLE main_project RENAME COLUMN model_3d_id_new TO model_3d_id`
  await tx`ALTER TABLE model_3d DROP CONSTRAINT model_3d_pkey`
  await tx`ALTER TABLE model_3d DROP COLUMN id`
  await tx`ALTER TABLE model_3d RENAME COLUMN id_new TO id`
  await tx`ALTER TABLE model_3d ADD PRIMARY KEY (id)`
  await tx`
    ALTER TABLE main_project ADD CONSTRAINT main_project_model_3d_id_model_3d_id_fk
    FOREIGN KEY (model_3d_id) REFERENCES model_3d(id) ON DELETE SET NULL
  `
})

//post-checks outside the transaction
const [{ count: models }] = await sql`SELECT COUNT(*)::int AS count FROM model_3d`
const [{ count: linked }] = await sql`SELECT COUNT(*)::int AS count FROM main_project WHERE model_3d_id IS NOT NULL`
console.log(`done: ${models} model(s), ${linked} linked project(s) (expected ${linkedBefore})`)

await sql.end()
