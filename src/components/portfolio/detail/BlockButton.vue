<script setup lang="ts">
import { ArrowUpRight } from "lucide-vue-next"
import { useLanguage } from "../../../composables/useLanguage"
import { pickBilingual } from "../../../lib/markdown"
import type { ButtonBlockContent } from "../../../types/portfolio"

//BUTTON - single CTA link (ArtStation, download, external page...).

defineProps<{ content: ButtonBlockContent }>()
const { lang } = useLanguage()
</script>

<template>
  <div class="bbutton">
    <a
      class="bbutton__link"
      :href="content.url || '#'"
      :target="content.newTab ? '_blank' : undefined"
      :rel="content.newTab ? 'noopener noreferrer' : undefined"
    >
      <span>{{ pickBilingual(content.label, lang) || "Link" }}</span>
      <ArrowUpRight :size="16" />
    </a>
  </div>
</template>

<style scoped>
.bbutton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: var(--spacing-md);
}
.bbutton__link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-xl);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  background-color: var(--color-accent);
  color: hsl(0 0% 0%);
  transition: background-color var(--transition-fast) ease, color var(--transition-fast) ease;
}
.bbutton__link:hover {
  background-color: var(--color-accent-hover);
}
</style>
