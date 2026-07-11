<script setup lang="ts">
import { useLanguage } from "../../../composables/useLanguage"
import { pickBilingual } from "../../../lib/markdown"
import type { QuoteBlockContent } from "../../../types/portfolio"

//QUOTE - large typographic quote with an optional author line.

defineProps<{ content: QuoteBlockContent }>()
const { lang } = useLanguage()
</script>

<template>
  <figure class="bquote">
    <blockquote class="bquote__text">{{ pickBilingual(content.text, lang) }}</blockquote>
    <figcaption v-if="content.author" class="bquote__author">{{ content.author }}</figcaption>
  </figure>
</template>

<style scoped>
.bquote {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--spacing-sm);
  width: 100%;
  height: 100%;
  margin: 0;
  padding: var(--spacing-lg);
  overflow: auto;
}
.bquote__text {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  font-style: italic;
  line-height: 1.4;
  color: var(--color-text-hover);
  word-break: break-word;
}
.bquote__text::before { content: "\201C"; color: var(--color-accent); }
.bquote__text::after  { content: "\201D"; color: var(--color-accent); }
.bquote__author {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
}
.bquote__author::before { content: "\2014\00A0"; }
</style>
