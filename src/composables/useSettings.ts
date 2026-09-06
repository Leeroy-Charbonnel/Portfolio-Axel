import { computed, effectScope, ref, watch } from "vue"
import { authClient } from "../lib/authClient"

export type SettingType = "bool" | "string" | "number" | "color" | "select" | "list" | "json"

export interface SettingRow {
  key:         string
  value:       string //stored as text; parsed by type
  description: string
  type:        SettingType
  group:       string
  options?:    string //JSON string used by 'select' type
}

//SHARED STATE
const rows    = ref<SettingRow[]>([])
const loaded  = ref(false)
const loading = ref(false)
const error   = ref<string | null>(null)

const ENDPOINT = "/api/settings"

//The single fetch in flight, shared by every caller that asks while it runs.
//Without it the second caller got an already-resolved promise over an empty
//rows, read no theme row, concluded the setting did not exist and seeded the
//default over the user's choice on every single page load.
let inFlight: Promise<void> | null = null

function load(): Promise<void> {
  if (loaded.value) return Promise.resolve()
  if (inFlight) return inFlight

  loading.value = true
  error.value   = null
  inFlight = (async () => {
    try {
      const res = await fetch(ENDPOINT, { credentials: "include" })
      //401 and 403 are states, not failures: nobody signed in yet, or an account
      //parked on /verify-email or /pending. loaded stays false, so nothing reads
      //an empty list as "no row" and seeds a default over the account's choice
      if (res.status === 401 || res.status === 403) return
      if (!res.ok) throw new Error(`load failed (${res.status})`)
      rows.value   = await res.json()
      loaded.value = true
    } catch (e: any) {
      error.value = e?.message ?? "load error"
      console.error("[useSettings] load failed:", e)
    } finally {
      loading.value = false
      inFlight      = null
    }
  })()
  return inFlight
}

//THE ACCOUNT DECIDES WHEN THE TABLE IS READ, not a module flag. The sign-in
//screen renders with nobody signed in and /api/settings answers 401; a flag
//raised on that answer stayed raised through the internal navigation that
//follows a sign-in, so the account's own theme and language only arrived on a
//full reload. Keyed on the account id, the read happens the moment one appears,
//whichever door was used, and again when another account takes its place: a
//sign-out is an internal navigation too, and the rows of the account that left
//must not paint the next one. One subscription for the whole page, in a scope of
//its own: a watcher born inside a component dies with it
if (typeof window !== "undefined") {
  effectScope(true).run(() => {
    const session = authClient.useSession()
    watch(() => session.value.data?.user.id ?? null, id => {
      rows.value   = []
      loaded.value = false
      if (id) load()
    }, { immediate: true })
  })
}

export function useSettings() {
  interface UpdateOptions {
    description?: string
    type?:        SettingType
    group?:       string
    options?:     string
  }

  //PUT is an upsert server-side: extra metadata fields are used to create
  //the row when it doesn't exist yet. updating an existing row only changes
  //the value (schema fields are stable once seeded)
  async function update(key: string, value: string, meta?: UpdateOptions) {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(key)}`, {
      method:      "PUT",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
      body:        JSON.stringify({ value, ...meta }),
    })
    if (!res.ok) throw new Error(`update failed (${res.status})`)
    const updated: SettingRow = await res.json()
    const idx = rows.value.findIndex(r => r.key === key)
    if (idx >= 0) rows.value[idx] = updated
    else rows.value.push(updated)
    return updated
  }

  //TYPED READERS - parse based on type
  function get(key: string): SettingRow | undefined {
    return rows.value.find(r => r.key === key)
  }

  function getBool(key: string, fallback = false): boolean {
    const r = get(key)
    if (!r) return fallback
    return r.value === "true" || r.value === "1"
  }

  function getString(key: string, fallback = ""): string {
    return get(key)?.value ?? fallback
  }

  function getNumber(key: string, fallback = 0): number {
    const v = get(key)?.value
    if (v == null) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  function getJson<T = unknown>(key: string, fallback: T): T {
    const v = get(key)?.value
    if (v == null) return fallback
    try { return JSON.parse(v) as T } catch { return fallback }
  }

  //GROUPED rows for the settings page
  const grouped = computed(() => {
    const out: Record<string, SettingRow[]> = {}
    for (const r of rows.value) {
      ;(out[r.group] ??= []).push(r)
    }
    return out
  })

  return {
    rows, grouped, loaded, loading, error,
    load, update,
    get, getBool, getString, getNumber, getJson,
  }
}
