<script setup lang="ts">
import { useLanguage } from "../../composables/useLanguage"
import { usePortfolio } from "../../composables/usePortfolio"
import AnimatedReveal from "./AnimatedReveal.vue"
import ExperienceItem from "./ExperienceItem.vue"
import About from "./About.vue"
import AddButton from "./AddButton.vue"
import type { ExperienceDto, ProfileDto } from "../../types/portfolio"

defineProps<{
  experiences: ExperienceDto[]
  profile:     ProfileDto
}>()

const { t } = useLanguage()
const { createExperience } = usePortfolio()
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
            v-for="(exp, idx) in experiences"
            :key="exp.id"
            :experience="exp"
            :index="idx"
          />

          <AddButton label="Add experience" @click="createExperience" />
        </div>

        <About :profile="profile" />
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

.experience-section__content { margin-top: var(--spacing-3xl); }
.experience-section__timeline { margin-bottom: var(--spacing-3xl); }

@media (max-width: 768px) {
  .experience-section__content { margin-top: var(--spacing-xl); }
}
</style>
