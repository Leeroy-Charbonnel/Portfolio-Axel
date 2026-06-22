<script setup lang="ts">
import { useRouter } from "vue-router"
import { ArrowLeft } from "lucide-vue-next"
import FileManager     from "../components/portfolio/FileManager.vue"
import SoftwareEditor  from "../components/portfolio/SoftwareEditor.vue"

//Settings page - software catalog + file management. Accent color and every
//other CSS token live in the CssVarsPanel (gear menu > Customize CSS), so
//this page focuses purely on data/asset admin.

const router = useRouter()

function goBack() { router.push("/") }
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

    <section class="settings-page__group">
      <SoftwareEditor />
    </section>

    <section class="settings-page__group">
      <FileManager />
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 48rem;
  margin: 0 auto;
  padding: var(--spacing-3xl) var(--spacing-xl);
}

.settings-page__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-2xl);
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
}

.settings-page__group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-2xl);
}
</style>
