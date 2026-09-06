<script setup lang="ts">
import { Plus } from "lucide-vue-next"
import { useAdmin } from "../../composables/useAdmin"

//Large dashed "+" button appended at the end of an editable list (main projects,
//gallery, experiences, etc.). Only rendered when edit mode is on.

defineProps<{ label?: string }>()
defineEmits<{ click: [] }>()

const { editMode } = useAdmin()
</script>

<template>
  <button
    v-if="editMode"
    type="button"
    class="add-button"
    @click="$emit('click')"
  >
    <Plus :size="32" />
    <span v-if="label" class="add-button__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.add-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  width: 100%;
  min-height: var(--spacing-5xl);
  padding: var(--spacing-2xl);
  background-color: transparent;
  border: var(--border-width-md) dashed var(--color-gray-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: border-color var(--transition-fast) ease, color var(--transition-fast) ease, background-color var(--transition-fast) ease;
}

.add-button:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  background-color: hsl(var(--primary) / 0.05);
}

.add-button__label {
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}
</style>
