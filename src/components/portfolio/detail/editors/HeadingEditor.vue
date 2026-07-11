<script setup lang="ts">
import BilingualInput from "./BilingualInput.vue"
import type { HeadingBlockContent } from "../../../../types/portfolio"

defineProps<{ content: HeadingBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()
</script>

<template>
  <p class="dp-hint">Big section title - use it to structure the page or as a separator.</p>
  <BilingualInput label="Title" :value="content.text" @dirty="emit('dirty')" />
</template>
