<script setup lang="ts">
import Home          from "../components/portfolio/Home.vue"
import MainProjects  from "../components/portfolio/MainProjects.vue"
import ProjectGallery from "../components/portfolio/ProjectGallery.vue"
import Experience    from "../components/portfolio/Experience.vue"
import projectsData   from "../data/projects.json"
import experienceData from "../data/experience.json"
import type { ProjectsData, ExperienceData } from "../types/portfolio"

const projects   = projectsData   as unknown as ProjectsData
const experience = experienceData as unknown as ExperienceData
</script>

<template>
  <div class="portfolio">
    <Home />
    <MainProjects
      :projects="projects.mainProjects"
      :softwares="projects.software"
    />
    <ProjectGallery :projects="projects.galleryProjects" />
    <Experience
      :experiences="experience.experiences"
      :about="experience.about"
      :contact="experience.contact"
      :interests="experience.interests"
    />
  </div>
</template>

<style scoped>
.portfolio {
  position: relative;
}
</style>
