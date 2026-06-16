<script setup lang="ts">
import { useRoute } from "vue-router"
import { ToastHost, useAccent, useLang } from "vue-shared-ui"
import SideNav    from "./components/portfolio/SideNav.vue"
import AdminGear  from "./components/portfolio/AdminGear.vue"

//ensure accent_color is seeded then applied to --primary (HSL). In public auth
//mode the DB seed call no-ops gracefully if there is no user session.
useAccent()

//Theme is dark-only for this portfolio: html.dark is hardcoded in index.html
//and no toggle is exposed. We deliberately don't call useTheme() to avoid
//auto-seeding a `theme` setting row that would show up in /settings.

const { toggleLang, lang } = useLang()

//hide portfolio chrome on auth-related routes (login, settings, etc.) so
//vue-shared-ui's pages render against the bare background
const route = useRoute()
const chromeFreeRoutes = ["/login", "/settings", "/pending", "/banned", "/forgot-password", "/reset-password"]
</script>

<template>
  <div class="vsui-app portfolio-app">
    <template v-if="!chromeFreeRoutes.includes(route.path)">
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

    <ToastHost />
  </div>
</template>

<style scoped>
.portfolio-app {
  position: relative;
  min-height: 100vh;
}

/*Main content sits above the grain (z-index:1). isolation:isolate creates a
fresh stacking context so descendants never get clipped by the grain layer,
regardless of transforms applied inside (AnimatedReveal etc.).*/
.portfolio-app__main {
  position: relative;
  z-index: 2;
  isolation: isolate;
}

/*Fixed language switch in the top-right corner (matches the original portfolio).*/
.portfolio-app__lang-switch {
  position: fixed;
  top:   var(--spacing-md);
  right: var(--spacing-md);
  z-index: 100;
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
