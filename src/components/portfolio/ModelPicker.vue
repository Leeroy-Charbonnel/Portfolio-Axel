<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { Box, ChevronDown, Check } from "lucide-vue-next"
import { usePortfolio } from "../../composables/usePortfolio"

//ModelPicker - reusable 3D model + view-per-breakpoint selector. Used
//in MainProject (overlay) and ProjectDetailPage viewer3d block side
//panel. v-model is a { model3dId, desktopView, mobileView } object so
//the parent can persist it however it stores its own state.
//
//Trigger displays the current selection; click opens a popover with:
//  - thumbnail grid (click a model to pick it)
//  - two <select> dropdowns of the chosen model's views[]
//Picking a model auto-resets desktopView/mobileView to its first view
//(usually "Default") so the selection is never broken.

interface PickerValue {
  model3dId:    string | null
  desktopView:  string
  mobileView:   string
}

const props = defineProps<{ modelValue: PickerValue }>()
const emit  = defineEmits<{ (e: "update:modelValue", v: PickerValue): void }>()

const { data } = usePortfolio()
const open = ref(false)

const models       = computed(() => data.value?.models ?? [])
const selectedModel = computed(() => models.value.find((m) => m.id === props.modelValue.model3dId) ?? null)
const availableViews = computed(() => selectedModel.value?.views ?? [])

function pickModel(id: string) {
  const m = models.value.find((x) => x.id === id)
  const firstView = m?.views?.[0]?.name ?? ""
  emit("update:modelValue", {
    model3dId:   id,
    desktopView: firstView,
    mobileView:  firstView,
  })
}

function setDesktopView(name: string) {
  emit("update:modelValue", { ...props.modelValue, desktopView: name })
}
function setMobileView(name: string) {
  emit("update:modelValue", { ...props.modelValue, mobileView: name })
}

//Click-outside to close. Bound on the document while open.
const popoverRef = ref<HTMLDivElement | null>(null)
function onDocClick(e: MouseEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (popoverRef.value && !popoverRef.value.contains(t)) open.value = false
}
watch(open, (v) => {
  if (v) document.addEventListener("mousedown", onDocClick)
  else   document.removeEventListener("mousedown", onDocClick)
})
//Unmounting while the popover is open (edit mode toggled off, block
//deleted) must not leave the document listener behind.
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocClick))

const triggerLabel = computed(() => {
  if (!selectedModel.value) return "Pick a 3D model"
  const m = selectedModel.value
  const desk = props.modelValue.desktopView || "(no view)"
  const mob  = props.modelValue.mobileView  || "(no view)"
  return `${m.name} — D: ${desk} / M: ${mob}`
})
</script>

<template>
  <div ref="popoverRef" class="model-picker">
    <button type="button" class="model-picker__trigger" @click="open = !open">
      <Box :size="14" />
      <span class="model-picker__label">{{ triggerLabel }}</span>
      <ChevronDown :size="14" />
    </button>

    <div v-if="open" class="model-picker__popover">
      <p v-if="models.length === 0" class="model-picker__empty">
        No 3D models yet. Add one from <em>Settings → 3D Models</em>.
      </p>

      <div v-else class="model-picker__section">
        <h3 class="model-picker__section-title">Model</h3>
        <ul class="model-picker__grid">
          <li v-for="m in models" :key="m.id">
            <button
              type="button"
              class="model-picker__card"
              :class="{ 'model-picker__card--selected': m.id === modelValue.model3dId }"
              @click="pickModel(m.id)"
            >
              <div class="model-picker__thumb">
                <img v-if="m.thumbnailUrl" :src="m.thumbnailUrl" :alt="m.name" />
                <Box v-else :size="32" />
              </div>
              <span class="model-picker__name" :title="m.name">{{ m.name }}</span>
              <Check v-if="m.id === modelValue.model3dId" :size="14" class="model-picker__check" />
            </button>
          </li>
        </ul>
      </div>

      <div v-if="selectedModel" class="model-picker__section">
        <h3 class="model-picker__section-title">Views</h3>
        <p v-if="!availableViews.length" class="model-picker__empty model-picker__empty--inline">
          This model has no saved views. Open it in the 3D editor and save one from the Views tab.
        </p>
        <template v-else>
          <label class="model-picker__field">
            <span>Desktop</span>
            <select :value="modelValue.desktopView" @change="setDesktopView(($event.target as HTMLSelectElement).value)">
              <option v-for="v in availableViews" :key="v.name" :value="v.name">{{ v.name }}</option>
            </select>
          </label>
          <label class="model-picker__field">
            <span>Mobile</span>
            <select :value="modelValue.mobileView" @change="setMobileView(($event.target as HTMLSelectElement).value)">
              <option v-for="v in availableViews" :key="v.name" :value="v.name">{{ v.name }}</option>
            </select>
          </label>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-picker {
  position: relative;
  display: inline-block;
}
.model-picker__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: hsl(0 0% 0% / 0.7);
  border: var(--border-width-sm) solid var(--color-accent);
  color: var(--color-accent);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  backdrop-filter: blur(var(--filter-blur));
  border-radius: var(--radius);
}
.model-picker__label {
  max-width: 22rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-picker__trigger:hover { background-color: var(--color-accent); color: hsl(0 0% 0%); }

.model-picker__popover {
  position: absolute;
  top: calc(100% + var(--spacing-xs));
  left: 0;
  z-index: 100;
  min-width: 22rem;
  max-width: 32rem;
  padding: var(--spacing-md);
  background-color: hsl(var(--background));
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius);
  box-shadow: 0 8px 32px hsl(0 0% 0% / 0.4);
  display: flex; flex-direction: column;
  gap: var(--spacing-md);
}
.model-picker__section { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.model-picker__section-title {
  margin: 0;
  font-size: 0.7rem;
  font-weight: var(--font-weight-bold);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.model-picker__empty {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  text-align: center;
  padding: var(--spacing-md);
}
.model-picker__empty--inline { padding: var(--spacing-xs) 0; text-align: left; }

.model-picker__grid {
  list-style: none;
  margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--spacing-xs);
}
.model-picker__card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  background-color: var(--color-gray-light);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius);
  cursor: pointer;
  overflow: hidden;
  text-align: left;
  padding: 0;
  transition: border-color 0.15s;
}
.model-picker__card:hover { border-color: var(--color-accent); }
.model-picker__card--selected { border-color: var(--color-accent); }

.model-picker__thumb {
  aspect-ratio: 16 / 10;
  display: flex; align-items: center; justify-content: center;
  background-color: hsl(0 0% 0% / 0.3);
  color: var(--color-text-tertiary);
  overflow: hidden;
}
.model-picker__thumb img { width: 100%; height: 100%; object-fit: cover; }

.model-picker__name {
  display: block;
  padding: var(--spacing-xxs) var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--color-text-hover);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-picker__check {
  position: absolute;
  top: var(--spacing-xs); right: var(--spacing-xs);
  color: var(--color-accent);
  background-color: hsl(var(--background));
  border-radius: var(--border-radius-full);
  padding: var(--spacing-xxs);
}

.model-picker__field { display: flex; flex-direction: column; gap: var(--spacing-xxs); font-size: var(--font-size-xs); }
.model-picker__field > span {
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}
.model-picker__field select {
  padding: var(--spacing-xs);
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius);
  font-size: var(--font-size-xs);
  cursor: pointer;
}
.model-picker__field select:focus { outline: none; border-color: var(--color-accent); }
</style>
