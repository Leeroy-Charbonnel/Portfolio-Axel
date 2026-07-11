<script setup lang="ts">
import { computed } from "vue"
import type { BorderSides, DetailBlockStyle } from "../../../types/portfolio"

//PER-BLOCK BORDER OVERLAY - custom-renders every line type with
//repeating gradients instead of native CSS borders, because:
//  - CSS `dotted` draws ROUND dots; the user wants SQUARE dots
//  - CSS has no dash-dot style at all
//Each active side is one absolutely-positioned strip inside the block
//(pointer-events: none, z-index above media). Patterns scale with the
//configured width so the rhythm stays consistent at any thickness.

const props = defineProps<{ bstyle?: DetailBlockStyle }>()

const SIDE_MAP: Record<BorderSides, string[]> = {
  "none":       [],
  "all":        ["top", "bottom", "left", "right"],
  "top":        ["top"],
  "bottom":     ["bottom"],
  "left":       ["left"],
  "right":      ["right"],
  "top-bottom": ["top", "bottom"],
  "left-right": ["left", "right"],
}

const sides = computed(() => {
  const s = props.bstyle
  if (!s?.borderSides) return []
  return SIDE_MAP[s.borderSides] ?? []
})
const w    = computed(() => Math.max(1, props.bstyle?.borderWidth ?? 1))
const line = computed(() => props.bstyle?.borderStyle ?? "solid")

//Pattern along the line axis. `axis` is the gradient direction of the
//strip: horizontal strips pattern "to right", vertical ones "to bottom".
//Segment lengths are multiples of the width so dots stay square.
function background(axis: "to right" | "to bottom"): string {
  const c = "var(--color-border-primary)"
  const u = w.value
  switch (line.value) {
    case "dashed":
      return `repeating-linear-gradient(${axis}, ${c} 0 ${3 * u}px, transparent ${3 * u}px ${5 * u}px)`
    case "dotted":
      //square dot: segment length = strip thickness
      return `repeating-linear-gradient(${axis}, ${c} 0 ${u}px, transparent ${u}px ${3 * u}px)`
    case "dash-dot":
      //dash, gap, square dot, gap - the Excel "trait-point"
      return `repeating-linear-gradient(${axis}, ${c} 0 ${4 * u}px, transparent ${4 * u}px ${6 * u}px, ${c} ${6 * u}px ${7 * u}px, transparent ${7 * u}px ${9 * u}px)`
    case "double":
      //two lines of `u` separated by a `u` gap, across the strip (the
      //cross axis), so the strip is 3u thick - see sideStyle().
      return `linear-gradient(${axis === "to right" ? "to bottom" : "to right"}, ${c} 0 ${u}px, transparent ${u}px ${2 * u}px, ${c} ${2 * u}px ${3 * u}px)`
    default:
      return c
  }
}

//Strip thickness: 3x for double (two lines + gap), 1x otherwise.
const thick = computed(() => (line.value === "double" ? 3 * w.value : w.value))

function sideStyle(side: string): Record<string, string> {
  const t = `${thick.value}px`
  switch (side) {
    case "top":    return { top: "0", left: "0", right: "0", height: t, background: background("to right") }
    case "bottom": return { bottom: "0", left: "0", right: "0", height: t, background: background("to right") }
    case "left":   return { left: "0", top: "0", bottom: "0", width: t, background: background("to bottom") }
    default:       return { right: "0", top: "0", bottom: "0", width: t, background: background("to bottom") }
  }
}
</script>

<template>
  <span
    v-for="side in sides"
    :key="side"
    class="block-border"
    :style="sideStyle(side)"
    aria-hidden="true"
  ></span>
</template>

<style scoped>
.block-border {
  position: absolute;
  pointer-events: none;
  /*Above the lifted media elements (global img/video z:2) so the border
  draws over images like a real CSS border would.*/
  z-index: 3;
}
</style>
