<script setup lang="ts">
import { X } from "lucide-vue-next"
import { useAdmin } from "../../composables/useAdmin"

//Small "x" button positioned top-right of an editable list item. Only rendered
//when edit mode is on. Click triggers @click; parent decides whether to confirm
//or run the deletion directly.

defineProps<{ label?: string }>()
defineEmits<{ click: [] }>()

const { editMode } = useAdmin()
</script>

<template>
  <button
    v-if="editMode"
    type="button"
    class="remove-button"
    :aria-label="label ?? 'Remove'"
    @click.stop="$emit('click')"
  >
    <X :size="14" />
  </button>
</template>

<style scoped>
.remove-button {
  position: absolute;
  top:   var(--spacing-xs);
  right: var(--spacing-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-xl);
  height: var(--spacing-xl);
  color: var(--color-text-hover);
  background-color: hsl(var(--destructive) / 0.85);
  border: var(--border-width-sm) solid hsl(var(--destructive));
  cursor: pointer;
  z-index: 20;
  transition: background-color 0.15s ease, transform 0.15s ease;
}

.remove-button:hover {
  background-color: hsl(var(--destructive));
  transform: scale(1.05);
}
</style>
