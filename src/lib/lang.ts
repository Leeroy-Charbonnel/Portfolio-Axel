//SHARED BY THE BROWSER AND THE SERVER: useLang writes the cookie, server/email.ts
//reads it to pick the language of a letter, so the name and the values live once
export type Lang = "fr" | "en"

export const LANG_DEFAULT: Lang = "fr"
export const LANG_COOKIE = "language"

export const isLang = (value: unknown): value is Lang => value === "fr" || value === "en"
