<script setup lang="ts">
import { Upload } from "lucide-vue-next"
import { useBlockUpload } from "../useBlockUpload"
import BilingualInput from "./BilingualInput.vue"
import type { ImageBlockContent, ImageFit } from "../../../../types/portfolio"

const props = defineProps<{ content: ImageBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

const { uploading, pickAndUpload } = useBlockUpload()

const FITS: { value: ImageFit; label: string }[] = [
  { value: "cover",   label: "Cover - fill the block, crop overflow" },
  { value: "contain", label: "Contain - whole image visible" },
  { value: "fill",    label: "Fill - stretch to the block" },
  { value: "none",    label: "None - native size" },
]

async function onPick() {
  const [row] = await pickAndUpload("image/*")
  if (!row) return
  emit("structural")
  props.content.fileId = row.id
  props.content.url    = row.url
  emit("dirty")
}

function ensureAlt() {
  if (!props.content.alt) props.content.alt = { en: "", fr: "" }
  return props.content.alt
}

function setFit(v: string) {
  props.content.fit = v as ImageFit
  emit("dirty")
}
</script>

<template>
  <p class="dp-hint">Static images and animated GIFs both work here.</p>
  <button type="button" class="dp-upload" :disabled="uploading" @click="onPick">
    <Upload :size="14" />
    <span>{{ uploading ? "Uploading..." : content.fileId ? "Replace image" : "Upload image" }}</span>
  </button>
  <label class="dp-field">
    <span>Image fit</span>
    <select class="dp-select" :value="content.fit ?? 'cover'" @change="setFit(($event.target as HTMLSelectElement).value)">
      <option v-for="f in FITS" :key="f.value" :value="f.value">{{ f.label }}</option>
    </select>
  </label>
  <BilingualInput label="Alt text" :value="ensureAlt()" @dirty="emit('dirty')" />
</template>
