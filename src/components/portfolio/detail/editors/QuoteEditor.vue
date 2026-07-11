<script setup lang="ts">
import BilingualInput from "./BilingualInput.vue"
import type { QuoteBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: QuoteBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

function setAuthor(v: string) {
  props.content.author = v
  emit("dirty")
}
</script>

<template>
  <BilingualInput label="Quote" :value="content.text" multiline :rows="3" @dirty="emit('dirty')" />
  <label class="dp-field">
    <span>Author (optional)</span>
    <input type="text" class="dp-input" :value="content.author" @input="setAuthor(($event.target as HTMLInputElement).value)" />
  </label>
</template>
