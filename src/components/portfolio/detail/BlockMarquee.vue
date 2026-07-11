<script setup lang="ts">
import { computed } from "vue"
import type { MarqueeBlockContent } from "../../../types/portfolio"

//MARQUEE - continuously scrolling image strip, usable as a separator
//between sections. Pure CSS animation: the strip is rendered twice and
//translated by -50%, so the loop is seamless. Duration derives from the
//configured speed (px/s) and an estimated strip length; the exact px
//width doesn't matter for the loop, only the pace feeling.

const props = defineProps<{ content: MarqueeBlockContent }>()

const items = computed(() => props.content.items.filter((i) => i.url))

//Rough strip length estimate: each image renders at ~1.6x the row height
//in width. Good enough to keep the perceived speed stable when slides
//are added or removed.
const durationS = computed(() => {
  const speed = Math.max(10, props.content.speedPxs || 60)
  const estimatedItemPx = 280
  const stripPx = Math.max(1, items.value.length) * estimatedItemPx
  return stripPx / speed
})
</script>

<template>
  <div class="bmarquee" :style="{ '--marquee-duration': `${durationS}s` }">
    <div v-if="!items.length" class="bmarquee__empty">No images</div>
    <div v-else class="bmarquee__track">
      <!--Strip rendered twice for the seamless -50% loop.-->
      <div v-for="copy in 2" :key="copy" class="bmarquee__strip" :aria-hidden="copy === 2">
        <img
          v-for="item in items"
          :key="`${copy}-${item.fileId}`"
          :src="item.url ?? undefined"
          alt=""
          class="bmarquee__img"
          draggable="false"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.bmarquee {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
}
.bmarquee__empty {
  margin: auto;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}
.bmarquee__track {
  display: flex;
  height: 100%;
  width: max-content;
  animation: bmarquee-scroll var(--marquee-duration) linear infinite;
}
.bmarquee__strip {
  display: flex;
  height: 100%;
  gap: var(--spacing-sm);
  padding-right: var(--spacing-sm);
}
.bmarquee__img {
  height: 100%;
  width: auto;
  object-fit: cover;
  display: block;
  user-select: none;
}
@keyframes bmarquee-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@media (prefers-reduced-motion) {
  .bmarquee__track { animation: none; }
}
</style>
