<script setup lang="ts">
import { usePortfolio } from "../composables/usePortfolio"
import Home           from "../components/portfolio/Home.vue"
import MainProjects   from "../components/portfolio/MainProjects.vue"
import ProjectGallery from "../components/portfolio/ProjectGallery.vue"
import Experience     from "../components/portfolio/Experience.vue"

const { data, loading, error } = usePortfolio()
</script>

<template>
  <div class="portfolio">
    <!--Home renders immediately from translations; the rest waits for /api/portfolio-->
    <Home />

    <template v-if="data">
      <MainProjects :projects="data.mainProjects" />
      <ProjectGallery :projects="data.galleryProjects" />
      <Experience
        v-if="data.profile"
        :experiences="data.experiences"
        :profile="data.profile"
      />
    </template>

    <p v-else-if="loading" class="portfolio__status">Loading…</p>

    <p v-else-if="error" class="portfolio__status portfolio__status--error">
      Failed to load portfolio: {{ error }}
    </p>
  </div>
</template>

<style scoped>
.portfolio {
  position: relative;
}

.portfolio__status {
  text-align: center;
  padding: var(--spacing-3xl) var(--spacing-md);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-normal);
}

.portfolio__status--error {
  color: hsl(var(--destructive));
}
</style>
