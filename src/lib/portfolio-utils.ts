//PORTFOLIO utility functions - hex color helpers for the Sketchfab wireframe
//override + numeric formatting for the stat counters.

//Convert "#RRGGBB" (or "RRGGBB") to a normalized [r, g, b] in 0..1 range,
//which is the format the Sketchfab API expects in setLight/createMaterial calls.
export function hexToRgb(hex: string): number[] {
  const clean = hex.replace(/^#/, "")
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255
  return [r, g, b]
}

//Compact number formatter for the stat counters: 1234 -> "1.23k", 1500000 -> "1.50M".
export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1000)      return `${(num / 1000).toFixed(2)}k`
  return Math.round(num).toString()
}
