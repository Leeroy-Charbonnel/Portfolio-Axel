<script setup lang="ts">
import { ArrowDown, ArrowUp, X } from "lucide-vue-next"

//SHARED list-item card for panel editors (carousel slides, accordion
//sections, specs rows, counters). Background levels do the delimiting,
//no borders. Header = optional thumb slot + title + reorder / remove.

defineProps<{
  title:   string
  index:   number
  count:   number
}>()

const emit = defineEmits<{
  (e: "move", delta: number): void
  (e: "remove"): void
}>()
</script>

<template>
  <div class="dp-item">
    <div class="dp-item__head">
      <slot name="thumb"></slot>
      <span class="dp-item__title">{{ title }}</span>
      <button type="button" class="dp-icon-btn" :disabled="index === 0" title="Move up" @click="emit('move', -1)">
        <ArrowUp :size="12" />
      </button>
      <button type="button" class="dp-icon-btn" :disabled="index === count - 1" title="Move down" @click="emit('move', 1)">
        <ArrowDown :size="12" />
      </button>
      <button type="button" class="dp-icon-btn dp-icon-btn--danger" title="Remove" @click="emit('remove')">
        <X :size="12" />
      </button>
    </div>
    <slot></slot>
  </div>
</template>
