<script setup lang="ts">
import { Upload } from "lucide-vue-next"
import { useBlockUpload } from "../useBlockUpload"
import type { VideoBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: VideoBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

const { uploading, pickAndUpload } = useBlockUpload()

async function onPick() {
  const [row] = await pickAndUpload("video/*")
  if (!row) return
  emit("structural")
  props.content.fileId = row.id
  props.content.url    = row.url
  emit("dirty")
}

function toggle(key: "autoplay" | "loop" | "muted" | "controls", v: boolean) {
  props.content[key] = v
  emit("dirty")
}
</script>

<template>
  <p class="dp-hint">Default is gif-style playback (autoplay, loop, muted). Enable controls for a regular player.</p>
  <button type="button" class="dp-upload" :disabled="uploading" @click="onPick">
    <Upload :size="14" />
    <span>{{ uploading ? "Uploading..." : content.fileId ? "Replace video" : "Upload video" }}</span>
  </button>
  <label class="dp-toggle">
    <input type="checkbox" :checked="content.autoplay" @change="toggle('autoplay', ($event.target as HTMLInputElement).checked)" />
    <span>Autoplay</span>
  </label>
  <label class="dp-toggle">
    <input type="checkbox" :checked="content.loop" @change="toggle('loop', ($event.target as HTMLInputElement).checked)" />
    <span>Loop</span>
  </label>
  <label class="dp-toggle">
    <input type="checkbox" :checked="content.muted" @change="toggle('muted', ($event.target as HTMLInputElement).checked)" />
    <span>Muted (required for autoplay)</span>
  </label>
  <label class="dp-toggle">
    <input type="checkbox" :checked="content.controls" @change="toggle('controls', ($event.target as HTMLInputElement).checked)" />
    <span>Show controls</span>
  </label>
</template>
