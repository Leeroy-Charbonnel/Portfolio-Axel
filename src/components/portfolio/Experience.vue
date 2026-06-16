<script setup lang="ts">
import { useLanguage } from "../../composables/useLanguage"
import AnimatedReveal from "./AnimatedReveal.vue"
import ExperienceItem from "./ExperienceItem.vue"
import About from "./About.vue"
import type { Bilingual, Contact, Experience as ExperienceType, Interests } from "../../types/portfolio"

defineProps<{
  experiences: ExperienceType[]
  about:       Bilingual
  contact:     Contact
  interests:   Interests
}>()

const { t } = useLanguage()
</script>

<template>
  <section id="experience" class="experience-section">
    <div class="container">
      <AnimatedReveal direction="bottom" :distance="50" :duration="0.8" :threshold="0.1">
        <h2 class="section-title">{{ t("experienceTitle") }}</h2>
      </AnimatedReveal>

      <div class="experience-section__content">
        <div class="experience-section__timeline">
          <ExperienceItem
            v-for="(experience, idx) in experiences"
            :key="idx"
            :experience="experience"
            :index="idx"
          />
        </div>

        <About :about="about" :contact="contact" :interests="interests" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.experience-section {
  background: linear-gradient(to bottom, var(--color-background), var(--color-background-secondary));
  padding-top: var(--spacing-5xl);
  padding-bottom: var(--spacing-6xl);
}

.experience-section__content {
  margin-top: var(--spacing-3xl);
}

.experience-section__timeline {
  margin-bottom: var(--spacing-3xl);
}

@media (max-width: 768px) {
  .experience-section__content { margin-top: var(--spacing-xl); }
}
</style>
