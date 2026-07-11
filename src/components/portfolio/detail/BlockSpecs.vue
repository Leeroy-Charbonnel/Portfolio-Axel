<script setup lang="ts">
import { useLanguage } from "../../../composables/useLanguage"
import { pickBilingual } from "../../../lib/markdown"
import type { SpecsBlockContent } from "../../../types/portfolio"

//SPECS SHEET - key/value rows (software, polycount, role, year...).
//Zebra backgrounds delimit the rows, no borders.

defineProps<{ content: SpecsBlockContent }>()
const { lang } = useLanguage()
</script>

<template>
  <dl class="bspecs">
    <div v-if="!content.rows.length" class="bspecs__empty">No specs</div>
    <div v-for="(row, i) in content.rows" :key="i" class="bspecs__row">
      <dt class="bspecs__label">{{ pickBilingual(row.label, lang) }}</dt>
      <dd class="bspecs__value">{{ pickBilingual(row.value, lang) }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.bspecs {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.bspecs__empty {
  margin: auto;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}
.bspecs__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-xs) var(--spacing-md);
}
.bspecs__row:nth-child(odd) { background-color: var(--tag-bg); }
.bspecs__label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}
.bspecs__value {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-hover);
  text-align: right;
  word-break: break-word;
}
</style>
