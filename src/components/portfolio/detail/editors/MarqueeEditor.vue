<script setup lang="ts">
import { Upload } from "lucide-vue-next"
import { useBlockUpload } from "../useBlockUpload"
import ItemCard from "./ItemCard.vue"
import type { MarqueeBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: MarqueeBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

const { uploading, pickAndUpload } = useBlockUpload()

async function onAdd() {
  const rows = await pickAndUpload("image/*", true)
  if (!rows.length) return
  emit("structural")
  for (const row of rows) props.content.items.push({ fileId: row.id, url: row.url })
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
function setSpeed(v: string) {
  const n = parseInt(v, 10)
  if (Number.isFinite(n)) props.content.speedPxs = n
  emit("dirty")
}
</script>

<template>
  <p class="dp-hint">Continuously scrolling image strip - works well as a separator between sections.</p>
  <button type="button" class="dp-upload" :disabled="uploading" @click="onAdd">
    <Upload :size="14" />
    <span>{{ uploading ? "Uploading..." : "Add image(s)" }}</span>
  </button>
  <label class="dp-field">
    <span>Speed</span>
    <select class="dp-select" :value="String(content.speedPxs)" @change="setSpeed(($event.target as HTMLSelectElement).value)">
      <option value="30">Slow</option>
      <option value="60">Normal</option>
      <option value="120">Fast</option>
    </select>
  </label>
  <p v-if="!content.items.length" class="dp-hint">No images yet - add some above.</p>
  <ItemCard
    v-for="(item, i) in content.items"
    :key="item.fileId + i"
    :title="`Image ${i + 1}`"
    :index="i"
    :count="content.items.length"
    @move="(d) => move(i, d)"
    @remove="remove(i)"
  >
    <template #thumb>
      <img v-if="item.url" :src="item.url" alt="" class="dp-thumb" />
    </template>
  </ItemCard>
</template>
