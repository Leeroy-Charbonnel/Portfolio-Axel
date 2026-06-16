<script setup lang="ts">
import { useLanguage } from "../../composables/useLanguage"
import AnimatedReveal from "./AnimatedReveal.vue"
import MainProject from "./MainProject.vue"
import type { Project, Software } from "../../types/portfolio"

defineProps<{
  projects:  Project[]
  softwares: Record<string, Software>
}>()

const { t } = useLanguage()
</script>

<template>
  <section id="projects" class="main-projects-section">
    <AnimatedReveal
      direction="bottom"
      :distance="50"
      :duration="0.8"
      :threshold="0.1"
      :initial-opacity="0"
      :final-opacity="1"
    >
      <h2 class="section-title">{{ t("projectsTitle") }}</h2>
    </AnimatedReveal>

    <div class="main-projects-section__list">
      <MainProject
        v-for="(project, idx) in projects"
        :key="idx"
        :project="project"
        :softwares="softwares"
        :index="idx"
      />
    </div>
  </section>
</template>

<style scoped>
.main-projects-section {
  padding-top: var(--spacing-2xl);
}

.main-projects-section__list {
  margin-top: var(--spacing-3xl);
}

@media (max-width: 768px) {
  .main-projects-section__list { margin-top: var(--spacing-xl); }
}
</style>
