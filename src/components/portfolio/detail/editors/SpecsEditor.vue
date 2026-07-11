<script setup lang="ts">
import { Plus } from "lucide-vue-next"
import BilingualInput from "./BilingualInput.vue"
import ItemCard from "./ItemCard.vue"
import type { SpecsBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: SpecsBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

function add() {
  emit("structural")
  props.content.rows.push({ label: { en: "", fr: "" }, value: { en: "", fr: "" } })
  emit("dirty")
}
function move(i: number, delta: number) {
  const j = i + delta
  if (j < 0 || j >= props.content.rows.length) return
  emit("structural")
  const [it] = props.content.rows.splice(i, 1)
  props.content.rows.splice(j, 0, it!)
  emit("dirty")
}
function remove(i: number) {
  emit("structural")
  props.content.rows.splice(i, 1)
  emit("dirty")
}
</script>

<template>
  <p class="dp-hint">Key / value sheet: software, polycount, role, year...</p>
  <button type="button" class="dp-action" @click="add">
    <Plus :size="14" />
    <span>Add row</span>
  </button>
  <ItemCard
    v-for="(row, i) in content.rows"
    :key="i"
    :title="`Row ${i + 1}`"
    :index="i"
    :count="content.rows.length"
    @move="(d) => move(i, d)"
    @remove="remove(i)"
  >
    <BilingualInput label="Label" :value="row.label" @dirty="emit('dirty')" />
    <BilingualInput label="Value" :value="row.value" @dirty="emit('dirty')" />
  </ItemCard>
</template>
