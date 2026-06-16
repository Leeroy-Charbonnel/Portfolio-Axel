<script setup lang="ts">
import { ref, watch } from "vue"
import { useInView } from "../../composables/useInView"
import { formatNumber } from "../../lib/portfolio-utils"

interface Props {
  from:     number
  to:       number
  duration?: number
}

const props = withDefaults(defineProps<Props>(), {
  duration: 2,
})

const root = ref<HTMLSpanElement | null>(null)
const display = ref(formatNumber(props.from))
const { inView } = useInView(root, { once: true, rootMargin: "0px 0px 100px 0px" })

const easeOut = (x: number) => 1 - Math.pow(1 - x, 2)

watch(inView, (isInView) => {
  if (!isInView) return

  //honor the user's reduced-motion preference
  if (window.matchMedia("(prefers-reduced-motion)").matches) {
    display.value = formatNumber(props.to)
    return
  }

  const startTs = performance.now()
  const total = props.duration * 1000

  function tick(ts: number) {
    const progress = Math.min((ts - startTs) / total, 1)
    const current = props.from + (props.to - props.from) * easeOut(progress)
    display.value = formatNumber(current)
    if (progress < 1) requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
})
</script>

<template>
  <span ref="root">{{ display }}</span>
</template>
