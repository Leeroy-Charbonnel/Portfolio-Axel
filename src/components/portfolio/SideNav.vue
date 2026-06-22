<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue"
import { useLanguage } from "../../composables/useLanguage"

//Vertical-text fixed nav. Matches the floating-layout reference: tiny
//uppercase labels rotated 90deg, flush against the left edge, stacked
//vertically and centered. Active section follows the scroll position.
//
//Labels are computed so they re-evaluate once the translations API call
//resolves. Without this, `t()` runs once at setup time before the DB
//returns and labels stay stuck on the raw keys (navHome, navProjects, ...).

const { t } = useLanguage()

const sections = computed(() => [
  { id: "home",       label: t("navHome") },
  { id: "projects",   label: t("navProjects") },
  { id: "gallery",    label: t("navGallery") },
  { id: "experience", label: t("navExperience") },
])

const activeId = ref("home")

function handleScroll() {
  const scrollY = window.scrollY
  for (const section of sections.value) {
    const el = document.getElementById(section.id)
    if (!el) continue
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (scrollY >= top - 100 && scrollY < bottom - 100) {
      activeId.value = section.id
      break
    }
  }
}

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  window.scrollTo({ top: el.offsetTop, behavior: "smooth" })
}

onMounted(() => {
  window.addEventListener("scroll", handleScroll, { passive: true })
  handleScroll()
})

onBeforeUnmount(() => {
  window.removeEventListener("scroll", handleScroll)
})
</script>

<template>
  <nav class="side-nav" aria-label="Sections">
    <button
      v-for="section in sections"
      :key="section.id"
      type="button"
      class="side-nav__link"
      :class="{ 'side-nav__link--active': activeId === section.id }"
      @click="scrollTo(section.id)"
    >
      {{ section.label }}
    </button>
  </nav>
</template>

<style scoped>
.side-nav {
  position: fixed;
  top: 50%;
  left: var(--nav-left);
  transform: translateY(-50%);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: var(--nav-gap);
}

.side-nav__link {
  color: var(--color-text-tertiary);
  background: transparent;
  border: none;
  padding: 0;
  font-size: var(--nav-font-size);
  font-weight: var(--nav-font-weight);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  cursor: pointer;
  transition: color 0.2s ease;
  font-family: inherit;
}

.side-nav__link:hover {
  color: var(--color-text-hover);
}

.side-nav__link--active {
  color: var(--color-accent);
}

@media (max-width: 480px) {
  .side-nav { display: none; }
}
</style>
