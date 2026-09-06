import { ref, watch } from "vue"
import { isLang, LANG_COOKIE, LANG_DEFAULT, type Lang } from "../lib/lang"
import { useSettings } from "./useSettings"

export type { Lang }

//SHARED lang state - persisted in the settings table (DB), seeded if missing.
//each project layers its own t() function on top (locale files are project-specific).

const LANG_KEY = "language"
const COOKIE_YEAR_S = 60 * 60 * 24 * 365

const settings = useSettings()

//THE COOKIE PAINTS AND THE DATABASE REMEMBERS. The settings row is the account's
//choice (rule 5), but it does not exist before the account does: the sign-in
//screen has no session, and the letters it sends (verification, reset, sign-in
//link) are written in the language the visitor is reading. The cookie is the one
//thing that travels with those requests, and server/email.ts reads it. It is not
//a second source of truth: the row overwrites it the moment the account answers
function readCookie(): Lang {
  const held = document.cookie.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]*)`))?.[1]
  return isLang(held) ? held : LANG_DEFAULT
}

const lang = ref<Lang>(typeof document !== "undefined" ? readCookie() : LANG_DEFAULT)

function apply(l: Lang) {
  lang.value = l
  document.cookie = `${LANG_COOKIE}=${l}; Max-Age=${COOKIE_YEAR_S}; Path=/; SameSite=Lax`
}

async function hydrate() {
  const row = settings.get(LANG_KEY)
  if (row) {
    if (isLang(row.value)) apply(row.value)
    else console.warn(`[useLang] unknown language in the settings table, keeping ${lang.value}:`, row.value)
    return
  }
  //an empty row is not a choice: the account remembers the language the visitor
  //is already reading, the one the sign-in screen posed in the cookie, not the default
  try {
    await settings.update(LANG_KEY, lang.value, {
      type:        "select",
      description: "SETTING_language_DESC",
      group:       "appearance",
      options:     JSON.stringify([{ label: "Français", value: "fr" }, { label: "English", value: "en" }]),
    })
  } catch (e) {
    console.warn("[useLang] could not seed language setting:", e)
  }
}

//hydrate whenever the rows arrive: useSettings reads them the moment a session
//names an account, and again when the account changes. An empty list after a
//failed or unauthenticated load never gets here, so nothing is seeded over it
if (typeof window !== "undefined") {
  watch(settings.loaded, isLoaded => { if (isLoaded) hydrate() }, { immediate: true })
}

export function useLang() {
  //the cookie is written either way; the row only once an account has answered,
  //or the sign-in screen would fail a write on every switch
  async function setLang(l: Lang) {
    apply(l)
    if (!settings.loaded.value) return
    try { await settings.update(LANG_KEY, l) } catch (e) { console.warn("[useLang] persist failed:", e) }
  }
  async function toggleLang() {
    await setLang(lang.value === "fr" ? "en" : "fr")
  }

  return { lang, setLang, toggleLang }
}
