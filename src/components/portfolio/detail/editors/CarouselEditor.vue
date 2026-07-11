<script setup lang="ts">
import { Upload } from "lucide-vue-next"
import { useBlockUpload } from "../useBlockUpload"
import BilingualInput from "./BilingualInput.vue"
import ItemCard from "./ItemCard.vue"
import type { CarouselBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: CarouselBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

const { uploading, pickAndUpload } = useBlockUpload()

async function onAdd() {
  const rows = await pickAndUpload("image/*", true)
  if (!rows.length) return
  emit("structural")
  for (const row of rows) {
    props.content.items.push({ fileId: row.id, url: row.url, caption: { en: "", fr: "" } })
  }
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
function ensureCaption(i: number) {
  const item = props.content.items[i]!
  if (!item.caption) item.caption = { en: "", fr: "" }
  return item.caption
}
function setInterval_(v: string) {
  props.content.intervalMs = parseInt(v, 10)
  emit("dirty")
}
</script>

<template>
  <button type="button" class="dp-upload" :disabled="uploading" @click="onAdd">
    <Upload :size="14" />
    <span>{{ uploading ? "Uploading..." : "Add image(s)" }}</span>
  </button>
  <label class="dp-field">
    <span>Auto-advance</span>
    <select class="dp-select" :value="String(content.intervalMs)" @change="setInterval_(($event.target as HTMLSelectElement).value)">
      <option value="0">Manual only</option>
      <option value="3000">Every 3s</option>
      <option value="5000">Every 5s</option>
      <option value="8000">Every 8s</option>
    </select>
  </label>
  <p v-if="!content.items.length" class="dp-hint">No slides yet - add images above.</p>
  <ItemCard
    v-for="(item, i) in content.items"
    :key="item.fileId + i"
    :title="`Slide ${i + 1}`"
    :index="i"
    :count="content.items.length"
    @move="(d) => move(i, d)"
    @remove="remove(i)"
  >
    <template #thumb>
      <img v-if="item.url" :src="item.url" alt="" class="dp-thumb" />
    </template>
    <BilingualInput label="Caption" :value="ensureCaption(i)" @dirty="emit('dirty')" />
  </ItemCard>
</template>
