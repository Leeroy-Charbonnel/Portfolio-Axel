<script setup lang="ts">
import { computed, ref } from "vue"
import { useInView } from "../../composables/useInView"

type Direction = "top" | "right" | "bottom" | "left" | "none"

interface Props {
  direction?:      Direction
  distance?:       number
  duration?:       number
  delay?:          number
  once?:           boolean
  threshold?:      number
  initialOpacity?: number
  finalOpacity?:   number
  //if false, the element renders in its final state immediately (no IO wait)
  animateOnMount?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  direction:      "none",
  distance:       50,
  duration:       0.8,
  delay:          0,
  once:           true,
  threshold:      0.1,
  initialOpacity: 0,
  finalOpacity:   1,
  animateOnMount: true,
})

const root = ref<HTMLElement | null>(null)
const { inView } = useInView(root, {
  threshold:  props.threshold,
  rootMargin: "0px 0px 100px 0px",
  once:       props.once,
})

const visible = computed(() => (props.animateOnMount ? inView.value : true))

const initialTransform = computed(() => {
  switch (props.direction) {
    case "top":    return `translateY(-${props.distance}px)`
    case "right":  return `translateX(${props.distance}px)`
    case "bottom": return `translateY(${props.distance}px)`
    case "left":   return `translateX(-${props.distance}px)`
    default:       return "none"
  }
})

//transform creates a stacking context, which would trap child media in a
//local layer (z-index relative to this wrapper, not to the page grain).
//Marking the wrapper position:relative + z-index:2 hoists the whole
//AnimatedReveal box above .grain-overlay (z:1) so every image, iframe and
//video inside it paints on top of the grain instead of underneath it.
const style = computed(() => ({
  position:        "relative" as const,
  zIndex:          2,
  opacity:         visible.value ? props.finalOpacity : props.initialOpacity,
  transform:       visible.value ? "translate(0, 0)" : initialTransform.value,
  transition:      `opacity ${props.duration}s ease, transform ${props.duration}s ease`,
  transitionDelay: `${props.delay}s`,
}))
</script>

<template>
  <div ref="root" :style="style">
    <slot />
  </div>
</template>
