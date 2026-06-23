<script setup lang="ts">
import { computed } from "vue"
import { useLanguage } from "../../composables/useLanguage"
import { useIsPhone } from "../../composables/useIsPhone"
import { usePortfolio } from "../../composables/usePortfolio"
import AnimatedReveal from "./AnimatedReveal.vue"
import MainProject from "./MainProject.vue"
import MainProjectPhone from "./MainProjectPhone.vue"
import AddButton from "./AddButton.vue"
import type { MainProjectDto } from "../../types/portfolio"

const props = defineProps<{ projects: MainProjectDto[] }>()

const { t } = useLanguage()
const { createMainProject } = usePortfolio()
const { isPhone } = useIsPhone()

//Phone list height = last project's top (n-1 * 60vh) + card height (70vh).
//Matches the MainProjectPhone card's positioning constants.
const phoneListHeight = computed(() => {
  const n = props.projects.length
  if (n === 0) return "0vh"
  return `calc((${n - 1}) * 60vh + 70vh)`
})
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

    <!--PHONE LIST - absolute-positioned children, parent has explicit
    height so scroll still reaches the last project.-->
    <div
      v-if="isPhone"
      class="main-projects-section__phone-list"
      :style="{ height: phoneListHeight }"
    >
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
  position: relative;
  width: 100%;
  margin-top: var(--spacing-xl);
}

.main-projects-section__add { margin-bottom: var(--spacing-3xl); }

@media (max-width: 768px) {
  .main-projects-section__list { margin-top: var(--spacing-xl); }
}
</style>
