import { ref } from "vue"
import { useToast } from "./useToast"
import type { PortfolioDto } from "../types/portfolio"
import { pickImageFile } from "../lib/portfolio-utils"

//SHARED portfolio state - one fetch per page load, cached in module scope so
//every section component reads the same ref. No silent fallback: on error we
//set `error` and surface it via console.error (per project rule #4).
//
//Mutation helpers wrap the admin API. They optimistically refresh local state
//by re-fetching the whole portfolio after a successful write - simpler than
//maintaining patched local copies and the payload stays small.

const data    = ref<PortfolioDto | null>(null)
const loading = ref(false)
const loaded  = ref(false)
const error   = ref<string | null>(null)

let inFlight: Promise<void> | null = null

async function fetchPortfolio() {
  if (loading.value) return inFlight ?? Promise.resolve()
  loading.value = true
  error.value = null

  inFlight = (async () => {
    try {
      const res = await fetch("/api/portfolio", { credentials: "include" })
      if (!res.ok) throw new Error(`/api/portfolio returned ${res.status}`)
      data.value = await res.json()
      loaded.value = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      error.value = msg
      console.error("[usePortfolio] fetch failed:", msg)
    } finally {
      loading.value = false
      inFlight = null
    }
  })()

  return inFlight
}

async function reload() {
  loaded.value = false
  await fetchPortfolio()
}

//ADMIN MUTATIONS - every call is gated by the server's requireAdmin middleware.
//we re-fetch after success so the next render reflects DB truth (including any
//server-side denormalization like file ids -> media URLs).

//Every admin mutation funnels through apiJson / uploadFile, so surfacing
//failures HERE (toast + throw) means no call site can silently swallow a
//failed write (project rule #4). Callers may still catch to keep their own
//UI state consistent; the user has already seen the toast by then.
const toast = useToast()

async function apiJson(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body:    body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    toast.error(`${method} ${path} failed (${res.status})`)
    throw new Error(`${method} ${path} -> ${res.status} ${txt}`)
  }
  return res.json()
}

//FILE UPLOAD - returns { id, url, ... } on success. multipart, no JSON.
async function uploadFile(file: File): Promise<{ id: string; url: string }> {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch("/api/files", { method: "POST", credentials: "include", body: fd })
  if (!res.ok) {
    toast.error(`Upload of "${file.name}" failed (${res.status})`)
    throw new Error(`upload failed: ${res.status}`)
  }
  return res.json()
}

//REPLACE-IMAGE flow shared by every admin "replace picture" button:
//native picker -> upload -> apply the patch. Cancelling the picker is a
//no-op; upload/patch failures already toast via uploadFile/apiJson.
async function replaceImage(label: string, apply: (fileId: string, url: string) => Promise<void>): Promise<void> {
  const picked = await pickImageFile()
  if (!picked) return
  try {
    const uploaded = await uploadFile(picked)
    await apply(uploaded.id, uploaded.url)
  } catch (e) {
    console.error(`[usePortfolio] replace ${label} failed:`, e)
  }
}

//MAIN PROJECT mutations
async function createMainProject() { await apiJson("POST", "/api/main-project"); await reload() }
async function updateMainProject(id: number, patch: Record<string, unknown>) { await apiJson("PUT", `/api/main-project/${id}`, patch); await reload() }
async function deleteMainProject(id: number) { await apiJson("DELETE", `/api/main-project/${id}`); await reload() }
async function setMainProjectSoftware(id: number, softwareIds: number[]) { await apiJson("PUT", `/api/main-project/${id}/software`, { softwareIds }); await reload() }

//GALLERY PROJECT mutations
async function createGalleryProject() { await apiJson("POST", "/api/gallery-project"); await reload() }
async function updateGalleryProject(id: number, patch: Record<string, unknown>) { await apiJson("PUT", `/api/gallery-project/${id}`, patch); await reload() }
async function deleteGalleryProject(id: number) { await apiJson("DELETE", `/api/gallery-project/${id}`); await reload() }

//EXPERIENCE mutations
async function createExperience() { await apiJson("POST", "/api/experience"); await reload() }
async function updateExperience(id: number, patch: Record<string, unknown>) { await apiJson("PUT", `/api/experience/${id}`, patch); await reload() }
async function deleteExperience(id: number) { await apiJson("DELETE", `/api/experience/${id}`); await reload() }

//SOFTWARE mutations - create is multipart (logo upload + key + url in one
//round-trip). Update / delete are regular JSON. Delete on the server also
//removes the logo file when no other software references it.
async function createSoftware(logo: File, key: string, url: string) {
  const fd = new FormData()
  fd.append("logo", logo)
  fd.append("key", key)
  fd.append("url", url)
  const res = await fetch("/api/software", { method: "POST", credentials: "include", body: fd })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`POST /api/software -> ${res.status} ${txt}`)
  }
  await reload()
}

async function updateSoftware(id: number, patch: Record<string, unknown>) { await apiJson("PUT", `/api/software/${id}`, patch); await reload() }
async function deleteSoftware(id: number) { await apiJson("DELETE", `/api/software/${id}`); await reload() }

//3D MODEL mutations - file upload happens first (regular /api/files),
//then the model row gets created with the resulting file ids. The
//thumbnail is optional; an empty default view ("Default") is seeded
//so the project picker has something to point at on day one.
async function createModel(name: string, glbFile: File, thumbnailFile: File | null): Promise<{ id: string }> {
  const glb       = await uploadFile(glbFile)
  const thumbnail = thumbnailFile ? await uploadFile(thumbnailFile) : null
  const row = await apiJson("POST", "/api/models", {
    name,
    glbFileId:       glb.id,
    thumbnailFileId: thumbnail?.id ?? null,
    views: [{
      name:      "Default",
      position:  [5, 5, 5],
      target:    [0, 0, 0],
      wireframe: false,
    }],
  })
  await reload()
  return row
}
async function updateModel(id: string, patch: Record<string, unknown>) { await apiJson("PUT", `/api/models/${id}`, patch); await reload() }
async function deleteModel(id: string) { await apiJson("DELETE", `/api/models/${id}`); await reload() }

//PROFILE mutation (singleton)
async function updateProfile(patch: Record<string, unknown>) { await apiJson("PUT", "/api/profile", patch); await reload() }

export function usePortfolio() {
  if (typeof window !== "undefined" && !loaded.value && !loading.value) {
    void fetchPortfolio()
  }
  return {
    data, loading, loaded, error, reload,
    uploadFile, replaceImage,
    createMainProject, updateMainProject, deleteMainProject, setMainProjectSoftware,
    createGalleryProject, updateGalleryProject, deleteGalleryProject,
    createExperience, updateExperience, deleteExperience,
    createSoftware, updateSoftware, deleteSoftware,
    createModel, updateModel, deleteModel,
    updateProfile,
  }
}
