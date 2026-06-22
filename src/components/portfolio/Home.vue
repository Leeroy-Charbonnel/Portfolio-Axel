<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue"
import { ChevronDown } from "lucide-vue-next"
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

//SCROLL HINT - chevron-down fades in after --home-arrow-delay (1.5s by
//default), bounces gently, hides as soon as the user has scrolled past the
//first viewport so it never lingers over the projects section.
const arrowShown    = ref(false)
const arrowDismissed = ref(false)
let arrowTimer: number | null = null

function onScroll() {
  if (window.scrollY > window.innerHeight * 0.25) arrowDismissed.value = true
}

function jumpToProjects() {
  const el = document.getElementById("projects")
  if (el) window.scrollTo({ top: el.offsetTop, behavior: "smooth" })
  arrowDismissed.value = true
}

function readArrowDelayMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--home-arrow-delay").trim()
  //value is stored as "1.5s" or "1500ms" - both convertible to ms
  if (raw.endsWith("ms")) return parseFloat(raw) || 1500
  if (raw.endsWith("s"))  return (parseFloat(raw) || 1.5) * 1000
  return parseFloat(raw) * 1000 || 1500
}

onMounted(() => {
  arrowTimer = window.setTimeout(() => { arrowShown.value = true }, readArrowDelayMs())
  window.addEventListener("scroll", onScroll, { passive: true })
})

onBeforeUnmount(() => {
  if (arrowTimer !== null) window.clearTimeout(arrowTimer)
  window.removeEventListener("scroll", onScroll)
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

    <button
      type="button"
      class="home-section__scroll-hint"
      :class="{
        'home-section__scroll-hint--visible':  arrowShown && !arrowDismissed,
      }"
      aria-label="Scroll to projects"
      @click="jumpToProjects"
    >
      <ChevronDown :size="28" />
    </button>
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
  position: relative;
  height: calc(100% - var(--home-container-margin));
  width:  calc(100% - var(--home-container-margin));
}

.home-section__content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  height: 100%;
  gap: var(--home-content-gap);
}

/*Title wrap spans the full content width and flex-centers its h1 so the
title stays horizontally anchored to the middle no matter how big it gets.
Without this the old max-width:800px cap let very large fonts spill off
to one side as soon as a line outgrew the cap.*/
.home-section__title-wrap {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.home-section__title {
  font-size: var(--home-title-size);
  font-weight: 900;
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  color: var(--color-text-hover);
  text-align: center;
  white-space: nowrap;
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
  font-size: var(--home-subtitle-size);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-normal);
}

.home-section__name-tail {
  color: var(--color-accent);
}

.home-section__role {
  font-size: var(--home-role-size);
  letter-spacing: var(--letter-spacing-normal);
  text-transform: uppercase;
}

/*GRID OVERLAY - the lattice behind the title. background-position drifts on a
slow loop so the grid feels alive instead of frozen. The drift speed is
exposed as --home-grid-drift-speed for tuning from the panel.*/
.home-section__grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(hsl(var(--foreground) / 0.1) var(--home-grid-line-width), transparent var(--home-grid-line-width)),
    linear-gradient(90deg, hsl(var(--foreground) / 0.1) var(--home-grid-line-width), transparent var(--home-grid-line-width));
  background-size: var(--home-grid-size) var(--home-grid-size);
  pointer-events: none;
  animation: home-grid-drift var(--home-grid-drift-speed) linear infinite;
}

@keyframes home-grid-drift {
  from { background-position: 0 0; }
  to   { background-position: var(--home-grid-size) var(--home-grid-size); }
}

/*SCROLL HINT - chevron centered at the bottom of the home section. Hidden
until --home-arrow-delay has elapsed, fades + slides in, then bounces. Click
jumps to #projects.*/
.home-section__scroll-hint {
  position: absolute;
  bottom: var(--spacing-xl);
  left: 50%;
  transform: translateX(-50%) translateY(8px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-2xl);
  height: var(--spacing-2xl);
  background-color: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.5s ease, transform 0.5s ease;
  z-index: 5;
}

.home-section__scroll-hint--visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  animation: home-scroll-bounce 1.6s ease-in-out infinite;
}

.home-section__scroll-hint:hover { color: var(--color-accent); }

@keyframes home-scroll-bounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50%      { transform: translateX(-50%) translateY(6px); }
}

@media (pointer: none), (pointer: coarse) {
  .home-section__container {
    --home-container-margin: 20px;
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
