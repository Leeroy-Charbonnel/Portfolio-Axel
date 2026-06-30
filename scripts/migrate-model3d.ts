#!/usr/bin/env bun
//MIGRATE LEGACY mainProject.glbFileId -> reusable model_3d rows.
//
//For every main_project row that has a .glb attached but no model_3d
//reference yet, this creates a model_3d row pointing at the same
//file, seeds a "Default" view from viewerSettings.startView, and
//updates the project to reference the new model + "Default" on both
//desktop and mobile.
//
//Idempotent: rows that already have model3dId set are skipped, so
//re-running is safe.
//
//Targets the prod DB via the existing db/index connection (DATABASE_URL
//in .env). No local file or DB writes - the script reads from prod
//and writes back to prod.
//
//Usage: bun run migrate:model3d

import { db } from "../db/index"
import { mainProject, model3d } from "../db/schema"
import { eq, and, isNull, isNotNull } from "drizzle-orm"

interface StartView {
  pos:    [number, number, number]
  target: [number, number, number]
}

//Default camera if the project never had a startView saved. Picks a
//generic perspective that frames the origin at a comfortable distance;
//the admin will overwrite it via the new Views tab on first edit.
const FALLBACK_POSITION: [number, number, number] = [5, 5, 5]
const FALLBACK_TARGET:   [number, number, number] = [0, 0, 0]

function safeStartView(viewerSettings: unknown): StartView | null {
  if (!viewerSettings || typeof viewerSettings !== "object") return null
  const sv = (viewerSettings as { startView?: unknown }).startView
  if (!sv || typeof sv !== "object") return null
  const pos    = (sv as { pos?:    unknown }).pos
  const target = (sv as { target?: unknown }).target
  if (!Array.isArray(pos) || pos.length !== 3) return null
  if (!Array.isArray(target) || target.length !== 3) return null
  return { pos: pos as [number, number, number], target: target as [number, number, number] }
}

function projectName(p: { title: { en?: string; fr?: string } | null; id: number }): string {
  const t = p.title ?? {}
  return (t.fr || t.en || `Project ${p.id}`).trim() || `Project ${p.id}`
}

async function main() {
  const rows = await db.select().from(mainProject).where(
    and(isNull(mainProject.model3dId), isNotNull(mainProject.glbFileId)),
  )

  if (rows.length === 0) {
    console.log("nothing to migrate (every project already has a model_3d reference, or none has a .glb)")
    return
  }

  console.log(`migrating ${rows.length} project(s)...`)

  for (const p of rows) {
    if (!p.glbFileId) continue   //narrow for TS, already filtered above
    const name      = projectName(p as { title: { en?: string; fr?: string } | null; id: number })
    const startView = safeStartView(p.viewerSettings)
    const view = {
      name:      "Default",
      position:  startView?.pos    ?? FALLBACK_POSITION,
      target:    startView?.target ?? FALLBACK_TARGET,
      wireframe: false,
    }

    const [created] = await db.insert(model3d).values({
      name,
      glbFileId:       p.glbFileId,
      thumbnailFileId: p.mainImageFileId ?? null,
      viewerSettings:  p.viewerSettings ?? null,
      views:           [view],
    }).returning({ id: model3d.id })

    if (!created) {
      console.warn(`  - project ${p.id} "${name}": insert returned no row, skipping`)
      continue
    }

    await db.update(mainProject)
      .set({
        model3dId:          created.id,
        model3dDesktopView: "Default",
        model3dMobileView:  "Default",
        updatedAt:          new Date(),
      })
      .where(eq(mainProject.id, p.id))

    console.log(`  - project ${p.id} "${name}" -> model_3d ${created.id}`)
  }

  console.log("done")
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
