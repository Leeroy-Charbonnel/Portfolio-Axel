<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { ArrowLeft, Box, Folder, Wrench } from "lucide-vue-next"
import FileManager     from "../components/portfolio/FileManager.vue"
import SoftwareEditor  from "../components/portfolio/SoftwareEditor.vue"
import Models3dTab     from "../components/portfolio/Models3dTab.vue"

//Tabbed admin settings page. Each tab is a self-contained component
//that talks to the API directly (or via usePortfolio). No tab state
//is persisted - reload returns to the first tab. Accent / theme /
//language still live in the gear menu (CssVarsPanel) - they don't
//belong on a data-admin page.

const router = useRouter()
function goBack() { router.push("/") }

type TabKey = "software" | "models" | "files"
const TABS: { key: TabKey; label: string; icon: typeof Box }[] = [
  { key: "software", label: "Software", icon: Wrench },
  { key: "models",   label: "3D Models", icon: Box },
  { key: "files",    label: "Files",    icon: Folder },
]
const currentTab = ref<TabKey>("software")
</script>

<template>
  <div class="settings-page">
    <header class="settings-page__header">
      <button class="settings-page__back" @click="goBack">
        <ArrowLeft :size="16" />
        <span>Back</span>
      </button>
      <h1 class="settings-page__title">Settings</h1>
    </header>

    <nav class="settings-page__tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="settings-page__tab"
        :class="{ 'settings-page__tab--active': currentTab === t.key }"
        @click="currentTab = t.key"
      >
        <component :is="t.icon" :size="14" />
        <span>{{ t.label }}</span>
      </button>
    </nav>

    <section class="settings-page__panel">
      <SoftwareEditor v-if="currentTab === 'software'" />
      <Models3dTab    v-else-if="currentTab === 'models'" />
      <FileManager    v-else-if="currentTab === 'files'" />
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 64rem;
  margin: 0 auto;
  padding: var(--spacing-3xl) var(--spacing-xl);
}

.settings-page__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-lg);
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
}

.settings-page__back {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background-color: transparent;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  border-radius: var(--radius);
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}
.settings-page__back:hover {
  color: var(--color-text-hover);
  border-color: var(--color-accent);
  background-color: hsl(var(--primary) / 0.08);
}

.settings-page__title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  color: var(--color-text-hover);
  margin: 0;
}

.settings-page__tabs {
  display: flex;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-xl);
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
}
.settings-page__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-lg);
  background-color: transparent;
  border: none;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
  margin-bottom: -1px;
}
.settings-page__tab:hover {
  color: var(--color-text-hover);
}
.settings-page__tab--active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

.settings-page__panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}
</style>
