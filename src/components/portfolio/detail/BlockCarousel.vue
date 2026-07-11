<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { ChevronLeft, ChevronRight } from "lucide-vue-next"
import { useLanguage } from "../../../composables/useLanguage"
import { pickBilingual } from "../../../lib/markdown"
import type { CarouselBlockContent } from "../../../types/portfolio"

//CAROUSEL - ordered image strip with arrows + dots. Slides move via a
//translateX on the track (all images stay mounted, no load flash).
//intervalMs > 0 auto-advances; any manual interaction resets the timer.

const props = defineProps<{ content: CarouselBlockContent }>()

const { lang } = useLanguage()

const index = ref(0)
const items = computed(() => props.content.items.filter((i) => i.url))
const count = computed(() => items.value.length)

//Clamp the index if items shrink under it (author removed a slide).
watch(count, (n) => { if (index.value >= n) index.value = Math.max(0, n - 1) })

function go(delta: number) {
  if (count.value === 0) return
  index.value = (index.value + delta + count.value) % count.value
  restartTimer()
}
function goTo(i: number) {
  index.value = i
  restartTimer()
}

let timer: ReturnType<typeof setInterval> | null = null
function restartTimer() {
  if (timer) { clearInterval(timer); timer = null }
  const ms = props.content.intervalMs
  if (ms > 0 && count.value > 1) {
    timer = setInterval(() => { index.value = (index.value + 1) % count.value }, ms)
  }
}
watch(() => props.content.intervalMs, restartTimer, { immediate: true })
watch(count, restartTimer)

onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const caption = computed(() => pickBilingual(items.value[index.value]?.caption, lang.value))
</script>

<template>
  <div class="carousel">
    <div v-if="count === 0" class="carousel__empty">No images</div>
    <template v-else>
      <div class="carousel__track" :style="{ transform: `translateX(-${index * 100}%)` }">
        <img
          v-for="(item, i) in items"
          :key="item.fileId"
          :src="item.url ?? undefined"
          :alt="pickBilingual(item.caption, lang) || `Slide ${i + 1}`"
          class="carousel__img"
          draggable="false"
        />
      </div>

      <template v-if="count > 1">
        <button type="button" class="carousel__arrow carousel__arrow--prev" aria-label="Previous slide" @click.stop="go(-1)">
          <ChevronLeft :size="18" />
        </button>
        <button type="button" class="carousel__arrow carousel__arrow--next" aria-label="Next slide" @click.stop="go(1)">
          <ChevronRight :size="18" />
        </button>
        <div class="carousel__dots">
          <button
            v-for="(item, i) in items"
            :key="item.fileId"
            type="button"
            class="carousel__dot"
            :class="{ 'carousel__dot--active': i === index }"
            :aria-label="`Go to slide ${i + 1}`"
            @click.stop="goTo(i)"
          ></button>
        </div>
      </template>

      <span v-if="caption" class="carousel__caption">{{ caption }}</span>
    </template>
  </div>
</template>

<style scoped>
.carousel {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.carousel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}
.carousel__track {
  display: flex;
  height: 100%;
  transition: transform 0.35s ease;
}
.carousel__img {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.carousel__arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--spacing-xl);
  height: var(--spacing-xl);
  background-color: var(--semi-transparent-dark);
  border: var(--border-width-sm) solid var(--color-border-muted);
  color: var(--color-text-hover);
  cursor: pointer;
  backdrop-filter: blur(var(--filter-blur));
  transition: border-color 0.15s ease, color 0.15s ease;
}
.carousel__arrow:hover { border-color: var(--color-accent); color: var(--color-accent); }
.carousel__arrow--prev { left: var(--spacing-xs); }
.carousel__arrow--next { right: var(--spacing-xs); }
.carousel__dots {
  position: absolute;
  bottom: var(--spacing-xs);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--spacing-xs);
  z-index: 4;
}
.carousel__dot {
  width: var(--spacing-xs);
  height: var(--spacing-xs);
  padding: 0;
  background-color: var(--color-text-tertiary);
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.carousel__dot--active { background-color: var(--color-accent-neutral); }
.carousel__caption {
  position: absolute;
  bottom: calc(var(--spacing-xs) + var(--spacing-md));
  left: var(--spacing-xs);
  z-index: 4;
  padding: var(--spacing-xxs) var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--color-text-hover);
  background-color: var(--semi-transparent-dark);
  backdrop-filter: blur(var(--filter-blur));
  pointer-events: none;
}
</style>
