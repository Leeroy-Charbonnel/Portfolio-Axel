<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { ChevronLeft, ChevronRight, X } from "lucide-vue-next"
import { useLightbox } from "../../composables/useLightbox"

//LIGHTBOX CAROUSEL - single instance mounted in App.vue. Listens to the
//module-level state from useLightbox; any component opens it by calling
//useLightbox().open([{url,alt}], startIndex).
//
//Truly infinite scroll - duplicate-edges trick: the DOM track holds
//[clone(last), ...items, clone(first)]. Going past the last item slides
//forward into the cloned first; once the slide finishes we teleport
//(transition off) back to the real first at the same visual position.
//Same trick mirrored on the prev edge. So forward and backward feel
//like an infinite belt with no rewind.

const { items, index, isOpen, close, goTo } = useLightbox()

//`position` is the displayed offset inside the extended track. It can
//briefly land on -1 (clone of last) or items.length (clone of first)
//during the transition, then snaps to the real range [0, items.length).
const position           = ref(0)
const transitionEnabled  = ref(true)

const trackOffsetPercent = computed(() => -((position.value + 1) * 100))

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

function next() {
  if (items.value.length === 0) return
  position.value++
}
function prev() {
  if (items.value.length === 0) return
  position.value--
}

//Sync the public `index` (used for the dot pagination + by goTo) with
//`position`. Whenever position lands on a "real" slot, index follows.
watch(position, (p) => {
  const n = items.value.length
  if (n === 0) return
  if (p >= 0 && p < n) index.value = p
})

//Jumping via a dot click bypasses the carousel anim - we map directly
//to the real index. Reset position to match so the snap behaviour stays
//consistent.
watch(index, (i) => {
  if (i !== ((position.value % items.value.length) + items.value.length) % items.value.length) {
    transitionEnabled.value = true
    position.value = i
  }
})

//When a slide transition ends in the "clone" zone (position -1 or
//position = N), teleport (transition off) to the matching real slot so
//the visitor never sees a rewind. requestAnimationFrame + nextTick
//ensures the no-transition style is applied for at least one paint
//before re-enabling transitions for the NEXT user action.
async function onTrackTransitionEnd() {
  const n = items.value.length
  if (n === 0) return
  if (position.value >= n) {
    transitionEnabled.value = false
    position.value = position.value - n
    await nextTick()
    requestAnimationFrame(() => { transitionEnabled.value = true })
  } else if (position.value < 0) {
    transitionEnabled.value = false
    position.value = position.value + n
    await nextTick()
    requestAnimationFrame(() => { transitionEnabled.value = true })
  }
}

function onKey(e: KeyboardEvent) {
  if (!isOpen.value) return
  if (e.key === "Escape")     { e.preventDefault(); close() }
  if (e.key === "ArrowRight") { e.preventDefault(); next() }
  if (e.key === "ArrowLeft")  { e.preventDefault(); prev() }
}

//On open: reset position to the requested start index with transitions
//disabled so the lightbox appears at the chosen slide without a slide-in
//animation.
watch(isOpen, async (open) => {
  if (typeof document !== "undefined") document.documentElement.style.overflow = open ? "hidden" : ""
  if (!open) return
  transitionEnabled.value = false
  position.value = index.value
  await nextTick()
  requestAnimationFrame(() => { transitionEnabled.value = true })
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

        <!--TRACK - extended with clones of the last item (left edge) and
        the first item (right edge) so going past either edge slides into
        identical content and we teleport back inside the real range with
        the transition disabled. The visitor never sees a rewind.
        Drag offset is added on top so the swipe feels responsive.-->
        <div
          class="lightbox__track"
          :class="{ 'lightbox__track--no-transition': !transitionEnabled }"
          :style="{ transform: `translateX(calc(${trackOffsetPercent}% + ${dragDX}px))` }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @transitionend="onTrackTransitionEnd"
        >
          <!--CLONE of the last item at the head of the track.-->
          <div v-if="items.length" class="lightbox__slide" aria-hidden="true">
            <img
              v-if="items[items.length - 1].url"
              :src="items[items.length - 1].url"
              :alt="''"
              draggable="false"
              class="lightbox__image"
            />
          </div>

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

          <!--CLONE of the first item at the tail of the track.-->
          <div v-if="items.length" class="lightbox__slide" aria-hidden="true">
            <img
              v-if="items[0].url"
              :src="items[0].url"
              :alt="''"
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
/*Toggled during the teleport snap from clone -> real slot so the
position jump is invisible.*/
.lightbox__track--no-transition { transition: none; }

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
