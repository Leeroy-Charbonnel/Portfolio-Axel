<script setup lang="ts">
import { useLanguage } from "../../../composables/useLanguage"
import { pickBilingual } from "../../../lib/markdown"
import AnimatedCounter from "../AnimatedCounter.vue"
import type { CountersBlockContent } from "../../../types/portfolio"

//COUNTERS - animated numbers (vertices, tris, hours...). Reuses the
//portfolio AnimatedCounter (in-view triggered, reduced-motion aware).

defineProps<{ content: CountersBlockContent }>()
const { lang } = useLanguage()
</script>

<template>
  <div class="bcounters">
    <div v-if="!content.items.length" class="bcounters__empty">No counters</div>
    <div v-for="(item, i) in content.items" :key="i" class="bcounters__item">
      <span class="bcounters__value">
        <AnimatedCounter :from="0" :to="item.value" />
      </span>
      <span class="bcounters__label">{{ pickBilingual(item.label, lang) }}</span>
    </div>
  </div>
</template>

<style scoped>
.bcounters {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  width: 100%;
  height: 100%;
  padding: var(--spacing-md);
  overflow: auto;
}
.bcounters__empty {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}
.bcounters__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xxs);
}
.bcounters__value {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-black);
  color: var(--color-accent);
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  line-height: 1;
}
.bcounters__label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
}
</style>
