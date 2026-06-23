import { onBeforeUnmount, onMounted, ref } from "vue"

//PHONE DETECTION - shared reactive ref. Tracks real viewport width <= 480
//and the html.simulate-phone class so the CssVarsPanel preview also
//routes through the phone layout. Components import this instead of
//writing their own matchMedia / observer wiring.

const PHONE_MAX_WIDTH_PX = 480

export function useIsPhone() {
  const isPhone = ref(false)

  function sync() {
    if (typeof window === "undefined") return
    const narrow    = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH_PX}px)`).matches
    const simulated = document.documentElement.classList.contains("simulate-phone")
    isPhone.value   = narrow || simulated
  }

  let mq: MediaQueryList | null = null
  let mo: MutationObserver | null = null

  onMounted(() => {
    if (typeof window === "undefined") return
    sync()
    mq = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH_PX}px)`)
    mq.addEventListener("change", sync)
    mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  })

  onBeforeUnmount(() => {
    mq?.removeEventListener("change", sync)
    mo?.disconnect()
  })

  return { isPhone }
}
