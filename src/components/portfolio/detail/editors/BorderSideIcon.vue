<script setup lang="ts">
import { computed } from "vue"
import type { BorderSides } from "../../../../types/portfolio"

//EXCEL-LIKE border preset icon: a faint dotted square guide with the
//ACTIVE sides drawn as bold solid strokes. Inherits currentColor so the
//active button tint flows through.

const props = defineProps<{ sides: BorderSides }>()

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
const active = computed(() => SIDE_MAP[props.sides] ?? [])

//Line endpoints inside a 16x16 viewBox, 1.5px inset so the 2px strokes
//don't clip.
const LINES: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
  top:    { x1: 1.5,  y1: 1.5,  x2: 14.5, y2: 1.5 },
  bottom: { x1: 1.5,  y1: 14.5, x2: 14.5, y2: 14.5 },
  left:   { x1: 1.5,  y1: 1.5,  x2: 1.5,  y2: 14.5 },
  right:  { x1: 14.5, y1: 1.5,  x2: 14.5, y2: 14.5 },
}
</script>

<template>
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <!--Faint dotted guide square (always visible, like Excel).-->
    <line
      v-for="(l, name) in LINES"
      :key="`guide-${name}`"
      v-bind="l"
      stroke="currentColor"
      stroke-width="1"
      stroke-dasharray="1.5 1.8"
      opacity="0.3"
    />
    <!--Active sides - bold solid strokes on top of the guide.-->
    <line
      v-for="name in active"
      :key="`active-${name}`"
      v-bind="LINES[name]"
      stroke="currentColor"
      stroke-width="2"
    />
  </svg>
</template>
