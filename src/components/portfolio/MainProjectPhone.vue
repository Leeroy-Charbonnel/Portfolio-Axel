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

//PHONE-SPECIFIC main project card. Completely separate from the desktop
//MainProject component - its only job is the staggered "quinconce" mobile
//layout where projects literally overlap to read as one continuous scroll
//instead of stacked blocks.
//
// - Absolute positioning per index forces the overlap regardless of any
//   parent cascade. Stage = 90vh, projects start every 65vh, so the
//   overlap zone between any two adjacent projects is 25vh.
// - Sides alternate (left / right) based on index % 2 - thumbs + desc
//   on one edge, viewer on the opposite edge.
//
//Edit-mode is kept minimal: title + description text only. Layout picker,
//stats, software list, model-id are desktop-only concerns.

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

//Merge per-project viewer settings with the admin's GLOBAL editor prefs
//(same logic as the desktop component - keeps wireframe line/material
//tweaks live across every model on the site).
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

//AnimatedReveal is a Vue component, not a DOM element - ref returns the
//instance and we have to reach for its $el to feed IntersectionObserver.
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
  ? "main-project-phone--left"
  : "main-project-phone--right")

//Inline custom property feeds the CSS rule `top: calc(var(--phone-i) * 65vh)`.
const indexStyle = computed(() => ({ "--phone-i": String(props.index) }))

const showSketchfab = computed(() => Boolean(props.project.modelId && !sketchfabError.value && isInView.value && !editMode.value))
const showMainImage = computed(() => !showSketchfab.value || isLoading.value)

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
    :distance="60"
    :duration="0.8"
    :threshold="0.1"
    :class="['main-project-phone', sideClass]"
    :style="indexStyle"
  >
    <header class="main-project-phone__header">
      <span class="main-project-phone__number">{{ String(index + 1).padStart(2, "0") }}</span>
      <EditableText
        tag="h3"
        class="main-project-phone__title"
        :value="project.title[lang]"
        placeholder="Project title"
        @save="onTitleSave"
      />
    </header>

    <div class="main-project-phone__stage">
      <ThreeViewer
        v-if="project.glbUrl && !editMode"
        :glb-url="project.glbUrl"
        :settings="effectiveViewerSettings"
        :wireframe="isWireframe"
        :is-in-view="isInView"
        class="main-project-phone__three"
      />

      <img
        v-if="!project.glbUrl && showMainImage && mainImageUrl"
        :src="(isWireframe ? wireframeImageUrl : mainImageUrl) ?? ''"
        :alt="project.title[lang]"
        class="main-project-phone__viewer-image"
      />
      <div v-else-if="!project.glbUrl && showMainImage && !mainImageUrl" class="main-project-phone__viewer-empty">
        No image
      </div>

      <iframe
        v-if="!project.glbUrl && project.modelId && !editMode"
        ref="iframeRef"
        :title="`Sketchfab Model - ${project.title[lang]}`"
        class="main-project-phone__viewer-embed"
        :class="{ 'main-project-phone__viewer-embed--hidden': !showSketchfab || isLoading }"
      ></iframe>

      <!--Thumb column - 3 stacked squares on the alternating side-->
      <div v-if="project.thumbnails.length" class="main-project-phone__thumbs">
        <div
          v-for="(thumb, i) in project.thumbnails.slice(0, 3)"
          :key="i"
          class="main-project-phone__thumb"
        >
          <img v-if="thumbSrc(thumb)" :src="thumbSrc(thumb)" :alt="thumb.description?.[lang] ?? ''" />
        </div>
      </div>

      <!--Description floats on the same side as the thumbs, anchored low.-->
      <EditableText
        tag="p"
        class="main-project-phone__desc"
        :value="project.description[lang]"
        :multiline="true"
        placeholder="Project description..."
        @save="onDescriptionSave"
      />

      <button
        v-if="hasAnyWireframeImage"
        type="button"
        class="main-project-phone__wf-btn"
        :class="{ 'main-project-phone__wf-btn--active': isWireframe }"
        aria-label="Toggle wireframe"
        @click="toggleWireframe"
      >
        <Grid :size="14" />
      </button>
    </div>
  </AnimatedReveal>
</template>

<style scoped>
/*PHONE CARD - absolute-positioned by index so projects literally overlap.
Stage is 90vh; each project starts 65vh after the previous, leaving a
25vh overlap zone between any two adjacent projects. The parent list
sets its own height so scrolling still works.*/
.main-project-phone {
  position: absolute;
  top: calc(var(--phone-i, 0) * 65vh);
  left: 0;
  right: 0;
  height: 90vh;
  z-index: calc(10 - var(--phone-i, 0));
  pointer-events: none;
}
.main-project-phone > * { pointer-events: auto; }

.main-project-phone__header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  z-index: 8;
}

.main-project-phone__number {
  font-family: sans-serif;
  font-size: var(--font-size-md);
  font-weight: 900;
  color: transparent;
  -webkit-text-stroke: 1px var(--color-gray-medium);
  line-height: 1;
}

.main-project-phone__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tight);
  line-height: 1.1;
  color: var(--color-text-hover);
}

.main-project-phone__stage {
  position: absolute;
  inset: 0;
  /*Fade the top + bottom of each stage to transparent so two overlapping
  stages bleed into each other instead of cutting at hard edges.*/
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 14%, black 86%, transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0, black 14%, black 86%, transparent 100%);
}

/*VIEWER - fills the OPPOSITE side from the thumbs.*/
.main-project-phone__three,
.main-project-phone__viewer-image,
.main-project-phone__viewer-embed {
  position: absolute;
  top: 0;
  bottom: 0;
  object-fit: contain;
  border: none;
  background: transparent;
}
.main-project-phone--left  .main-project-phone__three,
.main-project-phone--left  .main-project-phone__viewer-image,
.main-project-phone--left  .main-project-phone__viewer-embed { left: 34vw; right: 0; }
.main-project-phone--right .main-project-phone__three,
.main-project-phone--right .main-project-phone__viewer-image,
.main-project-phone--right .main-project-phone__viewer-embed { right: 34vw; left: 0; }

.main-project-phone__viewer-embed--hidden { display: none; }

.main-project-phone__viewer-empty {
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

/*THUMBS - vertical column on the alternating edge. Pulled up a touch so
they start near the top of the stage but inside its visible area.*/
.main-project-phone__thumbs {
  position: absolute;
  top: 12vh;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  width: 32vw;
  max-width: 140px;
  z-index: 6;
}
.main-project-phone--left  .main-project-phone__thumbs { left:  0; right: auto; }
.main-project-phone--right .main-project-phone__thumbs { right: 0; left:  auto; }

.main-project-phone__thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
}
.main-project-phone__thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/*DESC - anchored low on the same side as the thumbs.*/
.main-project-phone__desc {
  position: absolute;
  bottom: 6vh;
  width: 55%;
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: hsl(var(--background) / 0.7);
  backdrop-filter: blur(10px);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  z-index: 7;
}
.main-project-phone--left  .main-project-phone__desc { left:  0; right: auto; }
.main-project-phone--right .main-project-phone__desc { right: 0; left:  auto; }

/*Wireframe toggle - icon only on phone (no label).*/
.main-project-phone__wf-btn {
  position: absolute;
  bottom: var(--spacing-md);
  right:  var(--spacing-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--spacing-xl);
  height: var(--spacing-xl);
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-text-secondary);
  color: var(--color-text-hover);
  cursor: pointer;
  backdrop-filter: blur(var(--filter-blur));
  z-index: 10;
}
.main-project-phone--left .main-project-phone__wf-btn { right: auto; left: calc(34vw + var(--spacing-md)); }
.main-project-phone__wf-btn--active {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: hsl(0 0% 0%);
}
</style>
