<script setup lang="ts">
import { computed } from "vue"
import { useLanguage } from "../../composables/useLanguage"
import AnimatedReveal from "./AnimatedReveal.vue"
import type { ExperienceDto } from "../../types/portfolio"

const props = defineProps<{ experience: ExperienceDto; index: number }>()

const { lang } = useLanguage()

const periodParts = computed(() => props.experience.period[lang.value].split("-"))
</script>

<template>
  <AnimatedReveal
    direction="left"
    :distance="50"
    :duration="0.6"
    :delay="index * 0.2"
    :threshold="0.1"
    :initial-opacity="0"
    :final-opacity="1"
    class="experience-item"
  >
    <div class="experience-item__period">
      <div>{{ periodParts[0] }}</div>
      <div v-if="periodParts[1]">{{ periodParts[1] }}</div>
    </div>

    <div class="experience-item__content">
      <h3 class="experience-item__title">{{ experience.title[lang] }}</h3>
      <div class="experience-item__company">
        {{ experience.company }}
        <span class="experience-item__location">({{ experience.location }})</span>
      </div>

      <ul class="experience-item__description-list">
        <li
          v-for="(line, idx) in experience.description[lang]"
          :key="idx"
          class="experience-item__description"
        >
          {{ line }}
        </li>
      </ul>
    </div>
  </AnimatedReveal>
</template>

<style scoped>
.experience-item {
  display: flex;
  margin-bottom: var(--spacing-2xl);
  position: relative;
}

.experience-item__period {
  font-weight: var(--font-weight-bold);
  padding-right: var(--spacing-md);
  text-align: right;
  flex-shrink: 0;
}

.experience-item__content {
  flex: 1;
  padding-left: var(--spacing-xl);
  position: relative;
}

.experience-item__content::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 100%;
  background: linear-gradient(to bottom, var(--color-background-gray-300), transparent);
}

.experience-item__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-normal);
  margin-bottom: var(--spacing-sm);
}

.experience-item__company {
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

.experience-item__location { color: var(--color-text-tertiary); }

.experience-item__description-list { list-style: none; padding: 0; }

.experience-item__description {
  margin-bottom: var(--spacing-xs);
  position: relative;
  padding-left: var(--spacing-lg);
  line-height: 1.6;
}

.experience-item__description::before {
  content: "";
  position: absolute;
  top: 0.7rem;
  left: 0;
  width: 8px;
  height: 2px;
  background-color: hsl(0 0% 100% / 0.5);
}

@media (max-width: 768px) {
  .experience-item { flex-direction: column; }
  .experience-item__period {
    width: 100%;
    text-align: left;
    padding-right: 0;
    padding-left: var(--spacing-lg);
    margin-bottom: var(--spacing-md);
    display: flex;
  }
  .experience-item__period > div:first-child::after {
    content: "-";
    margin: 0 var(--spacing-xs);
  }
  .experience-item__content { padding-left: var(--spacing-lg); }
}
</style>
