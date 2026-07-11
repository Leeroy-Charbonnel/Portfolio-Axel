import type { DetailBlock } from "../../../types/portfolio"

//SHARED per-block border style resolver - turns the block's Excel-like
//border settings into inline CSS. Used by the public view wrapper AND
//the edit-mode preview so the author sees exactly what publishes.
//Color rides the theme border token so it follows the palette.
export function blockBorderStyle(block: DetailBlock): Record<string, string> {
  const s = block.style
  if (!s || !s.borderSides || s.borderSides === "none") return {}
  const value = `${s.borderWidth ?? 1}px ${s.borderStyle ?? "solid"} var(--color-border-primary)`
  switch (s.borderSides) {
    case "all":        return { border: value }
    case "top":        return { borderTop: value }
    case "bottom":     return { borderBottom: value }
    case "left":       return { borderLeft: value }
    case "right":      return { borderRight: value }
    case "top-bottom": return { borderTop: value, borderBottom: value }
    case "left-right": return { borderLeft: value, borderRight: value }
    default:           return {}
  }
}
