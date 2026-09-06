<script setup lang="ts">
import { ref } from "vue"
import { Box, Edit, Plus, Trash2 } from "lucide-vue-next"
import { useRouter } from "vue-router"
import { usePortfolio } from "../../composables/usePortfolio"
import { pickImageFile } from "../../lib/portfolio-utils"
import { useConfirm } from "../../composables/useConfirm"

//3D MODELS TAB - grid of reusable model_3d assets. Each tile shows the
//thumbnail + name, with Edit (open the 3D editor) and Delete buttons.
//Upload is a 2-file flow: pick a .glb, then pick its thumbnail image,
//then a default "Default" view is seeded so the project picker has a
//starting point. The 3D editor (/edit-3d/:modelId) lets the admin
//rename + add more views.

const router = useRouter()
const { data, createModel, deleteModel } = usePortfolio()
const { confirm } = useConfirm()

const adding = ref(false)
const error  = ref<string | null>(null)

function pickGlbFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type   = "file"
    input.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json"
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

async function onAdd() {
  if (adding.value) return
  error.value = null
  const glb = await pickGlbFile()
  if (!glb) return
  const thumbnail = await pickImageFile()
  if (!thumbnail) {
    error.value = "Thumbnail required (pick an image after the .glb)"
    return
  }
  adding.value = true
  try {
    const baseName = glb.name.replace(/\.(glb|gltf)$/i, "") || "New model"
    const created = await createModel(baseName, glb, thumbnail)
    //jump straight into the editor so the admin sets the start view + materials right away
    router.push(`/edit-3d/${created.id}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    console.error("[Models3dTab] create failed:", e)
  } finally {
    adding.value = false
  }
}

async function onDelete(id: string, name: string) {
  const ok = await confirm({
    title:  "Delete this model?",
    what:   name,
    action: "Delete",
    destructive: true,
  })
  if (!ok) return
  try {
    await deleteModel(id)
  } catch (e) {
    //API returns 409 with usages[] when the model is still referenced;
    //the failed request already toasted, just leave the trace here.
    console.warn("[Models3dTab] delete blocked:", e)
  }
}

function openEditor(id: string) {
  router.push(`/edit-3d/${id}`)
}
</script>

<template>
  <div class="models-tab">
    <header class="models-tab__head">
      <h2 class="models-tab__title">3D models</h2>
      <button class="models-tab__add" :disabled="adding" @click="onAdd">
        <Plus :size="14" />
        <span>{{ adding ? "Uploading..." : "Add model" }}</span>
      </button>
    </header>

    <p v-if="error" class="models-tab__error">{{ error }}</p>

    <div v-if="(data?.models ?? []).length === 0" class="models-tab__empty">
      No 3D models yet. Click "Add model" to upload a .glb + thumbnail.
    </div>

    <ul v-else class="models-tab__grid">
      <li
        v-for="m in data?.models ?? []"
        :key="m.id"
        class="models-tab__card"
      >
        <div class="models-tab__thumb">
          <img v-if="m.thumbnailUrl" :src="m.thumbnailUrl" :alt="m.name" />
          <Box v-else :size="48" />
        </div>
        <div class="models-tab__meta">
          <span class="models-tab__name" :title="m.name">{{ m.name }}</span>
          <span class="models-tab__count">{{ m.views.length }} view{{ m.views.length === 1 ? "" : "s" }}</span>
        </div>
        <div class="models-tab__actions">
          <button type="button" class="models-tab__btn" title="Edit 3D" @click="openEditor(m.id)">
            <Edit :size="14" />
          </button>
          <button type="button" class="models-tab__btn models-tab__btn--danger" title="Delete" @click="onDelete(m.id, m.name)">
            <Trash2 :size="14" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.models-tab__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
}
.models-tab__title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-hover);
}
.models-tab__add {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background-color: var(--color-accent);
  border: none;
  color: var(--color-background);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  border-radius: var(--radius);
}
.models-tab__add:disabled { opacity: 0.5; cursor: not-allowed; }

.models-tab__error,
.models-tab__empty {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  padding: var(--spacing-md);
  text-align: center;
}
.models-tab__error { color: hsl(var(--destructive)); }

.models-tab__grid {
  list-style: none;
  margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--spacing-md);
}
.models-tab__card {
  display: flex; flex-direction: column;
  background-color: var(--color-gray-light);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius);
  overflow: hidden;
}
.models-tab__thumb {
  display: flex; align-items: center; justify-content: center;
  aspect-ratio: 16 / 10;
  background-color: var(--semi-transparent-dark);
  color: var(--color-text-tertiary);
  overflow: hidden;
}
.models-tab__thumb img {
  width: 100%; height: 100%;
  object-fit: cover;
}
.models-tab__meta {
  display: flex; flex-direction: column;
  gap: var(--spacing-xxs);
  padding: var(--spacing-sm) var(--spacing-md);
}
.models-tab__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-hover);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.models-tab__count {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}
.models-tab__actions {
  display: flex; gap: var(--spacing-xs);
  padding: 0 var(--spacing-md) var(--spacing-sm) var(--spacing-md);
}
.models-tab__btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: var(--spacing-xs);
  background-color: transparent;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.models-tab__btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.models-tab__btn--danger:hover {
  border-color: hsl(var(--destructive));
  color: hsl(var(--destructive));
}
</style>
