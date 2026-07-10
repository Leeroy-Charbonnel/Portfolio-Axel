import { ref } from "vue"

//PHONE DETECTION - module-scoped shared ref (project rule #7). Tracks real
//viewport width <= 480 and the html.simulate-phone class so the CssVarsPanel
//preview also routes through the phone layout. One MediaQueryList listener +
//one MutationObserver for the whole app, registered lazily on first use;
//they stay alive for the page lifetime (the ref is global, so is the wiring).

const PHONE_MAX_WIDTH_PX = 480

const isPhone = ref(false)
let wired = false

function sync() {
  const narrow    = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH_PX}px)`).matches
  const simulated = document.documentElement.classList.contains("simulate-phone")
  isPhone.value   = narrow || simulated
}

function wire() {
  if (wired || typeof window === "undefined") return
  wired = true
  sync()
  window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH_PX}px)`).addEventListener("change", sync)
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
}

export function useIsPhone() {
  wire()
  return { isPhone }
}
