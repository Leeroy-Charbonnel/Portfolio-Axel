//PORTFOLIO utility functions - numeric formatting for the stat counters +
//stat badge metadata + the shared native file picker.

//Compact number formatter for the stat counters: 1234 -> "1k", 1500000 -> "2M".
//No decimals - the gallery cards are narrow and we'd rather lose a bit of
//precision than wrap to a second line.
export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${Math.round(num / 1_000_000)}M`
  if (num >= 1000)      return `${Math.round(num / 1000)}k`
  return Math.round(num).toString()
}

//STAT META - letter badge + full name per language, used by both MainProject
//and ProjectGallery so the V/E/F/T badges share one source of truth and a
//French visitor sees S/A/F/T with the right tooltip ("Sommets", "Arêtes").
type StatKey = "vertices" | "edges" | "faces" | "triangles"
type Lang    = "en" | "fr"

const STAT_LETTERS: Record<Lang, Record<StatKey, string>> = {
  en: { vertices: "V", edges: "E", faces: "F", triangles: "T" },
  fr: { vertices: "S", edges: "A", faces: "F", triangles: "T" },
}

const STAT_NAMES: Record<Lang, Record<StatKey, string>> = {
  en: { vertices: "Vertices", edges: "Edges",  faces: "Faces", triangles: "Triangles" },
  fr: { vertices: "Sommets",  edges: "Arêtes", faces: "Faces", triangles: "Triangles" },
}

export function statLetter(key: StatKey, lang: string): string {
  return STAT_LETTERS[(lang as Lang)] ?.[key] ?? STAT_LETTERS.en[key]
}

export function statName(key: StatKey, lang: string): string {
  return STAT_NAMES[(lang as Lang)] ?.[key] ?? STAT_NAMES.en[key]
}

//Open the native file picker and resolve with the selected File (or null if cancelled).
//Used by every admin "Replace image" button - no <input> element needs to live in the DOM.
//The 'cancel' event (supported by every evergreen browser) makes the promise
//settle on user-cancel instead of hanging forever.
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type   = "file"
    input.accept = "image/*"
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
