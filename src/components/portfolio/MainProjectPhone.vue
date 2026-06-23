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

//PHONE PROJECT CARD - clean, readable vertical stack. Each section gets
//its own row, viewer dominates the middle, thumbs sit underneath as a
//horizontal strip, description anchors at the bottom. Projects overlap
//slightly via the parent list's absolute positioning per index.

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

//Feeds the CSS rule `top: calc(var(--phone-i) * 65vh)`.
const indexStyle = computed(() => ({ "--phone-i": String(props.index) }))
//Alternate sides so even projects have thumbs LEFT, odd RIGHT - quinconce.
const sideClass  = computed(() => props.index % 2 === 0
  ? "mp-phone__main--thumbs-left"
  : "mp-phone__main--thumbs-right")

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
    :distance="50"
    :duration="0.8"
    :threshold="0.1"
    class="mp-phone"
    :style="indexStyle"
  >
    <!--HEADER - number + title, small row at the top.-->
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

    <!--MAIN ROW - vertical thumb column on one side, viewer on the other.
    Side decided by index parity.-->
    <div class="mp-phone__main" :class="sideClass">
      <div v-if="project.thumbnails.length" class="mp-phone__thumbs">
        <div
          v-for="(thumb, i) in project.thumbnails.slice(0, 3)"
          :key="i"
          class="mp-phone__thumb"
        >
          <img v-if="thumbSrc(thumb)" :src="thumbSrc(thumb)" :alt="thumb.description?.[lang] ?? ''" />
        </div>
      </div>

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
    </div>

    <!--DESCRIPTION - paragraph below the main row.-->
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
/*PHONE CARD - absolute-positioned by index so projects overlap subtly
(parent list has explicit height that contains them).

Layout per project:
  - header        (number + title, 7vh)
  - main row      (thumbs vertical column + viewer, 50vh)
  - desc          (paragraph, ~13vh)
  total card height = 70vh; next card starts at 60vh, so 10vh overlap.

Sides alternate: even projects have thumbs LEFT / viewer RIGHT, odd are
mirrored.*/
.mp-phone {
  position: absolute;
  top: calc(var(--phone-i, 0) * 60vh);
  left: 0;
  right: 0;
  height: 70vh;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md);
  z-index: 1;
}

/*HEADER ----------------------------------------------------------------*/
.mp-phone__header {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  height: 7vh;
  flex-shrink: 0;
}

.mp-phone__number {
  font-family: sans-serif;
  font-size: var(--font-size-lg);
  font-weight: 900;
  color: transparent;
  -webkit-text-stroke: 1px var(--color-gray-medium);
  line-height: 1;
}

.mp-phone__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tight);
  line-height: 1.1;
  color: var(--color-text-hover);
}

/*MAIN ROW - thumbs + viewer side-by-side. Direction flips per project.-*/
.mp-phone__main {
  display: flex;
  gap: var(--spacing-sm);
  flex: 0 0 50vh;
  min-height: 0;
}
.mp-phone__main--thumbs-left  { flex-direction: row; }
.mp-phone__main--thumbs-right { flex-direction: row-reverse; }

/*THUMBS - vertical column, 3 stacked squares.--------------------------*/
.mp-phone__thumbs {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  flex: 0 0 22vw;
  max-width: 100px;
  height: 100%;
}

.mp-phone__thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
}
.mp-phone__thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/*VIEWER - fills the remaining horizontal space, full row height.-------*/
.mp-phone__viewer {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  overflow: hidden;
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
  width: var(--spacing-xl);
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
  font-size: var(--font-size-sm);
  line-height: 1.55;
  color: var(--color-text);
  margin: 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
</style>
