import { computed, ref } from "vue"

//LIGHTBOX - module-level state so any component can call open() and the
//single mounted <LightboxCarousel /> in App.vue picks it up. Infinite
//wrap is handled by modulo arithmetic in next/prev/goTo.

export interface LightboxItem {
  url: string
  alt?: string
}

const items   = ref<LightboxItem[]>([])
const index   = ref(0)
const isOpen  = ref(false)

function wrap(i: number, len: number): number {
  return ((i % len) + len) % len
}

function open(its: LightboxItem[], startIndex = 0) {
  if (its.length === 0) return
  items.value = its
  index.value = wrap(startIndex, its.length)
  isOpen.value = true
}

function close() { isOpen.value = false }

function next() { if (items.value.length) index.value = wrap(index.value + 1, items.value.length) }
function prev() { if (items.value.length) index.value = wrap(index.value - 1, items.value.length) }
function goTo(i: number) { if (items.value.length) index.value = wrap(i, items.value.length) }

const current = computed<LightboxItem | null>(() => items.value[index.value] ?? null)

export function useLightbox() {
  return { items, index, isOpen, current, open, close, next, prev, goTo }
}
