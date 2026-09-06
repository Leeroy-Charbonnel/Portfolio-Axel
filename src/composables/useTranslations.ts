import { ref, watch } from "vue"
import { useLang, type Lang } from "./useLang"

//SHARED translation store - one source of truth for every translatable
//string in the app. Reads /api/translations?lang=X (PUBLIC endpoint so
//unauthenticated pages can still render in the user's language).
//
//Cache lives in a module ref keyed by lang. No localStorage (per project
//rule: if it's in the DB, it doesn't go in localStorage).
//
//Missing keys return the key itself so they're VISIBLE in the UI (per
//project rule: no silent fallbacks) and console.warn so developers notice.

type LangMap = Record<string, string>

const cache  = ref<Record<string, LangMap>>({})
const loaded = ref<Record<string, boolean>>({})

//one fetch per language, shared: every component that calls useTranslations()
//asks for the same map on first paint
const inFlight: Partial<Record<Lang, Promise<void>>> = {}

function loadLang(l: Lang): Promise<void> {
  if (loaded.value[l]) return Promise.resolve()
  const pending = inFlight[l]
  if (pending) return pending

  const run = (async () => {
    try {
      const res = await fetch(`/api/translations?lang=${encodeURIComponent(l)}`, {
        credentials: "include",
      })
      if (!res.ok) {
        console.warn(`[useTranslations] load ${l} failed (${res.status})`)
        return
      }
      cache.value[l]  = await res.json()
      loaded.value[l] = true
    } finally {
      delete inFlight[l]
    }
  })()
  inFlight[l] = run
  return run
}

export function useTranslations() {
  const { lang } = useLang()

  //lazy-load on first call + on language switch
  if (typeof window !== "undefined") {
    if (!loaded.value[lang.value]) loadLang(lang.value)
    watch(lang, (newLang) => loadLang(newLang))
  }

  function t(id: string): string {
    const value = cache.value[lang.value]?.[id]
    if (value !== undefined) return value
    if (loaded.value[lang.value]) {
      console.warn(`[useTranslations] missing key: ${id} (${lang.value})`)
    }
    return id
  }

  async function reload() {
    loaded.value = {}
    cache.value  = {}
    await loadLang(lang.value)
  }

  //bulk-upsert helper for composables that seed their own descriptions
  async function upsertMany(translations: Record<string, Record<string, string>>) {
    const res = await fetch("/api/translations", {
      method:      "PUT",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
      body:        JSON.stringify(translations),
    })
    if (!res.ok) {
      console.warn(`[useTranslations] upsert failed (${res.status})`)
      return
    }
    //refresh local cache so the new keys appear immediately
    await reload()
  }

  return { t, reload, upsertMany }
}
