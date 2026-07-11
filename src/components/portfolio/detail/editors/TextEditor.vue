<script setup lang="ts">
import BilingualInput from "./BilingualInput.vue"
import type { TextBlockContent } from "../../../../types/portfolio"

defineProps<{ content: TextBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()
</script>

<template>
  <p class="dp-hint">Markdown supported. Double-click the block to edit inline (current language).</p>
  <BilingualInput label="Markdown source" :value="content.text" multiline mono :rows="6" @dirty="emit('dirty')" />
</template>
