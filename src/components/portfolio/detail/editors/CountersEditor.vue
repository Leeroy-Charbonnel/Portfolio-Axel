<script setup lang="ts">
import { Plus } from "lucide-vue-next"
import BilingualInput from "./BilingualInput.vue"
import ItemCard from "./ItemCard.vue"
import type { CountersBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: CountersBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

function add() {
  emit("structural")
  props.content.items.push({ label: { en: "", fr: "" }, value: 0 })
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
function setValue(i: number, v: string) {
  const n = parseFloat(v)
  props.content.items[i]!.value = Number.isFinite(n) ? n : 0
  emit("dirty")
}
</script>

<template>
  <p class="dp-hint">Animated numbers (vertices, tris, hours...). They count up when scrolled into view.</p>
  <button type="button" class="dp-action" @click="add">
    <Plus :size="14" />
    <span>Add counter</span>
  </button>
  <ItemCard
    v-for="(item, i) in content.items"
    :key="i"
    :title="`Counter ${i + 1}`"
    :index="i"
    :count="content.items.length"
    @move="(d) => move(i, d)"
    @remove="remove(i)"
  >
    <label class="dp-field">
      <span>Value</span>
      <input type="number" class="dp-input" :value="item.value" @input="setValue(i, ($event.target as HTMLInputElement).value)" />
    </label>
    <BilingualInput label="Label" :value="item.label" @dirty="emit('dirty')" />
  </ItemCard>
</template>
