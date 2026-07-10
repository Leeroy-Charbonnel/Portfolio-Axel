import { onMounted, onBeforeUnmount, ref, type ComputedRef, type Ref } from "vue"

interface UseInViewOptions {
  threshold?:  number
  rootMargin?: string
  //if true, stop observing after the first intersection (one-shot reveal)
  once?:       boolean
}

//Observe whether a target element is currently inside the viewport.
//Vue 3 port of the original React useIsInView hook from the portfolio.
export function useInView(target: Ref<HTMLElement | null> | ComputedRef<HTMLElement | null>, options: UseInViewOptions = {}) {
  const { threshold = 0, rootMargin = "0px", once = false } = options
  const inView = ref(false)
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    const el = target.value
    if (!el) return

    observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      if (entry.isIntersecting) {
        inView.value = true
        if (once && observer) {
          observer.disconnect()
          observer = null
        }
      } else if (!once) {
        inView.value = false
      }
    }, { threshold, rootMargin })

    observer.observe(el)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { inView }
}
