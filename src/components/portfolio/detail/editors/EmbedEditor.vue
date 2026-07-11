<script setup lang="ts">
import type { EmbedBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: EmbedBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

function setUrl(v: string) {
  props.content.url = v
  emit("dirty")
}
</script>

<template>
  <p class="dp-hint">
    Paste a YouTube / Vimeo / Sketchfab link (the embed form is derived
    automatically) or any url to iframe.
  </p>
  <label class="dp-field">
    <span>URL</span>
    <input type="url" class="dp-input" placeholder="https://youtube.com/watch?v=..." :value="content.url" @input="setUrl(($event.target as HTMLInputElement).value)" />
  </label>
</template>
