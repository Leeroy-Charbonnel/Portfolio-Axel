<script setup lang="ts">
import { ref } from "vue"
import { Plus, Trash2, Image as ImageIcon } from "lucide-vue-next"
import { usePortfolio } from "../../composables/usePortfolio"
import { pickImageFile } from "../../lib/portfolio-utils"

//ADMIN SOFTWARE CATALOG
//Lists every software row with its logo, key and url. Add = open the file
//picker for a logo, then the row is created with a default key the admin
//can rename inline. Delete removes the row AND the logo file when no
//other software references it (handled server-side).

const { data, createSoftware, updateSoftware, deleteSoftware, uploadFile } = usePortfolio()
const isAdding   = ref(false)
const addError   = ref<string | null>(null)

async function onAdd() {
  const file = await pickImageFile()
  if (!file) return
  isAdding.value = true
  addError.value = null
  try {
    const nextIndex = (data.value?.software.length ?? 0) + 1
    await createSoftware(file, `Software ${nextIndex}`, "https://")
  } catch (e) {
    addError.value = e instanceof Error ? e.message : String(e)
    console.error("[SoftwareEditor] create failed:", e)
  } finally {
    isAdding.value = false
  }
}

async function onReplaceLogo(id: number) {
  const file = await pickImageFile()
  if (!file) return
  try {
    const uploaded = await uploadFile(file)
    await updateSoftware(id, { logoFileId: uploaded.id })
  } catch (e) {
    console.error("[SoftwareEditor] replace logo failed:", e)
  }
}

//Plain inputs (no EditableText) - SoftwareEditor lives in /settings which
//is an admin-only space; we don't need the global edit-mode toggle gate.
//Saves fire on `change` (input loses focus or user hits Enter) so we don't
//hit the API on every keystroke.
async function onKeySave(id: number, e: Event) {
  const value = (e.target as HTMLInputElement).value.trim()
  await updateSoftware(id, { key: value })
}

async function onUrlSave(id: number, e: Event) {
  const value = (e.target as HTMLInputElement).value.trim()
  await updateSoftware(id, { url: value })
}

async function onDelete(id: number) {
  await deleteSoftware(id)
}
</script>

<template>
  <section class="software-editor">
    <header class="software-editor__header">
      <h2 class="software-editor__title">Software catalog</h2>
      <button
        type="button"
        class="software-editor__add"
        :disabled="isAdding"
        @click="onAdd"
      >
        <Plus :size="14" />
        <span>{{ isAdding ? "Uploading..." : "Add software" }}</span>
      </button>
    </header>

    <p v-if="addError" class="software-editor__error">{{ addError }}</p>

    <p v-if="!data?.software?.length" class="software-editor__empty">
      No software yet. Click <strong>Add software</strong> and pick a logo image.
    </p>

    <ul v-else class="software-editor__list">
      <li
        v-for="sw in data.software"
        :key="sw.id"
        class="software-editor__row"
      >
        <button
          type="button"
          class="software-editor__logo"
          :title="`Replace logo for ${sw.key}`"
          @click="onReplaceLogo(sw.id)"
        >
          <img v-if="sw.logoUrl" :src="sw.logoUrl" :alt="sw.key" />
          <ImageIcon v-else :size="20" />
        </button>

        <div class="software-editor__fields">
          <input
            type="text"
            class="software-editor__key"
            :value="sw.key"
            placeholder="Software name"
            @change="(e) => onKeySave(sw.id, e)"
          />
          <input
            type="text"
            class="software-editor__url"
            :value="sw.url"
            placeholder="https://"
            @change="(e) => onUrlSave(sw.id, e)"
          />
        </div>

        <button
          type="button"
          class="software-editor__delete"
          :title="`Delete ${sw.key}`"
          @click="onDelete(sw.id)"
        >
          <Trash2 :size="14" />
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.software-editor {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.software-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.software-editor__title {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
}

.software-editor__add {
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
  transition: color 0.15s ease, border-color 0.15s ease;
}

.software-editor__add:hover:not(:disabled) {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.software-editor__add:disabled { opacity: 0.4; cursor: not-allowed; }

.software-editor__error {
  font-size: var(--font-size-xs);
  color: hsl(var(--destructive));
}

.software-editor__empty {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  text-align: center;
  padding: var(--spacing-lg);
  background-color: var(--color-background-secondary);
}

.software-editor__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.software-editor__row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-background-secondary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
}

.software-editor__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-2xl);
  height: var(--spacing-2xl);
  background-color: var(--tag-bg);
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
}

.software-editor__logo img {
  max-width:  100%;
  max-height: 100%;
  object-fit: contain;
}

.software-editor__fields {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xxs);
  min-width: 0;
}

.software-editor__key,
.software-editor__url {
  width: 100%;
  padding: var(--spacing-xxs) 0;
  background-color: transparent;
  border: none;
  border-bottom: var(--border-width-sm) solid transparent;
  color: var(--color-text-hover);
  transition: border-color 0.15s ease;
}

.software-editor__key:hover,
.software-editor__url:hover,
.software-editor__key:focus,
.software-editor__url:focus {
  outline: none;
  border-bottom-color: var(--color-gray-medium);
}

.software-editor__key:focus,
.software-editor__url:focus {
  border-bottom-color: var(--color-accent);
}

.software-editor__key {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
}

.software-editor__url {
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.software-editor__delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-xl);
  height: var(--spacing-xl);
  background-color: transparent;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.software-editor__delete:hover {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive));
  background-color: hsl(var(--destructive) / 0.1);
}
</style>
