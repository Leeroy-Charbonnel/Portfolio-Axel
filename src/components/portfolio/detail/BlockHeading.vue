<script setup lang="ts">
import { useLanguage } from "../../../composables/useLanguage"
import { pickBilingual } from "../../../lib/markdown"
import type { HeadingBlockContent } from "../../../types/portfolio"

//SECTION HEADING - big brutalist title with an accent bar. Structures
//the page between two block rows.

defineProps<{ content: HeadingBlockContent }>()
const { lang } = useLanguage()
</script>

<template>
  <h2 class="bheading">
    <span class="bheading__bar" aria-hidden="true"></span>
    <span class="bheading__text">{{ pickBilingual(content.text, lang) || "Section" }}</span>
  </h2>
</template>

<style scoped>
.bheading {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0 var(--spacing-md);
  overflow: hidden;
}
.bheading__bar {
  flex-shrink: 0;
  width: var(--spacing-xs);
  height: 60%;
  background-color: var(--color-accent);
}
.bheading__text {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-black);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-hover);
  line-height: 1.1;
  word-break: break-word;
}
</style>
