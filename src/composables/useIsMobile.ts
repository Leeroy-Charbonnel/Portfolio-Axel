import { ref, onMounted, onUnmounted } from "vue"

const MOBILE_BREAKPOINT = "(max-width: 720px)"

export function useIsMobile() {
  const isMobile = ref(false)
  let mql: MediaQueryList | null = null

  function update(e: MediaQueryListEvent | MediaQueryList) {
    isMobile.value = e.matches
  }

  onMounted(() => {
    if (typeof window === "undefined") return
    mql = window.matchMedia(MOBILE_BREAKPOINT)
    isMobile.value = mql.matches
    mql.addEventListener("change", update)
  })

  onUnmounted(() => {
    if (mql) mql.removeEventListener("change", update)
  })

  return { isMobile }
}
