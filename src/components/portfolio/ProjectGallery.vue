<script setup lang="ts">
import { useLanguage } from "../../composables/useLanguage"
import { formatNumber } from "../../lib/portfolio-utils"
import AnimatedReveal from "./AnimatedReveal.vue"
import type { GalleryProjectDto } from "../../types/portfolio"

defineProps<{ projects: GalleryProjectDto[] }>()

const { t, lang } = useLanguage()
</script>

<template>
  <section id="gallery" class="gallery-section">
    <div class="container">
      <AnimatedReveal direction="bottom" :distance="50" :duration="0.8" :threshold="0.1">
        <h2 class="section-title">{{ t("galleryTitle") }}</h2>
      </AnimatedReveal>

      <div class="gallery-grid">
        <AnimatedReveal
          v-for="(project, index) in projects"
          :key="project.id"
          direction="bottom"
          :distance="30"
          :duration="0.6"
          :delay="index * 0.1"
          :threshold="0.1"
          class="gallery-item"
        >
          <a :href="project.link" target="_blank" rel="noopener noreferrer">
            <div class="gallery-item__thumbnail-wrap">
              <img
                v-if="project.imageUrl"
                :src="project.imageUrl"
                :alt="project.title[lang]"
                class="gallery-item__thumbnail"
              />
            </div>

            <div class="gallery-item__details">
              <h3 class="gallery-item__title">{{ project.title[lang] }}</h3>
              <div class="gallery-item__stats">
                <div class="gallery-item__stat">
                  <span class="gallery-item__stat-icon">V</span>
                  {{ formatNumber(project.stats.vertices) }}
                </div>
                <div class="gallery-item__stat">
                  <span class="gallery-item__stat-icon">E</span>
                  {{ formatNumber(project.stats.edges) }}
                </div>
              </div>
            </div>
          </a>
        </AnimatedReveal>
      </div>
    </div>
  </section>
</template>

<style scoped>
.gallery-section {
  background: linear-gradient(to bottom, var(--color-background-secondary), var(--color-background));
  padding-top: var(--spacing-2xl);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-xl);
  margin-top: var(--spacing-3xl);
}

.gallery-item {
  border: var(--border-width-sm) solid hsl(0 0% 100% / 0.1);
  background-color: hsl(0 0% 8% / 0.5);
  overflow: hidden;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
}

.gallery-item:hover {
  border-color: hsl(0 0% 100% / 0.3);
  box-shadow: 0 10px 30px hsl(0 0% 0% / 0.5);
}

.gallery-item__thumbnail-wrap {
  position: relative;
  width: 100%;
  height: 0;
  padding-top: 75%;
  overflow: hidden;
}

.gallery-item__thumbnail {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.gallery-item:hover .gallery-item__thumbnail {
  transform: scale(1.05);
}

.gallery-item__details { padding: var(--spacing-md); }

.gallery-item__title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-xs);
  letter-spacing: var(--letter-spacing-tight);
}

.gallery-item__stats { display: flex; gap: var(--spacing-md); }

.gallery-item__stat {
  display: flex;
  align-items: center;
  gap: var(--spacing-xxs);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.gallery-item__stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background-color: hsl(0 0% 100% / 0.1);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  margin-right: var(--spacing-xxs);
}

@media (max-width: 1024px) {
  .gallery-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  .gallery-grid { grid-template-columns: 1fr; gap: var(--spacing-lg); }
}
</style>
