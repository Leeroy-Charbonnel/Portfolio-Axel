import { useTranslations } from "./useTranslations"
import { useLang } from "./useLang"

//Project-level i18n is now a thin wrapper over the DB-backed useTranslations
//The 'translations' table is the single source of truth
//for every translatable string in the app - shared keys, project keys, and
//settings descriptions all live there.
//
//To add or edit a translation: insert/update the corresponding row in the
//translations table (via the seed script, the admin API, or db:studio).
export function useLanguage() {
  const { t } = useTranslations()
  const { lang, setLang, toggleLang } = useLang()
  return { lang, setLang, toggleLang, t }
}
