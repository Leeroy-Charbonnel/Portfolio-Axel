import { marked } from "marked"
import type { Bilingual } from "../types/portfolio"

//MARKDOWN - single renderer shared by the detail-page blocks (text,
//accordion bodies) so view mode, edit mode and panel previews all parse
//with the same options.
export function renderMd(src: string): string {
  if (!src) return ""
  return marked.parse(src, { async: false, breaks: true, gfm: true }) as string
}

//Bilingual fallback chain - prefer the requested lang, fall back to fr,
//then en, then empty string. Used everywhere a translation could be
//missing on one side of the locale split.
export function pickBilingual(t: Partial<Bilingual> | null | undefined, lang: string): string {
  if (!t) return ""
  return (t as Record<string, string>)[lang] || t.fr || t.en || ""
}
