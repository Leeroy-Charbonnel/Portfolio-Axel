<script setup lang="ts">
import { ImagePlus } from "lucide-vue-next"
import { useAdmin } from "../../composables/useAdmin"

//Floating "replace" overlay button shown on hover over an editable image.
//Parent handles the actual file pick + upload via the click event.

defineEmits<{ click: [] }>()

const { editMode } = useAdmin()
</script>

<template>
  <button
    v-if="editMode"
    type="button"
    class="replace-image-button"
    aria-label="Replace image"
    @click.stop="$emit('click')"
  >
    <ImagePlus :size="16" />
    <span>Replace</span>
  </button>
</template>

<style scoped>
.replace-image-button {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  background-color: hsl(var(--background) / 0);
  color: var(--color-text-hover);
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  cursor: pointer;
  opacity: 0;
  transition: background-color var(--transition-fast) ease, opacity var(--transition-fast) ease;
  z-index: 15;
}

.replace-image-button:hover {
  background-color: hsl(var(--background) / 0.65);
  opacity: 1;
}
</style>
