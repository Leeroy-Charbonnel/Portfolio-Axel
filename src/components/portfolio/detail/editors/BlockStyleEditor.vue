<script setup lang="ts">
import {
  Ban,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Square,
  UnfoldHorizontal,
  UnfoldVertical,
} from "lucide-vue-next"
import type { BorderLineStyle, BorderSides, DetailBlock } from "../../../../types/portfolio"

//SHARED STYLE EDITOR - Excel-like border controls, shown for EVERY
//selected block above its type-specific editor. Side presets are icon
//toggles; width and line type are selects.

const props = defineProps<{ block: DetailBlock }>()
const emit = defineEmits<{ (e: "dirty"): void }>()

const SIDES: { value: BorderSides; icon: unknown; label: string }[] = [
  { value: "none",       icon: Ban,              label: "No border" },
  { value: "all",        icon: Square,           label: "All sides" },
  { value: "top",        icon: PanelTop,         label: "Top" },
  { value: "bottom",     icon: PanelBottom,      label: "Bottom" },
  { value: "left",       icon: PanelLeft,        label: "Left" },
  { value: "right",      icon: PanelRight,       label: "Right" },
  { value: "top-bottom", icon: UnfoldVertical,   label: "Top + bottom" },
  { value: "left-right", icon: UnfoldHorizontal, label: "Left + right" },
]
const LINE_STYLES: BorderLineStyle[] = ["solid", "dashed", "dotted", "double"]

function ensureStyle() {
  if (!props.block.style) props.block.style = {}
  return props.block.style
}
function setSides(v: BorderSides) {
  ensureStyle().borderSides = v
  emit("dirty")
}
function setWidth(v: string) {
  const n = parseInt(v, 10)
  ensureStyle().borderWidth = Number.isFinite(n) ? Math.max(1, Math.min(12, n)) : 1
  emit("dirty")
}
function setLineStyle(v: string) {
  ensureStyle().borderStyle = v as BorderLineStyle
  emit("dirty")
}
</script>

<template>
  <div class="dp-field">
    <span>Border</span>
    <div class="style-editor__sides">
      <button
        v-for="s in SIDES"
        :key="s.value"
        type="button"
        class="dp-icon-btn"
        :class="{ 'style-editor__side--active': (block.style?.borderSides ?? 'none') === s.value }"
        :title="s.label"
        @click="setSides(s.value)"
      >
        <component :is="s.icon" :size="14" />
      </button>
    </div>
  </div>
  <div class="style-editor__row">
    <label class="dp-field style-editor__half">
      <span>Line width</span>
      <input
        type="number" class="dp-input" min="1" max="12"
        :value="block.style?.borderWidth ?? 1"
        @input="setWidth(($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="dp-field style-editor__half">
      <span>Line type</span>
      <select class="dp-select" :value="block.style?.borderStyle ?? 'solid'" @change="setLineStyle(($event.target as HTMLSelectElement).value)">
        <option v-for="ls in LINE_STYLES" :key="ls" :value="ls">{{ ls }}</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.style-editor__sides {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xxs);
}
.style-editor__side--active {
  background-color: var(--color-background-gray-200);
  color: var(--color-accent);
}
.style-editor__row {
  display: flex;
  gap: var(--spacing-xs);
}
.style-editor__half { flex: 1 1 0; min-width: 0; }
</style>
