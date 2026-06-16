<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { ArrowLeft } from "lucide-vue-next"
import { useAccent, useSettings } from "vue-shared-ui"
import { useAdmin } from "../composables/useAdmin"
import FileManager from "../components/portfolio/FileManager.vue"

//Custom Settings page - portfolio shows ONLY the accent color picker.
//vue-shared-ui's SettingsPage would also surface theme + language rows
//(seeded by useTheme / useLang). The portfolio is dark-only and language
//is controlled by the top-right toggle, so neither belongs here.

useAccent()
const router = useRouter()
const { getString, update, loaded } = useSettings()
const { isAdmin } = useAdmin()

const accent = ref(getString("accent_color", "#0891b2"))

//Re-sync local ref when the settings call finishes loading
watch(loaded, () => { if (loaded.value) accent.value = getString("accent_color", "#0891b2") })

const previewSwatch = computed(() => accent.value)

async function onAccentInput(e: Event) {
  const hex = (e.target as HTMLInputElement).value
  accent.value = hex
  try {
    await update("accent_color", hex)
  } catch (err) {
    console.error("[settings] save accent failed:", err)
  }
}

function goBack() {
  router.push("/")
}
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
      <h2 class="settings-page__group-title">Appearance</h2>

      <label class="settings-page__field">
        <div class="settings-page__field-info">
          <span class="settings-page__field-label">Accent color</span>
          <span class="settings-page__field-desc">Primary accent used across the UI - buttons, focus rings, the gear icon when editing.</span>
        </div>
        <div class="settings-page__color-control">
          <span class="settings-page__color-swatch" :style="{ backgroundColor: previewSwatch }" aria-hidden="true"></span>
          <input
            type="color"
            class="settings-page__color-input"
            :value="accent"
            @input="onAccentInput"
          />
          <span class="settings-page__color-hex">{{ accent }}</span>
        </div>
      </label>
    </section>

    <!--File manager - admin only. Lists every binary in storage/files/ with a
    usage count, lets the admin delete unused files individually or in bulk.-->
    <section v-if="isAdmin" class="settings-page__group">
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
}

.settings-page__group-title {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
}

.settings-page__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-xl);
  padding: var(--spacing-md);
  background-color: var(--color-background-secondary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
}

.settings-page__field-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  flex: 1;
  min-width: 0;
}

.settings-page__field-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tight);
  color: var(--color-text-hover);
}

.settings-page__field-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  line-height: 1.5;
}

.settings-page__color-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

.settings-page__color-swatch {
  width:  var(--spacing-2xl);
  height: var(--spacing-2xl);
  border: var(--border-width-sm) solid var(--color-border-muted);
}

.settings-page__color-input {
  width:  var(--spacing-2xl);
  height: var(--spacing-2xl);
  padding: 0;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  background: transparent;
  cursor: pointer;
}

.settings-page__color-input::-webkit-color-swatch-wrapper { padding: 0; }
.settings-page__color-input::-webkit-color-swatch { border: none; }
.settings-page__color-input::-moz-color-swatch { border: none; }

.settings-page__color-hex {
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  min-width: 4.5rem;
}

@media (max-width: 600px) {
  .settings-page__field {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
