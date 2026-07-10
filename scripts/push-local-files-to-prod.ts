//PUSH LOCAL FILES TO PROD - repair tool for binaries that were wrongly
//written to the local storage/ folder while their file rows landed in the
//prod DB (dev server running without the FILES_FORWARD tunnel).
//
//For every file under storage/files/ that prod's /media does NOT serve:
//  1. find its file row in the DB (by stored_filename)
//  2. upload the binary to prod via POST /api/files + the forward secret
//     (prod assigns a new id + stored name and writes the volume)
//  3. delete the NEW file row (the binary stays on the volume), then
//     repoint the OLD row's stored_filename at the new binary - every
//     reference (blocks, thumbnails, models) keeps working untouched
//  4. fix profile.avatar_url if it pointed at the old stored name
//  5. verify prod now serves the binary, then delete the local copy
//
//Usage:  bun scripts/push-local-files-to-prod.ts          (real run)
//        DRY_RUN=1 bun scripts/push-local-files-to-prod.ts (report only)
//
//Requires FILES_FORWARD_URL + FILES_FORWARD_SECRET in .env, and the SAME
//secret configured in prod's env (Dokploy) - the tunnel handshake.

import { readdirSync, readFileSync, statSync, unlinkSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { eq } from "drizzle-orm"
import { db } from "../db/index"
import { file as fileTable, profile } from "../db/schema"

const PROD   = (process.env.FILES_FORWARD_URL ?? "").replace(/\/$/, "")
const SECRET = process.env.FILES_FORWARD_SECRET ?? ""
const DRY    = process.env.DRY_RUN === "1"

if (!PROD || !SECRET) {
  console.error("FILES_FORWARD_URL and FILES_FORWARD_SECRET must be set in .env")
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..", "storage", "files")

function walk(dir: string, base = ""): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const rel = base ? `${base}/${e}` : e
    if (statSync(p).isDirectory()) out.push(...walk(p, rel))
    else out.push(rel)
  }
  return out
}

async function prodHas(rel: string): Promise<boolean> {
  const res = await fetch(`${PROD}/media/${rel}`, { method: "HEAD" })
  return res.ok
}

const localFiles = walk(ROOT)
console.log(`[push] ${localFiles.length} local file(s) found under storage/files/`)
if (DRY) console.log("[push] DRY RUN - nothing will be uploaded or modified")

let pushed = 0, skippedOnProd = 0, skippedNoRow = 0, failed = 0

for (const rel of localFiles) {
  if (await prodHas(rel)) {
    console.log(`[push] ok       ${rel} (already on prod)`)
    skippedOnProd++
    continue
  }

  const [row] = await db.select().from(fileTable).where(eq(fileTable.storedFilename, rel))
  if (!row) {
    console.warn(`[push] no-row   ${rel} (no file row references this binary - leaving it alone)`)
    skippedNoRow++
    continue
  }

  console.log(`[push] MISSING  ${rel} -> uploading to prod...`)
  if (DRY) { pushed++; continue }

  try {
    const buf = readFileSync(join(ROOT, rel))
    const fd = new FormData()
    fd.append("file", new Blob([buf], { type: row.mimeType }), row.originalFilename)
    const up = await fetch(`${PROD}/api/files`, {
      method:  "POST",
      headers: { "x-files-forward-secret": SECRET },
      body:    fd,
    })
    if (!up.ok) throw new Error(`upload ${up.status} ${await up.text().catch(() => "")}`)
    const fresh = await up.json() as { id: string; storedFilename: string; sizeBytes: number; mimeType: string }

    //Drop the freshly-created row (binary stays on the volume), then
    //repoint the ORIGINAL row at the new binary. Order matters: the
    //unique constraint on stored_filename forbids two rows sharing it.
    await db.delete(fileTable).where(eq(fileTable.id, fresh.id))
    await db.update(fileTable)
      .set({ storedFilename: fresh.storedFilename, sizeBytes: fresh.sizeBytes, mimeType: fresh.mimeType })
      .where(eq(fileTable.id, row.id))

    //profile.avatar_url stores the raw /media URL - follow the rename
    const [prof] = await db.select().from(profile)
    if (prof && prof.avatarUrl === `/media/${rel}`) {
      await db.update(profile).set({ avatarUrl: `/media/${fresh.storedFilename}` }).where(eq(profile.id, prof.id))
      console.log(`[push]          profile.avatar_url updated`)
    }

    if (!(await prodHas(fresh.storedFilename))) {
      throw new Error(`prod still does not serve ${fresh.storedFilename} after upload`)
    }

    unlinkSync(join(ROOT, rel))
    console.log(`[push]          repaired: row ${row.id} -> ${fresh.storedFilename} (local copy removed)`)
    pushed++
  } catch (e) {
    console.error(`[push] FAILED   ${rel}:`, e instanceof Error ? e.message : e)
    failed++
  }
}

console.log("")
console.log(`[push] done - repaired: ${pushed}, already on prod: ${skippedOnProd}, no DB row: ${skippedNoRow}, failed: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
