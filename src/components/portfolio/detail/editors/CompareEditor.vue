<script setup lang="ts">
import { Upload } from "lucide-vue-next"
import { useBlockUpload } from "../useBlockUpload"
import BilingualInput from "./BilingualInput.vue"
import type { CompareBlockContent } from "../../../../types/portfolio"

const props = defineProps<{ content: CompareBlockContent }>()
const emit = defineEmits<{ (e: "dirty"): void; (e: "structural"): void }>()

const { uploading, pickAndUpload } = useBlockUpload()

async function onPick(side: "before" | "after") {
  const [row] = await pickAndUpload("image/*")
  if (!row) return
  emit("structural")
  if (side === "before") { props.content.beforeFileId = row.id; props.content.beforeUrl = row.url }
  else                   { props.content.afterFileId  = row.id; props.content.afterUrl  = row.url }
  emit("dirty")
}

function setFollowMouse(v: boolean) {
  props.content.followMouse = v
  emit("dirty")
}
</script>

<template>
  <p class="dp-hint">Two images split by a divider. Click / drag to move it.</p>
  <div class="dp-row">
    <button type="button" class="dp-upload" :disabled="uploading" @click="onPick('before')">
      <Upload :size="14" />
      <span>{{ content.beforeFileId ? "Replace before" : "Upload before" }}</span>
    </button>
    <img v-if="content.beforeUrl" :src="content.beforeUrl" alt="" class="dp-thumb" />
  </div>
  <div class="dp-row">
    <button type="button" class="dp-upload" :disabled="uploading" @click="onPick('after')">
      <Upload :size="14" />
      <span>{{ content.afterFileId ? "Replace after" : "Upload after" }}</span>
    </button>
    <img v-if="content.afterUrl" :src="content.afterUrl" alt="" class="dp-thumb" />
  </div>
  <label class="dp-toggle">
    <input type="checkbox" :checked="content.followMouse ?? false" @change="setFollowMouse(($event.target as HTMLInputElement).checked)" />
    <span>Divider follows the mouse (no click needed)</span>
  </label>
  <BilingualInput label="Before label" :value="content.beforeLabel" @dirty="emit('dirty')" />
  <BilingualInput label="After label" :value="content.afterLabel" @dirty="emit('dirty')" />
</template>
