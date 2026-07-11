<script setup lang="ts">
import { computed } from "vue"
import { MonitorPlay } from "lucide-vue-next"
import type { EmbedBlockContent } from "../../../types/portfolio"

//EMBED - iframe embed. YouTube / Vimeo / Sketchfab page urls are
//rewritten to their embed form; anything else is iframed as-is.

const props = defineProps<{ content: EmbedBlockContent }>()

function toEmbedUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return ""
  //youtube: watch?v=ID, youtu.be/ID, shorts/ID -> embed/ID
  const yt = url.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/)|youtu\.be\/)([\w-]{6,})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  //vimeo: vimeo.com/ID -> player.vimeo.com/video/ID
  const vm = url.match(/vimeo\.com\/(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  //sketchfab: model page -> /embed
  const sf = url.match(/sketchfab\.com\/(?:3d-)?models\/([\w-]+)/)
  if (sf) return `https://sketchfab.com/models/${sf[1]}/embed`
  return url
}

const embedUrl = computed(() => toEmbedUrl(props.content.url))
</script>

<template>
  <iframe
    v-if="embedUrl"
    :src="embedUrl"
    class="bembed"
    frameborder="0"
    allow="autoplay; fullscreen; xr-spatial-tracking"
    allowfullscreen
    loading="lazy"
  ></iframe>
  <div v-else class="bembed__empty">
    <MonitorPlay :size="32" />
    <span>No embed url</span>
  </div>
</template>

<style scoped>
.bembed {
  width: 100%;
  height: 100%;
  display: block;
}
.bembed__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  width: 100%;
  height: 100%;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}
</style>
