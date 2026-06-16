<script setup lang="ts">
import { useLanguage } from "../../composables/useLanguage"
import AnimatedReveal from "./AnimatedReveal.vue"
import type { ProfileDto } from "../../types/portfolio"

defineProps<{ profile: ProfileDto }>()

const { t, lang } = useLanguage()
</script>

<template>
  <div class="about">
    <AnimatedReveal
      direction="bottom"
      :distance="30"
      :duration="0.6"
      :initial-opacity="0"
      :final-opacity="1"
      class="about__section"
    >
      <h3 class="about__heading">{{ t("experienceAbout") }}</h3>
      <div class="about__content">
        <div v-if="profile.avatarUrl" class="about__avatar">
          <a href="https://sketchfab.com/Obambulatesart" target="_blank" rel="noopener noreferrer">
            <img :src="profile.avatarUrl" alt="Axel Offret avatar" width="100" height="100" />
          </a>
        </div>
        <p class="about__text">{{ profile.about[lang] }}</p>
      </div>
    </AnimatedReveal>

    <div class="about__columns">
      <AnimatedReveal
        direction="bottom"
        :distance="30"
        :duration="0.6"
        :delay="0.2"
        :initial-opacity="0"
        :final-opacity="1"
      >
        <h3 class="about__heading">{{ t("experienceContact") }}</h3>
        <ul class="about__contact-list">
          <li class="about__contact-item">
            <span class="about__contact-label">{{ t("experiencePhone") }}</span>
            <span>{{ profile.contact.phone }}</span>
          </li>
          <li class="about__contact-item">
            <span class="about__contact-label">{{ t("experienceMail") }}</span>
            <span>{{ profile.contact.email }}</span>
          </li>
          <li class="about__contact-item">
            <span class="about__contact-label">{{ t("experienceInsta") }}</span>
            <span>{{ profile.contact.instagram }}</span>
          </li>
        </ul>
      </AnimatedReveal>

      <AnimatedReveal
        direction="bottom"
        :distance="30"
        :duration="0.6"
        :delay="0.3"
        :initial-opacity="0"
        :final-opacity="1"
      >
        <h3 class="about__heading">{{ t("experienceInterest") }}</h3>
        <div class="about__interests-columns">
          <div>
            <h4 class="about__interest-title">{{ t("experienceGames") }}</h4>
            <ul class="about__interest-list">
              <li v-for="(game, idx) in profile.interests.games" :key="idx">{{ game }}</li>
            </ul>
          </div>
          <div>
            <h4 class="about__interest-title">{{ t("experienceArt") }}</h4>
            <ul class="about__interest-list">
              <li v-for="(art, idx) in profile.interests.art" :key="idx">{{ art }}</li>
            </ul>
          </div>
        </div>
      </AnimatedReveal>
    </div>
  </div>
</template>

<style scoped>
.about {
  background-color: hsl(0 0% 8% / 0.7);
  border: var(--border-width-sm) solid hsl(0 0% 100% / 0.1);
  padding: var(--spacing-xl);
  margin-top: var(--spacing-2xl);
}

.about__section { margin-bottom: var(--spacing-xl); }

.about__heading {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-normal);
  margin-bottom: var(--font-size-lg);
  text-transform: uppercase;
  position: relative;
  display: inline-block;
}

.about__heading::after {
  content: "";
  position: absolute;
  width: 40%;
  height: 2px;
  background-color: var(--color-border-primary);
  bottom: -0.5rem;
  left: 0;
}

.about__content {
  display: flex;
  align-items: flex-start;
  gap: var(--font-size-lg);
}

.about__avatar {
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
  transition: box-shadow 0.3s ease;
}

.about__avatar img {
  display: block;
  width: 100%;
  height: 100%;
}

.about__avatar:hover {
  box-shadow: 0 0 0 var(--border-width-md) var(--color-border-muted);
}

.about__text { line-height: 1.8; white-space: pre-line; }

.about__columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-xl);
}

.about__contact-list,
.about__interest-list {
  list-style: none;
  padding: 0;
}

.about__contact-item {
  margin-bottom: var(--spacing-md);
  display: flex;
  flex-direction: column;
}

.about__contact-label {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.about__interests-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--font-size-base);
}

.about__interest-title {
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-normal);
  color: var(--color-text-secondary);
}

@media (max-width: 1024px) {
  .about__content {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .about__section { text-align: center; }
  .about__heading::after { left: 30%; }
}

@media (max-width: 768px) {
  .about__columns,
  .about__interests-columns {
    grid-template-columns: 1fr;
  }
  .about { padding: var(--spacing-lg); }
}
</style>
