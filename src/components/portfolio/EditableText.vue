<script setup lang="ts">
import { onMounted, ref, watch } from "vue"
import { useAdmin } from "../../composables/useAdmin"

//WYSIWYG text editor. Renders the same tag the parent would have rendered
//(h1/h3/span/p/etc.) so the DOM stays identical between view and edit modes.
//We manage innerText directly rather than letting Vue interpolate, so the
//cursor doesn't reset while the admin is typing.

interface Props {
  value:        string
  tag?:         string
  multiline?:   boolean
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  tag:         "span",
  multiline:   false,
  placeholder: "",
})

const emit = defineEmits<{ save: [value: string] }>()
const { editMode } = useAdmin()
const root = ref<HTMLElement | null>(null)

onMounted(() => {
  if (root.value) root.value.innerText = props.value
})

//external value changes (lang toggle, reload from API) update innerText only
//when the element isn't being typed in - prevents cursor jumps mid-edit
watch(() => props.value, (val) => {
  if (!root.value) return
  if (document.activeElement === root.value) return
  if (root.value.innerText !== val) root.value.innerText = val
})

function onBlur() {
  if (!root.value) return
  const newValue = root.value.innerText
  if (newValue !== props.value) emit("save", newValue)
}

//Enter without shift submits (blur) on single-line; multiline lets Enter through
function onKeydown(e: KeyboardEvent) {
  if (!props.multiline && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    ;(e.target as HTMLElement).blur()
  }
}
</script>

<template>
  <component
    :is="tag"
    ref="root"
    :contenteditable="editMode"
    :data-placeholder="placeholder"
    class="editable-text"
    :class="{ 'editable-text--active': editMode }"
    @blur="onBlur"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.editable-text--active {
  outline: 1px dashed var(--color-border-muted);
  outline-offset: var(--spacing-xxs);
  cursor: text;
  min-height: 1em;
  min-width: var(--spacing-3xl);
}

.editable-text--active:hover,
.editable-text--active:focus {
  outline-color: var(--color-accent);
  outline-style: solid;
}

.editable-text--active:focus {
  background-color: hsl(var(--background) / 0.6);
}

.editable-text--active:empty::before {
  content: attr(data-placeholder);
  color: var(--color-text-tertiary);
  pointer-events: none;
}
</style>
