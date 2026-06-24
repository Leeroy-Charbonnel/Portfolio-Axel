<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { ChevronLeft, ChevronRight, X } from "lucide-vue-next"
import { useLightbox } from "../../composables/useLightbox"

//LIGHTBOX CAROUSEL - single instance mounted in App.vue. Listens to the
//module-level state from useLightbox; any component opens it by calling
//useLightbox().open([{url,alt}], startIndex).
//
// - infinite horizontal scroll (modulo wrap on next/prev)
// - touch swipe + keyboard arrows + mouse arrow buttons
// - dot pagination at the bottom
// - escape / backdrop click closes
// - locks body scroll while open

const { items, index, isOpen, close, next, prev, goTo } = useLightbox()

//Track translation - the active item is centered, neighbours flank it.
//Renders the full list once and slides via translateX. Wrap-around does
//a quiet rewind which is fine for a brutalist viewer.
const track = ref<HTMLElement | null>(null)

//SWIPE / drag handling - same pointer events for touch and mouse.
const dragStartX = ref<number | null>(null)
const dragDX     = ref(0)
const SWIPE_THRESHOLD_PX = 60

function onPointerDown(e: PointerEvent) {
  dragStartX.value = e.clientX
  dragDX.value     = 0
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (dragStartX.value === null) return
  dragDX.value = e.clientX - dragStartX.value
}
function onPointerUp(e: PointerEvent) {
  if (dragStartX.value === null) return
  const dx = e.clientX - dragStartX.value
  dragStartX.value = null
  if (dx >  SWIPE_THRESHOLD_PX) prev()
  if (dx < -SWIPE_THRESHOLD_PX) next()
  dragDX.value = 0
}

function onKey(e: KeyboardEvent) {
  if (!isOpen.value) return
  if (e.key === "Escape")     { e.preventDefault(); close() }
  if (e.key === "ArrowRight") { e.preventDefault(); next() }
  if (e.key === "ArrowLeft")  { e.preventDefault(); prev() }
}

//Lock body scroll while the lightbox is open so swipes inside the
//overlay don't accidentally scroll the page behind it.
watch(isOpen, (open) => {
  if (typeof document === "undefined") return
  document.documentElement.style.overflow = open ? "hidden" : ""
})

onMounted(() => { window.addEventListener("keydown", onKey) })
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey)
  if (typeof document !== "undefined") document.documentElement.style.overflow = ""
})
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="isOpen"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        @click.self="close"
      >
        <!--CLOSE button - top-right.-->
        <button
          type="button"
          class="lightbox__close"
          aria-label="Close"
          @click="close"
        >
          <X :size="18" />
        </button>

        <!--PREV / NEXT arrows - desktop UX. On phone the swipe gesture
        is the primary navigation but the arrows still work.-->
        <button
          v-if="items.length > 1"
          type="button"
          class="lightbox__arrow lightbox__arrow--prev"
          aria-label="Previous"
          @click="prev"
        >
          <ChevronLeft :size="22" />
        </button>
        <button
          v-if="items.length > 1"
          type="button"
          class="lightbox__arrow lightbox__arrow--next"
          aria-label="Next"
          @click="next"
        >
          <ChevronRight :size="22" />
        </button>

        <!--TRACK - all items rendered side by side, translated by index.
        Drag offset is added on top so the swipe gesture feels responsive.-->
        <div
          ref="track"
          class="lightbox__track"
          :style="{ transform: `translateX(calc(${-index * 100}% + ${dragDX}px))` }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <div
            v-for="(it, i) in items"
            :key="i"
            class="lightbox__slide"
          >
            <img
              v-if="it.url"
              :src="it.url"
              :alt="it.alt ?? ''"
              draggable="false"
              class="lightbox__image"
            />
          </div>
        </div>

        <!--DOTS - one per item, current one highlighted. Click to jump.-->
        <div v-if="items.length > 1" class="lightbox__dots">
          <button
            v-for="(_, i) in items"
            :key="i"
            type="button"
            class="lightbox__dot"
            :class="{ 'lightbox__dot--active': i === index }"
            :aria-label="`Go to image ${i + 1}`"
            @click="goTo(i)"
          ></button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background-color: hsl(0 0% 0% / 0.92);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none;
}

/*Close button - top-right corner.*/
.lightbox__close {
  position: absolute;
  top:   var(--spacing-md);
  right: var(--spacing-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-2xl);
  height: var(--spacing-2xl);
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-text-secondary);
  color: var(--color-text-hover);
  cursor: pointer;
  z-index: 5;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}
.lightbox__close:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

/*Arrow buttons - left + right of the stage on desktop.*/
.lightbox__arrow {
  position: absolute;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-3xl);
  height: var(--spacing-3xl);
  transform: translateY(-50%);
  background-color: hsl(0 0% 0% / 0.4);
  border: var(--border-width-sm) solid var(--color-text-secondary);
  color: var(--color-text-hover);
  cursor: pointer;
  z-index: 5;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}
.lightbox__arrow:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background-color: hsl(0 0% 0% / 0.7);
}
.lightbox__arrow--prev { left:  var(--spacing-md); }
.lightbox__arrow--next { right: var(--spacing-md); }

/*Track + slides - each slide is one viewport wide; translateX moves
between them.*/
.lightbox__track {
  display: flex;
  width: 100%;
  height: 100%;
  transition: transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1);
  touch-action: pan-y;
  cursor: grab;
}
.lightbox__track:active { cursor: grabbing; }

.lightbox__slide {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl);
  box-sizing: border-box;
}

.lightbox__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

/*Dot pagination - bottom-center, one per item.*/
.lightbox__dots {
  position: absolute;
  bottom: var(--spacing-lg);
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: var(--spacing-xs);
  z-index: 5;
}
.lightbox__dot {
  width:  var(--spacing-xs);
  height: var(--spacing-xs);
  border: var(--border-width-sm) solid var(--color-text-hover);
  background-color: transparent;
  cursor: pointer;
  padding: 0;
  transition: background-color 0.15s ease, transform 0.15s ease;
}
.lightbox__dot--active {
  background-color: var(--color-text-hover);
  transform: scale(1.4);
}

/*Open/close transition - quick fade + slight scale.*/
.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.18s ease;
}
.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}

/*Phone tweaks - arrows hidden, swipe is the only nav. Dots bigger so
they're easier to tap.*/
@media (max-width: 480px) {
  .lightbox__arrow { display: none; }
  .lightbox__dot {
    width:  var(--spacing-sm);
    height: var(--spacing-sm);
  }
  .lightbox__slide { padding: var(--spacing-md); }
}
html.simulate-phone .lightbox__arrow { display: none; }
html.simulate-phone .lightbox__dot {
  width:  var(--spacing-sm);
  height: var(--spacing-sm);
}
</style>
