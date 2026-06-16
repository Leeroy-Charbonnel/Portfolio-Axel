import { ref } from "vue"
import type { PortfolioDto } from "../types/portfolio"

//SHARED portfolio state - one fetch per page load, cached in module scope so
//every section component reads the same ref. No silent fallback: on error we
//set `error` and surface it via console.error, then the UI keeps its empty
//skeleton (per project rule #4).

const data    = ref<PortfolioDto | null>(null)
const loading = ref(false)
const loaded  = ref(false)
const error   = ref<string | null>(null)

let inFlight: Promise<void> | null = null

async function fetchPortfolio() {
  if (loaded.value || loading.value) {
    return inFlight ?? Promise.resolve()
  }
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

export function usePortfolio() {
  if (typeof window !== "undefined" && !loaded.value && !loading.value) {
    void fetchPortfolio()
  }
  return { data, loading, loaded, error, reload: () => { loaded.value = false; return fetchPortfolio() } }
}
