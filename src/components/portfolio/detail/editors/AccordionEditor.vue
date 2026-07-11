<script setup lang="ts">
import { Plus } from "lucide-vue-next"
import BilingualInput from "./BilingualInput.vue"
import ItemCard from "./ItemCard.vue"
import type { AccordionBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: AccordionBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

function add() {
  emit("structural")
  const n = props.content.items.length + 1
  props.content.items.push({ title: { en: `Section ${n}`, fr: `Section ${n}` }, body: { en: "", fr: "" } })
  emit("dirty")
}
function move(i: number, delta: number) {
  const j = i + delta
  if (j < 0 || j >= props.content.items.length) return
  emit("structural")
  const [it] = props.content.items.splice(i, 1)
  props.content.items.splice(j, 0, it!)
  emit("dirty")
}
function remove(i: number) {
  emit("structural")
  props.content.items.splice(i, 1)
  emit("dirty")
}
</script>

<template>
  <p class="dp-hint">Collapsible sections. Body supports markdown.</p>
  <button type="button" class="dp-action" @click="add">
    <Plus :size="14" />
    <span>Add section</span>
  </button>
  <ItemCard
    v-for="(item, i) in content.items"
    :key="i"
    :title="`Section ${i + 1}`"
    :index="i"
    :count="content.items.length"
    @move="(d) => move(i, d)"
    @remove="remove(i)"
  >
    <BilingualInput label="Title" :value="item.title" @dirty="emit('dirty')" />
    <BilingualInput label="Body (markdown)" :value="item.body" multiline mono :rows="4" @dirty="emit('dirty')" />
  </ItemCard>
</template>
