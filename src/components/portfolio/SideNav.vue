<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue"
import { Home, Move3d, LayoutGrid, FileUser } from "lucide-vue-next"
import { useLanguage } from "../../composables/useLanguage"
import AnimatedReveal from "./AnimatedReveal.vue"

const { t } = useLanguage()

interface NavSection {
  id:    string
  label: string
  Icon:  typeof Home
}

const sections: NavSection[] = [
  { id: "home",       label: t("navHome"),       Icon: Home },
  { id: "projects",   label: t("navProjects"),   Icon: Move3d },
  { id: "gallery",    label: t("navGallery"),    Icon: LayoutGrid },
  { id: "experience", label: t("navExperience"), Icon: FileUser },
]

const activeId  = ref("home")
const expanded  = ref(false)

function handleScroll() {
  const scrollY = window.scrollY
  for (const section of sections) {
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
  <!--animate-on-mount disabled: SideNav is position:fixed and the
  IntersectionObserver doesn't fire reliably for fixed elements, so the
  nav was stuck in its initial -100px translated state (off-screen).
  Skipping the entrance animation makes the nav appear instantly; the
  hover slide on .side-nav-hover--expanded still works.-->
  <AnimatedReveal
    direction="left"
    :distance="100"
    :duration="0.3"
    :animate-on-mount="false"
    class="side-nav-hover"
    :class="{ 'side-nav-hover--expanded': expanded }"
  >
    <nav
      class="side-nav"
      @mouseenter="expanded = true"
      @mouseleave="expanded = false"
    >
      <ul class="side-nav__list">
        <li
          v-for="section in sections"
          :key="section.id"
          class="side-nav__item"
          :class="{ 'side-nav__item--active': activeId === section.id }"
        >
          <button
            type="button"
            class="side-nav__button"
            :aria-label="section.label"
            @click="scrollTo(section.id)"
          >
            <span class="side-nav__icon-wrap">
              <component :is="section.Icon" :size="18" />
            </span>
          </button>
          <span class="side-nav__tooltip">{{ section.label }}</span>
        </li>
      </ul>
    </nav>
  </AnimatedReveal>
</template>

<style scoped>
/*NAV HOVER zone - flush against the left edge by default. Hovering slides
the nav smoothly out from the edge. The wide right-padding is the hover
trigger area: you can move the cursor slightly past the icons and still
keep the expanded state.*/
.side-nav-hover {
  position: fixed;
  top: 50%;
  left: 0;
  z-index: 10;
  transform: translateY(-50%);
  width: fit-content;
  height: fit-content;
  padding: var(--spacing-4xl) var(--spacing-2xl) var(--spacing-4xl) 0;
  transition: left 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.side-nav-hover--expanded {
  left: var(--spacing-md);
}

.side-nav {
  border: var(--border-width-sm) solid var(--color-gray-medium);
  background-color: var(--semi-transparent-dark);
  backdrop-filter: blur(var(--filter-blur));
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.side-nav__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.side-nav__item {
  position: relative;
}

.side-nav__button {
  color: var(--color-text-secondary);
  letter-spacing: var(--letter-spacing-normal);
  cursor: pointer;
  width: 100%;
  transition: color 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.side-nav__icon-wrap {
  padding: var(--spacing-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.side-nav__item--active .side-nav__button {
  color: var(--color-accent);
}

.side-nav__item:not(.side-nav__item--active):hover .side-nav__button {
  color: var(--color-text-hover);
}

/*Tooltip - appears after a delay when hovering an item*/
.side-nav__tooltip {
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: var(--spacing-md);
  color: var(--color-accent-neutral);
  font-size: var(--font-size-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--border-radius-md);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  background-color: var(--semi-transparent-dark);
  backdrop-filter: blur(var(--filter-blur));
  border: var(--border-width-sm) solid var(--color-gray-medium);
  letter-spacing: var(--letter-spacing-normal);
  text-transform: uppercase;
  transition: opacity 0.3s ease, visibility 0.3s ease;
  transition-delay: var(--tooltip-delay);
  z-index: 20;
}

.side-nav__tooltip::before {
  content: "";
  position: absolute;
  top: 50%;
  left: -5px;
  transform: translateY(-50%);
  border-width: 5px 5px 5px 0;
  border-style: solid;
  border-color: transparent var(--color-gray-medium) transparent transparent;
}

.side-nav__item:hover .side-nav__tooltip {
  visibility: visible;
  opacity: 1;
}

@media (max-width: 480px) {
  .side-nav {
    display: none;
  }
}
</style>
