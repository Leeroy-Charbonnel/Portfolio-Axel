//API BASE URL - when VITE_API_BASE_URL is set in .env / .env.local, every
//relative /api or /media URL gets prefixed with it. Bypasses the vite dev
//proxy entirely - useful when the proxy misbehaves for static paths and
//you just want the browser to fetch directly from prod.
//
//Trade-off: prod's ALLOWED_ORIGINS must include http://localhost:5173 (or
//whatever your dev origin is) so CORS doesn't block the cross-origin
///api requests. Static /media GETs aren't CORS-gated so they always work
//regardless. Leave VITE_API_BASE_URL empty to fall back on the proxy.

const RAW = (import.meta.env.VITE_API_BASE_URL as string | undefined) || ""
//Strip trailing slash so the join below produces a single "/" between
//base and path.
export const API_BASE_URL = RAW.replace(/\/$/, "")

//Prefix any leading-slash relative URL with the prod base. Absolute URLs
//(http..., https..., data:, blob:) pass through unchanged so we don't
//double-prefix already-resolved values.
export function toAbsoluteUrl(url: string | null | undefined): string {
  if (!url) return ""
  if (!API_BASE_URL) return url
  if (/^([a-z]+:)?\/\//i.test(url)) return url
  if (url.startsWith("data:") || url.startsWith("blob:")) return url
  if (!url.startsWith("/")) return url
  return API_BASE_URL + url
}

//Strip API_BASE_URL back off a URL so the value persisted to the DB stays
//relative (works regardless of where the project is later viewed from).
//Call this on URLs that round-trip through the editor's save payload.
export function toRelativeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (!API_BASE_URL) return url
  return url.startsWith(API_BASE_URL) ? url.slice(API_BASE_URL.length) : url
}
