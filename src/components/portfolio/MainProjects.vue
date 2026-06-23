<script setup lang="ts">
import { useLanguage } from "../../composables/useLanguage"
import { useIsPhone } from "../../composables/useIsPhone"
import { usePortfolio } from "../../composables/usePortfolio"
import AnimatedReveal from "./AnimatedReveal.vue"
import MainProject from "./MainProject.vue"
import MainProjectPhone from "./MainProjectPhone.vue"
import AddButton from "./AddButton.vue"
import type { MainProjectDto } from "../../types/portfolio"

defineProps<{ projects: MainProjectDto[] }>()

const { t } = useLanguage()
const { createMainProject } = usePortfolio()
const { isPhone } = useIsPhone()
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

    <!--PHONE LIST - normal block stacking; each card is a CSS grid that
    sizes itself via aspect-ratio.-->
    <div v-if="isPhone" class="main-projects-section__phone-list">
      <MainProjectPhone
        v-for="(project, idx) in projects"
        :key="project.id"
        :project="project"
        :index="idx"
      />
    </div>

    <!--DESKTOP LIST - normal block flow stacking.-->
    <div v-else class="main-projects-section__list">
      <MainProject
        v-for="(project, idx) in projects"
        :key="project.id"
        :project="project"
        :index="idx"
      />

      <div class="container main-projects-section__add">
        <AddButton label="Add main project" @click="createMainProject" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.main-projects-section { padding-top: var(--spacing-2xl); }

.main-projects-section__list { margin-top: var(--spacing-3xl); }

.main-projects-section__phone-list {
  width: 100%;
  padding: 0 var(--spacing-md);
  margin-top: var(--spacing-xl);
}

.main-projects-section__add { margin-bottom: var(--spacing-3xl); }

@media (max-width: 768px) {
  .main-projects-section__list { margin-top: var(--spacing-xl); }
}
</style>
