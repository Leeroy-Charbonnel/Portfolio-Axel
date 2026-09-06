<script setup lang="ts">
import { lastSectionCounts } from "../../composables/usePortfolio"

//WHAT THE PAGE LOOKS LIKE WHILE /api/portfolio IS IN FLIGHT.
//
//It reuses the real section classes, so the titles and the outer spacing are
//already the right size, and each placeholder carries the shape of the thing it
//stands in for: a project card is a stage at --mp-viewer-aspect, a gallery card
//is one cell of the same grid. Nothing shifts when the data lands except the
//text filling in.
//
//The counts are the ones the page drew last time, kept by usePortfolio, so a
//returning visitor sees the right number of cards rather than a guess.
const counts = lastSectionCounts()
</script>

<template>
  <div class="skeleton" aria-hidden="true">
    <section class="main-projects-section">
      <div class="skeleton__title"></div>
      <div class="main-projects-section__list">
        <div v-for="i in counts.projects" :key="i" class="skeleton__project">
          <div class="skeleton__project-head"></div>
          <div class="skeleton__stage"></div>
        </div>
      </div>
    </section>

    <section class="gallery-section">
      <div class="skeleton__title"></div>
      <div class="skeleton__gallery">
        <div v-for="i in counts.gallery" :key="i" class="skeleton__card"></div>
      </div>
    </section>

    <section class="experience-section">
      <div class="skeleton__title"></div>
      <div class="skeleton__timeline">
        <div v-for="i in counts.experiences" :key="i" class="skeleton__row"></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/*one surface for every placeholder, faint enough to read as "not content yet"*/
.skeleton__title,
.skeleton__project-head,
.skeleton__stage,
.skeleton__card,
.skeleton__row {
  background-color: var(--tag-bg);
  border-radius: var(--radius);
}

.skeleton__title {
  width: 14rem;
  height: var(--font-size-2xl);
  margin: 0 auto var(--spacing-xl);
}

.skeleton__project {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-4xl);
}

.skeleton__project-head {
  width: 40%;
  height: var(--font-size-xl);
}

/*the same ratio the real stage uses, so the page height is already correct*/
.skeleton__stage {
  width: 100%;
  aspect-ratio: var(--mp-viewer-aspect);
}

.skeleton__gallery {
  display: grid;
  grid-template-columns: repeat(var(--gallery-columns), 1fr);
  gap: var(--spacing-lg);
}

.skeleton__card {
  aspect-ratio: var(--gallery-card-aspect, 4 / 3);
}

.skeleton__timeline {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.skeleton__row {
  height: var(--spacing-5xl);
}

/*the placeholders breathe rather than sit still, so a slow network reads as
loading instead of broken. Off for anyone who asked for less motion.*/
@media (prefers-reduced-motion: no-preference) {
  .skeleton__title,
  .skeleton__project-head,
  .skeleton__stage,
  .skeleton__card,
  .skeleton__row {
    animation: skeleton-pulse 1.6s ease-in-out infinite;
  }
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}
</style>
