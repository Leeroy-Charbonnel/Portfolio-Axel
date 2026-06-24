<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, toRef, watch } from "vue"
import { Grid } from "lucide-vue-next"
import { useLanguage } from "../../composables/useLanguage"
import { useAdmin } from "../../composables/useAdmin"
import { useEffectiveViewerSettings } from "../../composables/useEffectiveViewerSettings"
import { useLightbox } from "../../composables/useLightbox"
import { usePortfolio } from "../../composables/usePortfolio"
import { useSketchfabViewer } from "../../composables/useSketchfabViewer"
import AnimatedReveal from "./AnimatedReveal.vue"
import EditableText from "./EditableText.vue"
import ThreeViewer from "./ThreeViewer.vue"
import type { MainProjectDto } from "../../types/portfolio"

//PHONE PROJECT CARD - viewer-dominant vertical stack for a 3D artist
//portfolio. Each card occupies ~one screen with the next project just
//peeking from below, so the visitor scrolls from one piece to the next
//with no horizontal real estate wasted on side columns.
//
// - Number + title sit as a small bandeau at the top.
// - 3D viewer fills the middle, free-floating with only the ground
//   shadow (canvas + parent are both transparent).
// - Thumbs row + description sit at the bottom.
// - Wireframe toggle floats top-right of the viewer.
//
//No grid, no alternating sides, no overlap tricks - the model is the
//hero, everything else is in service of it.

const props = defineProps<{
  project: MainProjectDto
  index:   number
}>()

const { lang } = useLanguage()
const { editMode } = useAdmin()
const { data: portfolioData, updateMainProject } = usePortfolio()

const effectiveViewerSettings = useEffectiveViewerSettings(toRef(props, "project"), portfolioData, { mobile: true })

const containerRef = ref<{ $el: HTMLElement } | HTMLElement | null>(null)
const iframeRef    = ref<HTMLIFrameElement | null>(null)

const isInView    = ref(false)
const isWireframe = ref(false)

const sketchfab = useSketchfabViewer({
  iframeRef,
  modelId:  toRef(() => props.project.modelId),
  isInView,
  editMode,
  logTag:   "MainProjectPhone",
})
const sketchfabError = sketchfab.error
const isLoading      = sketchfab.isLoading

const mainImageUrl      = computed(() => props.project.mainImageUrl)
const wireframeImageUrl = computed(() => props.project.mainWireframeUrl ?? props.project.mainImageUrl)

const hasAnyWireframeImage = computed(() => {
  if (props.project.glbUrl) return true
  if (props.project.mainWireframeUrl) return true
  return props.project.thumbnails.some((t) => t.wireframeUrl)
})

const showSketchfab = computed(() => Boolean(props.project.modelId && !sketchfabError.value && isInView.value && !editMode.value))
const showMainImage = computed(() => !showSketchfab.value || isLoading.value)

//Pad to 3 cells so the thumbs row is always evenly distributed, even
//when the project only saved 1-2 thumbnails.
const thumbCells = computed(() => {
  const real = props.project.thumbnails.slice(0, 3)
  while (real.length < 3) real.push({ fileId: null, wireframeFileId: null, url: null, wireframeUrl: null, description: { en: "", fr: "" } })
  return real
})

let observer: IntersectionObserver | null = null

onMounted(() => {
  const raw = containerRef.value as { $el?: HTMLElement } | HTMLElement | null
  const el  = raw && "$el" in raw ? raw.$el : raw
  if (!el) return
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry) isInView.value = entry.isIntersecting
    },
    { threshold: 0.15, rootMargin: "0px 0px 200px 0px" },
  )
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

watch(editMode, (newVal) => { if (newVal === false) isWireframe.value = false })

function toggleWireframe(e: Event) {
  e.preventDefault()
  isWireframe.value = !isWireframe.value
}

function thumbSrc(t: { url: string | null; wireframeUrl: string | null }): string {
  return (isWireframe.value ? t.wireframeUrl ?? t.url : t.url) ?? ""
}

//LIGHTBOX hookup - tapping a thumbnail (or the static main-image fallback)
//opens the project's images as an infinite carousel.
const { open: openLightbox } = useLightbox()
const lightboxImages = computed(() => {
  const list: { url: string; alt?: string }[] = []
  const main = isWireframe.value ? props.project.mainWireframeUrl ?? props.project.mainImageUrl : props.project.mainImageUrl
  if (main) list.push({ url: main, alt: props.project.title[lang.value] })
  for (const t of props.project.thumbnails) {
    const u = isWireframe.value ? t.wireframeUrl ?? t.url : t.url
    if (u) list.push({ url: u, alt: t.description?.[lang.value] ?? "" })
  }
  return list
})
function onImageClick(startIndex: number) {
  if (editMode.value) return
  openLightbox(lightboxImages.value, startIndex)
}

async function onTitleSave(newVal: string) {
  await updateMainProject(props.project.id, {
    title: { ...props.project.title, [lang.value]: newVal },
  })
}

async function onDescriptionSave(newVal: string) {
  await updateMainProject(props.project.id, {
    description: { ...props.project.description, [lang.value]: newVal },
  })
}
</script>

<template>
  <AnimatedReveal
    ref="containerRef"
    direction="bottom"
    :distance="50"
    :duration="0.8"
    :threshold="0.1"
    class="mp-phone"
  >
    <!--HEADER bandeau: small number + title. Sits ABOVE the viewer so it
    never overlaps the model. No background - it floats over the page bg.-->
    <header class="mp-phone__header">
      <span class="mp-phone__number">{{ String(index + 1).padStart(2, "0") }}</span>
      <EditableText
        tag="h3"
        class="mp-phone__title"
        :value="project.title[lang]"
        placeholder="Project title"
        @save="onTitleSave"
      />
    </header>

    <!--VIEWER: dominates the card. Canvas + container are transparent so
    the model floats with only its ground shadow visible.-->
    <div class="mp-phone__viewer">
      <ThreeViewer
        v-if="project.glbUrl && !editMode"
        :glb-url="project.glbUrl"
        :settings="effectiveViewerSettings"
        :wireframe="isWireframe"
        :is-in-view="isInView"
        class="mp-phone__three"
      />

      <img
        v-if="!project.glbUrl && showMainImage && mainImageUrl"
        :src="(isWireframe ? wireframeImageUrl : mainImageUrl) ?? ''"
        :alt="project.title[lang]"
        class="mp-phone__viewer-image mp-phone__viewer-image--clickable"
        @click="onImageClick(0)"
      />
      <div v-else-if="!project.glbUrl && showMainImage && !mainImageUrl" class="mp-phone__viewer-empty">
        No image
      </div>

      <iframe
        v-if="!project.glbUrl && project.modelId && !editMode"
        ref="iframeRef"
        :title="`Sketchfab Model - ${project.title[lang]}`"
        class="mp-phone__viewer-embed"
        :class="{ 'mp-phone__viewer-embed--hidden': !showSketchfab || isLoading }"
      ></iframe>

      <button
        v-if="hasAnyWireframeImage"
        type="button"
        class="mp-phone__wf-btn"
        :class="{ 'mp-phone__wf-btn--active': isWireframe }"
        aria-label="Toggle wireframe"
        @click="toggleWireframe"
      >
        <Grid :size="14" />
      </button>
    </div>

    <!--THUMBS row: 3 squares, equal width, just below the viewer.
    Each clickable thumb opens the project's image carousel at its index.-->
    <div class="mp-phone__thumbs">
      <div
        v-for="(thumb, i) in thumbCells"
        :key="i"
        class="mp-phone__thumb"
        :class="{ 'mp-phone__thumb--clickable': thumbSrc(thumb) }"
        @click="onImageClick(i + 1)"
      >
        <img v-if="thumbSrc(thumb)" :src="thumbSrc(thumb)" :alt="thumb.description?.[lang] ?? ''" />
      </div>
    </div>

    <!--DESCRIPTION: short paragraph under the thumbs. Auto-height so
    longer text doesn't get clipped.-->
    <EditableText
      tag="p"
      class="mp-phone__desc"
      :value="project.description[lang]"
      :multiline="true"
      placeholder="Project description..."
      @save="onDescriptionSave"
    />
  </AnimatedReveal>
</template>

<style scoped>
/*PHONE CARD - vertical stack, viewer-dominant. Roughly one screen per
project; the next project's header peeks into the bottom of the screen
to invite continued scroll. No quinconce, no alternating sides.*/
.mp-phone {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--mp-phone-padding, var(--spacing-md)) var(--mp-phone-side-padding, var(--spacing-md));
  margin-bottom: var(--mp-phone-margin-bottom, var(--spacing-xl));
}

/*HEADER bandeau - number + title at the top of the card.----------------*/
.mp-phone__header {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-xs);
}
.mp-phone__number {
  font-family: sans-serif;
  font-weight: 900;
  font-size: var(--mp-phone-number-size, var(--font-size-md));
  color: transparent;
  -webkit-text-stroke: 1px var(--color-gray-medium);
  line-height: 1;
}
.mp-phone__title {
  color: var(--color-text-hover);
  font-weight: var(--font-weight-bold);
  font-size: var(--mp-phone-title-size, var(--font-size-md));
  letter-spacing: var(--letter-spacing-tight);
  line-height: 1.1;
}

/*VIEWER - the hero. Aspect-ratio + max-height keep it dominant without
swallowing the whole screen, leaving room for the thumbs + desc strip
and for the next project's header to peek from below.------------------*/
.mp-phone__viewer {
  position: relative;
  width: 100%;
  aspect-ratio: var(--mp-phone-viewer-aspect, 4 / 5);
  max-height: var(--mp-phone-viewer-max-height, 65vh);
  overflow: hidden;
  background: transparent;
}

.mp-phone__three,
.mp-phone__viewer-image,
.mp-phone__viewer-embed {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border: none;
  background: transparent;
}
.mp-phone__viewer-embed--hidden { display: none; }

.mp-phone__viewer-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.mp-phone__wf-btn {
  position: absolute;
  top:   var(--spacing-sm);
  right: var(--spacing-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-xl);
  height: var(--spacing-xl);
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-text-secondary);
  color: var(--color-text-hover);
  cursor: pointer;
  backdrop-filter: blur(var(--filter-blur));
  z-index: 4;
}
.mp-phone__wf-btn--active {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: hsl(0 0% 0%);
}

/*THUMBS row - 3 evenly-distributed squares below the viewer.------------*/
.mp-phone__thumbs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--mp-phone-thumb-gap, var(--spacing-xs));
}

.mp-phone__thumb {
  position: relative;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background-color: var(--color-background-gray-100);
}
.mp-phone__thumb--clickable,
.mp-phone__viewer-image--clickable { cursor: zoom-in; }
.mp-phone__thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/*DESCRIPTION - the last row of the card, auto-height paragraph.--------*/
.mp-phone__desc {
  color: var(--color-text);
  font-size: var(--mp-phone-desc-size, var(--font-size-sm));
  line-height: var(--mp-phone-desc-lh, 1.55);
  margin: 0;
  padding: 0 var(--spacing-xs);
}
</style>
