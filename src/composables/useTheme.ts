import { ref, watch, watchEffect } from "vue"
import { useSettings } from "./useSettings"

export type Theme = "light" | "dark"

//SHARED theme state - persisted in the settings table (DB), seeded if missing.
//applies .dark class on documentElement so Tailwind/CSS see the current mode.

const THEME_KEY     = "theme"
const THEME_DEFAULT: Theme = "dark"

const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark"

const theme    = ref<Theme>(THEME_DEFAULT)
const settings = useSettings()

//apply .dark class side-effect
if (typeof window !== "undefined") {
  watchEffect(() => {
    const root = document.documentElement
    if (theme.value === "dark") root.classList.add("dark")
    else root.classList.remove("dark")
  })
}

async function hydrate() {
  const row = settings.get(THEME_KEY)
  if (row) {
    if (isTheme(row.value)) theme.value = row.value
    else console.warn(`[useTheme] unknown theme in the settings table, keeping ${theme.value}:`, row.value)
    return
  }
  //an empty row is not a choice: the account keeps the theme it is already reading
  try {
    await settings.update(THEME_KEY, theme.value, {
      type:        "select",
      description: "SETTING_theme_DESC",
      group:       "appearance",
      options:     JSON.stringify([{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }]),
    })
  } catch (e) {
    console.warn("[useTheme] could not seed theme setting:", e)
  }
}

//hydrate whenever the rows arrive: useSettings reads them the moment a session
//names an account, and again when the account changes. An empty list after a
//failed or unauthenticated load never gets here, so nothing is seeded over it
if (typeof window !== "undefined") {
  watch(settings.loaded, isLoaded => { if (isLoaded) hydrate() }, { immediate: true })
}

export function useTheme() {
  async function setTheme(t: Theme) {
    theme.value = t
    if (!settings.loaded.value) return
    try { await settings.update(THEME_KEY, t) } catch (e) { console.warn("[useTheme] persist failed:", e) }
  }
  async function toggleTheme() {
    await setTheme(theme.value === "light" ? "dark" : "light")
  }

  return { theme, setTheme, toggleTheme }
}
