<script setup lang="ts">
import { ToastHost, useAccent, useLang, useTheme } from "vue-shared-ui"
import SideNav from "./components/portfolio/SideNav.vue"

//ensure accent_color is seeded then applied to --primary (HSL). In public auth
//mode the DB seed call no-ops gracefully if there is no user session.
useAccent()

//hydrate the theme composable so the .dark class follows the DB value when a
//user toggles light/dark via the settings page. dark is the composable's
//default so the first paint stays dark even without a DB hit.
useTheme()

const { toggleLang, lang } = useLang()
</script>

<template>
  <div class="vsui-app portfolio-app">
    <SideNav />

    <button
      type="button"
      class="portfolio-app__lang-switch"
      :aria-label="lang === 'en' ? 'Switch to French' : 'Switch to English'"
      @click="toggleLang"
    >
      {{ lang === 'en' ? 'EN / FR' : 'FR / EN' }}
    </button>

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

.portfolio-app__main {
  position: relative;
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
