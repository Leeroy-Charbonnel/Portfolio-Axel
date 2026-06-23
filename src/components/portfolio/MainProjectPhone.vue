<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue"
import { Grid } from "lucide-vue-next"
import { useLanguage } from "../../composables/useLanguage"
import { useAdmin } from "../../composables/useAdmin"
import { usePortfolio } from "../../composables/usePortfolio"
import AnimatedReveal from "./AnimatedReveal.vue"
import EditableText from "./EditableText.vue"
import ThreeViewer from "./ThreeViewer.vue"
import type { MainProjectDto } from "../../types/portfolio"

//PHONE PROJECT CARD - CSS Grid 2 cols x 6 rows, columns swap per project.
//
//  col 1                col 2
//  +-----------------+  +-------+
//  | thumb 1         |  | title |  row 1
//  | thumb 2         |  | view  |  row 2
//  | thumb 3         |  | view  |  row 3
//  | desc            |  | view  |  row 4
//  | desc            |  | view  |  row 5
//  | desc            |  | view  |  row 6
//
//Even projects: thumbs LEFT, viewer RIGHT. Odd: mirrored. Layout mirrors
//the static mockup at public/mockup/mobile-layout.html.

declare global {
  interface Window {
    Sketchfab: any
  }
}

const props = defineProps<{
  project: MainProjectDto
  index:   number
}>()

const { lang } = useLanguage()
const { editMode } = useAdmin()
const { data: portfolioData, updateMainProject } = usePortfolio()

const effectiveViewerSettings = computed(() => {
  const raw = (props.project.viewerSettings as any) ?? null
  const prefs = portfolioData.value?.editorPrefs
  if (!prefs) return raw
  const next = raw ? { ...raw, wireframeMode: { ...(raw.wireframeMode ?? {}) } } : { wireframeMode: {} }
  if (prefs.wireframeLineColor) next.wireframeMode.overlayColor = prefs.wireframeLineColor
  if (prefs.wireframeModeColor) next.wireframeMode.color        = prefs.wireframeModeColor
  if (prefs.wireframeMaterial) {
    try { next.wireframeMode.material = JSON.parse(prefs.wireframeMaterial) } catch { /*malformed - ignore*/ }
  }
  return next
})

const containerRef = ref<{ $el: HTMLElement } | HTMLElement | null>(null)
const iframeRef    = ref<HTMLIFrameElement | null>(null)

const isInView             = ref(false)
const sketchfabInitialized = ref(false)
const sketchfabLoaded      = ref(false)
const sketchfabError       = ref(false)
const isLoading            = ref(false)
const isWireframe          = ref(false)

let sketchfabClient: any = null
let sketchfabAPI: any    = null

const mainImageUrl      = computed(() => props.project.mainImageUrl)
const wireframeImageUrl = computed(() => props.project.mainWireframeUrl ?? props.project.mainImageUrl)

const hasAnyWireframeImage = computed(() => {
  if (props.project.glbUrl) return true
  if (props.project.mainWireframeUrl) return true
  return props.project.thumbnails.some((t) => t.wireframeUrl)
})

const sideClass = computed(() => props.index % 2 === 0
  ? "mp-phone--left"
  : "mp-phone--right")

const showSketchfab = computed(() => Boolean(props.project.modelId && !sketchfabError.value && isInView.value && !editMode.value))
const showMainImage = computed(() => !showSketchfab.value || isLoading.value)

//Pad the thumbnail list with empty slots so the grid always has the 3
//cells the layout expects, even when a project only saved 1-2 thumbs.
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

watch(isInView, (val) => {
  if (val && !sketchfabInitialized.value && !editMode.value) initSketchfab()
})

watch(editMode, async (newVal) => {
  if (newVal === false && props.project.modelId) {
    sketchfabInitialized.value = false
    sketchfabLoaded.value      = false
    sketchfabError.value       = false
    isLoading.value            = false
    sketchfabAPI               = null
    sketchfabClient            = null
    isWireframe.value          = false
    await nextTick()
    if (isInView.value) initSketchfab()
  }
})

function initSketchfab() {
  if (!iframeRef.value || !isInView.value || sketchfabInitialized.value) return
  if (!props.project.modelId) return
  if (typeof window.Sketchfab !== "function") {
    console.warn("[MainProjectPhone] Sketchfab viewer script not loaded yet")
    sketchfabError.value = true
    return
  }

  isLoading.value = true
  sketchfabInitialized.value = true

  try {
    sketchfabClient = new window.Sketchfab(iframeRef.value)
    sketchfabClient.init(props.project.modelId, {
      success: (api: any) => {
        sketchfabAPI = api
        api.start()
        sketchfabLoaded.value = true
        isLoading.value = false
      },
      error: () => {
        console.error("[MainProjectPhone] Sketchfab API initialization failed")
        sketchfabError.value = true
        isLoading.value = false
      },
      autostart:    1,
      preload:      1,
      ui_animations:       0,
      ui_controls:         0,
      ui_general_controls: 0,
      ui_help:             0,
      ui_hint:             0,
      ui_infos:            0,
      ui_inspector:        0,
      ui_settings:         0,
      ui_sound:            0,
      ui_start:            0,
      ui_stop:             0,
      ui_theatre:          0,
      ui_vr:               0,
      ui_watermark:        0,
      ui_fullscreen:       0,
      ui_annotations:      0,
      ui_ar:               0,
      ui_loading:          0,
      transparent: 1,
    })
  } catch (err) {
    console.error("[MainProjectPhone] Error initializing Sketchfab:", err)
    sketchfabError.value = true
    isLoading.value = false
  }
}

function toggleWireframe(e: Event) {
  e.preventDefault()
  isWireframe.value = !isWireframe.value
}

function thumbSrc(t: { url: string | null; wireframeUrl: string | null }): string {
  return (isWireframe.value ? t.wireframeUrl ?? t.url : t.url) ?? ""
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
    :class="['mp-phone', sideClass]"
  >
    <!--THUMBS - rows 1, 2, 3 of column 1 (or column 2 for project--right)-->
    <div
      v-for="(thumb, i) in thumbCells"
      :key="i"
      class="mp-phone__thumb"
      :class="`mp-phone__thumb--${i + 1}`"
    >
      <img v-if="thumbSrc(thumb)" :src="thumbSrc(thumb)" :alt="thumb.description?.[lang] ?? ''" />
    </div>

    <!--DESC - rows 4-6 of the same column as the thumbs.-->
    <EditableText
      tag="p"
      class="mp-phone__desc"
      :value="project.description[lang]"
      :multiline="true"
      placeholder="Project description..."
      @save="onDescriptionSave"
    />

    <!--TITLE - row 1 of the viewer column.-->
    <div class="mp-phone__title">
      <span class="mp-phone__title-number">{{ String(index + 1).padStart(2, "0") }}</span>
      <EditableText
        tag="span"
        class="mp-phone__title-text"
        :value="project.title[lang]"
        placeholder="Project title"
        @save="onTitleSave"
      />
    </div>

    <!--VIEWER - rows 2-6 of the viewer column.-->
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
        class="mp-phone__viewer-image"
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
  </AnimatedReveal>
</template>

<style scoped>
/*PHONE CARD - CSS Grid 2 cols x 6 rows. aspect-ratio gives the grid a
defined height proportional to width so `repeat(6, 1fr)` splits into
6 EQUAL rows. Tuned so each row matches the thumbnail column width,
keeping thumbs square. No transforms, no border-radius, no fixed pixel
heights.*/
.mp-phone {
  display: grid;
  aspect-ratio: var(--mp-phone-aspect, 5 / 9);
  grid-template-rows: repeat(6, 1fr);
  gap: var(--mp-phone-gap, 4%);
  padding: 6% 0 var(--mp-phone-margin-bottom, 4%);
}

/*Default = thumbs LEFT, viewer RIGHT.*/
.mp-phone--left {
  grid-template-columns: var(--mp-phone-thumbs-col, 30%) 1fr;
  grid-template-areas:
    "thumb1 title"
    "thumb2 viewer"
    "thumb3 viewer"
    "desc   viewer"
    "desc   viewer"
    "desc   viewer";
}

/*Inverted = thumbs RIGHT, viewer LEFT.*/
.mp-phone--right {
  grid-template-columns: 1fr var(--mp-phone-thumbs-col, 30%);
  grid-template-areas:
    "title  thumb1"
    "viewer thumb2"
    "viewer thumb3"
    "viewer desc"
    "viewer desc"
    "viewer desc";
}

/*--- Grid placements ---*/
.mp-phone__thumb--1 { grid-area: thumb1; }
.mp-phone__thumb--2 { grid-area: thumb2; }
.mp-phone__thumb--3 { grid-area: thumb3; }
.mp-phone__desc     { grid-area: desc; }
.mp-phone__title    { grid-area: title; }
.mp-phone__viewer   { grid-area: viewer; }

/*THUMBS ---------------------------------------------------------------*/
.mp-phone__thumb {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  background: var(--color-background-gray-100);
}
.mp-phone__thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/*TITLE ---------------------------------------------------------------*/
.mp-phone__title {
  display: flex;
  align-items: end;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-xxs);
}
.mp-phone__title-number {
  font-family: sans-serif;
  font-weight: 900;
  font-size: var(--mp-phone-number-size, var(--font-size-md));
  color: transparent;
  -webkit-text-stroke: 1px var(--color-gray-medium);
  line-height: 1;
}
.mp-phone__title-text {
  color: var(--color-text-hover);
  font-weight: var(--font-weight-bold);
  font-size: var(--mp-phone-title-size, var(--font-size-md));
  letter-spacing: var(--letter-spacing-tight);
  line-height: 1.1;
}

/*VIEWER ---------------------------------------------------------------*/
.mp-phone__viewer {
  position: relative;
  overflow: hidden;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  background: var(--color-background-secondary);
  min-height: 0;
  min-width:  0;
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
  bottom: var(--spacing-sm);
  right:  var(--spacing-sm);
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

/*DESCRIPTION ----------------------------------------------------------*/
.mp-phone__desc {
  color: var(--color-text);
  font-size: var(--mp-phone-desc-size, var(--font-size-sm));
  line-height: var(--mp-phone-desc-lh, 1.55);
  margin: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
