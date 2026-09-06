<script setup lang="ts">
import { useRoute } from "vue-router"
import ToastHost from "./components/ToastHost.vue"
import { useLang } from "./composables/useLang"
import SideNav      from "./components/portfolio/SideNav.vue"
import AdminGear    from "./components/portfolio/AdminGear.vue"
import CssVarsPanel from "./components/portfolio/CssVarsPanel.vue"
import LightboxCarousel from "./components/portfolio/LightboxCarousel.vue"

//Theme is dark-only for this portfolio: html.dark is hardcoded in index.html
//and no toggle is exposed. useTheme() is deliberately not called either, to
//avoid auto-seeding a `theme` row that would then show up in /settings.
//The accent used to be applied here through the shared package, but that call
//needed a session and did nothing for a visitor: the public accent has always
//come from style.css, and CssVarsPanel is what overrides it for the admin.

const { toggleLang, lang } = useLang()

//hide portfolio chrome on auth-related routes (login, settings, etc.) so
//vue-shared-ui's pages render against the bare background
const route = useRoute()
const chromeFreeRoutes = ["/login", "/settings", "/pending", "/banned", "/forgot-password", "/reset-password"]
//edit-3d uses a dynamic id so check by prefix in the template instead
</script>

<template>
  <div class="vsui-app portfolio-app">
    <template v-if="!chromeFreeRoutes.includes(route.path) && !route.path.startsWith('/edit-3d/')">
      <SideNav />

      <button
        type="button"
        class="portfolio-app__lang-switch"
        :aria-label="lang === 'en' ? 'Switch to French' : 'Switch to English'"
        @click="toggleLang"
      >
        {{ lang === 'en' ? 'EN / FR' : 'FR / EN' }}
      </button>

      <AdminGear />
    </template>

    <main class="portfolio-app__main">
      <RouterView />
    </main>

    <div class="grain-overlay"></div>

    <CssVarsPanel />

    <LightboxCarousel />

    <ToastHost />
  </div>
</template>

<style scoped>
/*Flex column with explicit min-height: 100vh ensures the wrapper grows to
the full document height. Without this, .portfolio-app's box collapses to
its first-child's height and the grain (position:absolute; inset:0) stops
short of the bottom of the page.*/
.portfolio-app {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/*Main flows in the root stacking context (no z-index, no isolation:isolate)
so media inside it can be lifted ABOVE the grain via the global rule in
style.css. If main owned its own stacking context, child z-index values
would be clamped to main's local layer and grain would always sit on top
of images or always sit below them - we need them interleaved instead.
flex:1 lets main absorb the remaining height so .portfolio-app spans the
whole document.*/
.portfolio-app__main {
  position: relative;
  flex: 1 0 auto;
}

/*Language switch lives at the top-right of the page and scrolls AWAY
with the rest of the content - no point keeping it pinned in view.*/
.portfolio-app__lang-switch {
  position: absolute;
  top:   var(--spacing-md);
  right: var(--spacing-md);
  z-index: 10;
  color: var(--color-text);
  border: var(--border-width) solid var(--color-border-muted);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  backdrop-filter: blur(var(--filter-blur));
  background-color: var(--semi-transparent-dark);
  transition: color 0.2s ease;
}

.portfolio-app__lang-switch:hover {
  color: var(--color-text-hover);
}
</style>
