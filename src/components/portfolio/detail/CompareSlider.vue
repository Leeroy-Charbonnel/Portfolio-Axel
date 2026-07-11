<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue"
import { useLanguage } from "../../../composables/useLanguage"
import { pickBilingual } from "../../../lib/markdown"
import type { CompareBlockContent } from "../../../types/portfolio"

//COMPARE SLIDER - two stacked images split by a vertical divider (a bare
//line, no handle). Default interaction: the divider only moves while the
//pointer is held down (click / drag, touch included). The per-block
//followMouse option switches to hover-tracking instead. The "after"
//image paints fully underneath; the "before" image is clipped to the
//left of the divider via clip-path so both stay pixel-aligned regardless
//of object-fit cropping.

const props = defineProps<{ content: CompareBlockContent }>()

const { lang } = useLanguage()

const rootRef  = ref<HTMLDivElement | null>(null)
//Divider position as a fraction of the width (0..1). Starts centered.
const position = ref(0.5)
const dragging = ref(false)

const beforeLabel = computed(() => pickBilingual(props.content.beforeLabel, lang.value))
const afterLabel  = computed(() => pickBilingual(props.content.afterLabel, lang.value))

function positionFromEvent(e: PointerEvent) {
  const el = rootRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width === 0) return
  position.value = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
}

function onPointerDown(e: PointerEvent) {
  dragging.value = true
  positionFromEvent(e)
  document.addEventListener("pointermove", onDocPointerMove)
  document.addEventListener("pointerup",   onDocPointerUp)
}
function onDocPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  positionFromEvent(e)
}
function onDocPointerUp() {
  dragging.value = false
  document.removeEventListener("pointermove", onDocPointerMove)
  document.removeEventListener("pointerup",   onDocPointerUp)
}

//Hover tracking is OPT-IN per block (followMouse). Without it the split
//only responds to click / drag.
function onPointerMove(e: PointerEvent) {
  if (props.content.followMouse && e.pointerType === "mouse") positionFromEvent(e)
}

onBeforeUnmount(() => {
  document.removeEventListener("pointermove", onDocPointerMove)
  document.removeEventListener("pointerup",   onDocPointerUp)
})
</script>

<template>
  <div
    ref="rootRef"
    class="compare"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
  >
    <img
      v-if="content.afterUrl"
      :src="content.afterUrl"
      :alt="afterLabel"
      class="compare__img"
      draggable="false"
    />
    <img
      v-if="content.beforeUrl"
      :src="content.beforeUrl"
      :alt="beforeLabel"
      class="compare__img compare__img--before"
      :style="{ clipPath: `inset(0 ${(1 - position) * 100}% 0 0)` }"
      draggable="false"
    />
    <div class="compare__divider" :style="{ left: `${position * 100}%` }"></div>
    <span v-if="beforeLabel" class="compare__label compare__label--before">{{ beforeLabel }}</span>
    <span v-if="afterLabel"  class="compare__label compare__label--after">{{ afterLabel }}</span>
  </div>
</template>

<style scoped>
.compare {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
}
.compare__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.compare__img--before { z-index: 3; }
.compare__divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: var(--border-width-md);
  background-color: var(--color-accent-neutral);
  transform: translateX(-50%);
  z-index: 4;
  pointer-events: none;
}
.compare__label {
  position: absolute;
  bottom: var(--spacing-xs);
  z-index: 4;
  padding: var(--spacing-xxs) var(--spacing-xs);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-hover);
  background-color: var(--semi-transparent-dark);
  backdrop-filter: blur(var(--filter-blur));
  pointer-events: none;
}
.compare__label--before { left: var(--spacing-xs); }
.compare__label--after  { right: var(--spacing-xs); }
</style>
