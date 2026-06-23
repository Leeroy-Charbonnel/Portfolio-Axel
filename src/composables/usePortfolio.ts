import { ref } from "vue"
import type { PortfolioDto } from "../types/portfolio"
import { API_BASE_URL, toAbsoluteUrl } from "../lib/api-base"

//Walk an arbitrary JSON tree and prepend API_BASE_URL to every string that
//starts with "/media" or "/api". Mutates in place to avoid copying large
//portfolio payloads. Called once on each fetch when API_BASE_URL is set;
//noop otherwise.
function rewriteUrls(value: unknown): void {
  if (!API_BASE_URL) return
  if (value === null || value === undefined) return
  if (Array.isArray(value)) { for (const v of value) rewriteUrls(v); return }
  if (typeof value !== "object") return
  const obj = value as Record<string, unknown>
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (typeof v === "string" && (v.startsWith("/media") || v.startsWith("/api"))) {
      obj[k] = toAbsoluteUrl(v)
    } else if (v && typeof v === "object") {
      rewriteUrls(v)
    }
  }
}

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
      const res = await fetch(toAbsoluteUrl("/api/portfolio"), { credentials: "include" })
      if (!res.ok) throw new Error(`/api/portfolio returned ${res.status}`)
      const payload = await res.json()
      //Rewrite every /media + /api URL inside the payload so <img src=...>
      //and similar bindings hit prod directly instead of localhost.
      rewriteUrls(payload)
      data.value = payload
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

async function apiJson(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(toAbsoluteUrl(path), {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body:    body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`${method} ${path} -> ${res.status} ${txt}`)
  }
  const json = await res.json()
  rewriteUrls(json)
  return json
}

//FILE UPLOAD - returns { id, url, ... } on success. multipart, no JSON.
async function uploadFile(file: File): Promise<{ id: string; url: string }> {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch(toAbsoluteUrl("/api/files"), { method: "POST", credentials: "include", body: fd })
  if (!res.ok) throw new Error(`upload failed: ${res.status}`)
  const json = await res.json()
  rewriteUrls(json)
  return json
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
  const res = await fetch(toAbsoluteUrl("/api/software"), { method: "POST", credentials: "include", body: fd })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`POST /api/software -> ${res.status} ${txt}`)
  }
  await reload()
}

async function updateSoftware(id: number, patch: Record<string, unknown>) { await apiJson("PUT", `/api/software/${id}`, patch); await reload() }
async function deleteSoftware(id: number) { await apiJson("DELETE", `/api/software/${id}`); await reload() }

//PROFILE mutation (singleton)
async function updateProfile(patch: Record<string, unknown>) { await apiJson("PUT", "/api/profile", patch); await reload() }

export function usePortfolio() {
  if (typeof window !== "undefined" && !loaded.value && !loading.value) {
    void fetchPortfolio()
  }
  return {
    data, loading, loaded, error, reload,
    uploadFile,
    createMainProject, updateMainProject, deleteMainProject, setMainProjectSoftware,
    createGalleryProject, updateGalleryProject, deleteGalleryProject,
    createExperience, updateExperience, deleteExperience,
    createSoftware, updateSoftware, deleteSoftware,
    updateProfile,
  }
}
