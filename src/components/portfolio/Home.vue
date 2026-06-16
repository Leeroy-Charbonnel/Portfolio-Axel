<script setup lang="ts">
import { computed } from "vue"
import { useLanguage } from "../../composables/useLanguage"
import AnimatedReveal from "./AnimatedReveal.vue"

const { t } = useLanguage()

const nameParts = computed(() => {
  const parts = t("homeName").split(" ")
  return {
    head: parts.slice(0, parts.length - 1).join(" "),
    tail: parts[parts.length - 1] ?? "",
  }
})
</script>

<template>
  <section id="home" class="home-section">
    <div class="home-section__gradient home-section__gradient--top"></div>
    <div class="home-section__gradient home-section__gradient--bottom"></div>

    <div class="home-section__container border-sm">
      <div class="home-section__content">
        <AnimatedReveal
          direction="bottom"
          :distance="50"
          :duration="0.8"
          :once="true"
          :threshold="0.1"
          class="home-section__title-wrap"
        >
          <h1 class="home-section__title">{{ t("homeTitle") }}</h1>
        </AnimatedReveal>

        <div class="home-section__grid-overlay"></div>

        <AnimatedReveal
          direction="bottom"
          :distance="0"
          :duration="1"
          :delay="0.5"
          :once="true"
          :initial-opacity="0"
          :final-opacity="1"
          class="home-section__info-wrap"
        >
          <div class="home-section__subtitle">
            <span class="home-section__name-head">{{ nameParts.head }}</span>
            <span class="home-section__name-tail">{{ nameParts.tail }}</span>
          </div>
          <p class="home-section__role">{{ t("homeSubtitle") }}</p>
        </AnimatedReveal>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-section {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

.home-section::after {
  content: "";
  height: var(--border-width-md);
  background: var(--color-background-gray-200);
  width: 80%;
  position: absolute;
  bottom: 0;
}

.home-section__gradient {
  position: absolute;
  pointer-events: none;
  background-size: 100% 100%;
  background-position: 0 0;
  background-image: radial-gradient(circle, hsl(var(--foreground) / 0.2) 0%, hsl(var(--background) / 0) 25%);
  width: var(--gradient-size);
  height: var(--gradient-size);
}

.home-section__gradient--top {
  --gradient-size: 300vw;
  top:   calc(-1 * var(--gradient-size) / 2);
  right: calc(-1 * var(--gradient-size) / 2);
}

.home-section__gradient--bottom {
  --gradient-size: 250vw;
  bottom: calc(-1 * var(--gradient-size) / 2);
  left:   calc(-1 * var(--gradient-size) / 2);
}

.home-section__container {
  --margin: 170px;
  position: relative;
  height: calc(100% - var(--margin));
  width:  calc(100% - var(--margin));
}

.home-section__content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  height: 100%;
}

.home-section__title-wrap {
  position: relative;
  max-width: 800px;
  width: 100%;
}

.home-section__title {
  font-size: var(--font-size-5xl);
  font-weight: 900;
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  color: var(--color-text-hover);
}

.home-section__info-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
}

.home-section__subtitle {
  display: flex;
  flex-direction: row;
  gap: var(--spacing-sm);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-normal);
}

.home-section__name-tail {
  color: var(--color-accent);
}

.home-section__role {
  font-size: var(--font-size-md);
  letter-spacing: var(--letter-spacing-normal);
  text-transform: uppercase;
}

.home-section__grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(hsl(var(--foreground) / 0.1) var(--border-width-sm), transparent var(--border-width-sm)),
    linear-gradient(90deg, hsl(var(--foreground) / 0.1) var(--border-width-sm), transparent var(--border-width-sm));
  background-size: 50px 50px;
  pointer-events: none;
}

@media (pointer: none), (pointer: coarse) {
  .home-section__container {
    --margin: 20px;
  }
}

@media (max-width: 768px) {
  .home-section__title    { font-size: var(--font-size-3xl); }
  .home-section__subtitle { font-size: var(--font-size-lg); }
  .home-section__title-wrap { margin-bottom: var(--spacing-xl); padding: var(--spacing-lg); }
}

@media (max-width: 480px) {
  .home-section__title    { font-size: var(--font-size-xl); }
  .home-section__subtitle { font-size: var(--font-size-md); }
  .home-section__role     { font-size: var(--font-size-base); }
}
</style>
