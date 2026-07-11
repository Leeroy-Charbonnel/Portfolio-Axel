<script setup lang="ts">
import BilingualInput from "./BilingualInput.vue"
import type { ButtonBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: ButtonBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

function setUrl(v: string) {
  props.content.url = v
  emit("dirty")
}
function setNewTab(v: boolean) {
  props.content.newTab = v
  emit("dirty")
}
</script>

<template>
  <p class="dp-hint">Single call-to-action link (ArtStation, download, external page...).</p>
  <BilingualInput label="Label" :value="content.label" @dirty="emit('dirty')" />
  <label class="dp-field">
    <span>URL</span>
    <input type="url" class="dp-input" placeholder="https://..." :value="content.url" @input="setUrl(($event.target as HTMLInputElement).value)" />
  </label>
  <label class="dp-toggle">
    <input type="checkbox" :checked="content.newTab" @change="setNewTab(($event.target as HTMLInputElement).checked)" />
    <span>Open in a new tab</span>
  </label>
</template>
