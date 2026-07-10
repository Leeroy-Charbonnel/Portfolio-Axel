<script setup lang="ts">
import { computed } from "vue"
import { useLanguage } from "../../../composables/useLanguage"
import { pickBilingual, renderMd } from "../../../lib/markdown"
import Viewer3dBlock from "../Viewer3dBlock.vue"
import CompareSlider from "./CompareSlider.vue"
import BlockCarousel from "./BlockCarousel.vue"
import BlockAccordion from "./BlockAccordion.vue"
import type {
  AccordionBlockContent,
  CarouselBlockContent,
  CompareBlockContent,
  DetailBlock,
  ImageBlockContent,
  TextBlockContent,
  VideoBlockContent,
  Viewer3dBlockContent,
} from "../../../types/portfolio"

//DETAIL BLOCK RENDERER - one component per block regardless of type,
//shared by the public view and the edit-mode canvas. In edit mode the
//parent bento tile wraps this in a pointer-events:none container so the
//interactive blocks (carousel, compare, accordion) render as static
//previews and the tile keeps acting as the drag handle.
//viewer3d is the exception: the live ThreeViewer is heavy and grabs
//pointer input for orbit, so edit mode renders a placeholder instead
//(handled by the parent, not here).

const props = defineProps<{
  block:   DetailBlock
  mobile?: boolean
}>()

const { lang } = useLanguage()

const asText      = computed(() => props.block.content as TextBlockContent)
const asImage     = computed(() => props.block.content as ImageBlockContent)
const asVideo     = computed(() => props.block.content as VideoBlockContent)
const asCarousel  = computed(() => props.block.content as CarouselBlockContent)
const asCompare   = computed(() => props.block.content as CompareBlockContent)
const asAccordion = computed(() => props.block.content as AccordionBlockContent)
const asViewer    = computed(() => props.block.content as Viewer3dBlockContent)
</script>

<template>
  <div
    v-if="block.type === 'text'"
    class="block-text md-content"
    v-html="renderMd(pickBilingual(asText.text, lang))"
  ></div>

  <img
    v-else-if="block.type === 'image' && asImage.url"
    :src="asImage.url"
    :alt="pickBilingual(asImage.alt, lang)"
    class="block-img"
  />

  <video
    v-else-if="block.type === 'video' && asVideo.url"
    :src="asVideo.url"
    class="block-video"
    :autoplay="asVideo.autoplay"
    :loop="asVideo.loop"
    :muted="asVideo.muted"
    :controls="asVideo.controls"
    playsinline
  ></video>

  <BlockCarousel v-else-if="block.type === 'carousel'" :content="asCarousel" />

  <CompareSlider v-else-if="block.type === 'compare'" :content="asCompare" />

  <BlockAccordion v-else-if="block.type === 'accordion'" :content="asAccordion" />

  <div v-else-if="block.type === 'viewer3d'" class="block-viewer">
    <Viewer3dBlock :content="asViewer" :mobile="mobile" />
  </div>
</template>

<style scoped>
.block-text {
  margin: 0;
  padding: var(--spacing-md);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  width: 100%;
  height: 100%;
  overflow: auto;
  word-break: break-word;
}
.block-img,
.block-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/*ThreeViewer fills its own container via absolute positioning - give it
a sized relative box.*/
.block-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
