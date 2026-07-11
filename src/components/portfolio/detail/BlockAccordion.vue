<script setup lang="ts">
import { ref, watch } from "vue"
import { ChevronDown } from "lucide-vue-next"
import { useLanguage } from "../../../composables/useLanguage"
import { pickBilingual, renderMd } from "../../../lib/markdown"
import type { AccordionBlockContent } from "../../../types/portfolio"

//ACCORDION - collapsible sections with markdown bodies. First item
//starts open so the block never renders as a wall of closed bars.

const props = defineProps<{ content: AccordionBlockContent }>()

const { lang } = useLanguage()

const openIdx = ref<number | null>(props.content.items.length > 0 ? 0 : null)

watch(() => props.content.items.length, (n) => {
  if (openIdx.value !== null && openIdx.value >= n) openIdx.value = n > 0 ? 0 : null
})

function toggle(i: number) {
  openIdx.value = openIdx.value === i ? null : i
}
</script>

<template>
  <div class="accordion md-content">
    <p v-if="!content.items.length" class="accordion__empty">No sections</p>
    <section
      v-for="(item, i) in content.items"
      :key="i"
      class="accordion__item"
      :class="{ 'accordion__item--open': openIdx === i }"
    >
      <button type="button" class="accordion__head" :aria-expanded="openIdx === i" @click.stop="toggle(i)">
        <span class="accordion__title">{{ pickBilingual(item.title, lang) || `Section ${i + 1}` }}</span>
        <ChevronDown :size="14" class="accordion__chevron" />
      </button>
      <div v-show="openIdx === i" class="accordion__body" v-html="renderMd(pickBilingual(item.body, lang))"></div>
    </section>
  </div>
</template>

<style scoped>
.accordion {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.accordion__empty {
  margin: auto;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}
.accordion__item {
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
}
.accordion__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: transparent;
  border: none;
  color: var(--color-text-hover);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-tight);
  cursor: pointer;
  text-align: left;
}
.accordion__head:hover { color: var(--color-accent); }
.accordion__chevron { flex-shrink: 0; transition: transform 0.15s ease; }
.accordion__item--open .accordion__chevron { transform: rotate(180deg); }
.accordion__body {
  padding: 0 var(--spacing-md) var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
</style>
