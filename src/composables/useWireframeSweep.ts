import { onBeforeUnmount, onMounted, type Ref } from "vue"

//DIAGONAL WIPE LAYOUT - measures the position of every `.wf-layer` inside
//a card root and writes its rect into CSS custom properties on the
//element itself. The wireframe CSS reads those vars plus a single shared
//`--wipe` (0..1) progress on the card root to compute its clip-path - so
//one transition on `--wipe` produces a SINGLE diagonal line sweeping
//across the whole card, passing through each image in turn instead of
//each image running its own independent sweep.
//
//The cardRef points at the element whose descendants carry the
//`.wf-layer` class (the project article on desktop, the mp-phone root
//on phone). Layout is re-measured on window resize and on ResizeObserver
//hits against the card itself, so the variables stay correct when the
//page reflows.

const WF_LAYER_SELECTOR = ".wf-layer"

export function useWireframeSweep(cardRef: Ref<{ $el?: HTMLElement } | HTMLElement | null>) {
  let ro: ResizeObserver | null = null

  function resolveEl(): HTMLElement | null {
    const raw = cardRef.value
    if (!raw) return null
    if ("$el" in raw && raw.$el) return raw.$el
    return raw as HTMLElement
  }

  function measure() {
    const card = resolveEl()
    if (!card) return
    const cardRect = card.getBoundingClientRect()
    if (cardRect.width === 0 || cardRect.height === 0) return
    card.style.setProperty("--card-w", String(cardRect.width))
    card.style.setProperty("--card-h", String(cardRect.height))

    const layers = card.querySelectorAll<HTMLElement>(WF_LAYER_SELECTOR)
    for (const layer of layers) {
      const r = layer.getBoundingClientRect()
      layer.style.setProperty("--my-x", String(r.left - cardRect.left))
      layer.style.setProperty("--my-y", String(r.top  - cardRect.top))
      layer.style.setProperty("--my-w", String(r.width))
      layer.style.setProperty("--my-h", String(r.height))
    }
  }

  onMounted(() => {
    //multiple passes: first synchronously, then after the next paint, then
    //after a beat in case any image is still settling its size. cheap and
    //avoids the diagonal being miscomputed on initial mount.
    measure()
    requestAnimationFrame(measure)
    setTimeout(measure, 250)
    window.addEventListener("resize", measure)
    const card = resolveEl()
    if (card) {
      ro = new ResizeObserver(measure)
      ro.observe(card)
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener("resize", measure)
    ro?.disconnect()
    ro = null
  })

  return { remeasure: measure }
}
