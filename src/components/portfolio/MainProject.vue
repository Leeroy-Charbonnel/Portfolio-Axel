<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue"
import { Grid } from "lucide-vue-next"
import { useLanguage } from "../../composables/useLanguage"
import { hexToRgb } from "../../lib/portfolio-utils"
import AnimatedReveal from "./AnimatedReveal.vue"
import AnimatedCounter from "./AnimatedCounter.vue"
import type { MainProjectDto } from "../../types/portfolio"

//Sketchfab viewer is loaded from a global <script> tag in index.html.
declare global {
  interface Window {
    Sketchfab: any
  }
}

const props = defineProps<{
  project: MainProjectDto
  index:   number
}>()

const { t, lang } = useLanguage()

const containerRef = ref<HTMLElement | null>(null)
const iframeRef    = ref<HTMLIFrameElement | null>(null)

const isInView                = ref(false)
const sketchfabInitialized    = ref(false)
const sketchfabLoaded         = ref(false)
const sketchfabError          = ref(false)
const isLoading               = ref(false)
const isWireframe             = ref(false)

//Sketchfab handles (kept as plain refs - they are non-reactive mutable objects)
let sketchfabClient: any = null
let sketchfabAPI: any    = null
let geometryNodes: any[] = []
const originalMaterials: Record<string, any> = {}
let whiteMaterialId:    string | null = null
let emissiveMaterialId: string | null = null
const originalLights: Record<number, { intensity: number; color: number[] }> = {}

//WIREFRAME visualization constants from the project's data row
const wireframeColor             = computed(() => props.project.wireframeParameters?.wireframeColor ?? "00000020")
const whiteMaterialColor         = computed(() => props.project.wireframeParameters?.whiteMaterialColor ?? "ffffff")
const emissiveMaterialsOverwrite = computed(() => props.project.wireframeParameters?.emissiveMaterialsOverwrite ?? [])
const emissiveMaterialColor      = "#85efff"

const mainImageUrl     = computed(() => props.project.mainImageUrl)
//if no dedicated wireframe still exists, fall back to the main image so the
//<img> always has a source while Sketchfab loads
const wireframeImageUrl = computed(() => props.project.mainWireframeUrl ?? props.project.mainImageUrl)
const layoutClass       = computed(() => `main-project--layout-${props.index % 2}`)

const showSketchfab = computed(() => Boolean(props.project.modelId && !sketchfabError.value && isInView.value))
const showMainImage = computed(() => !showSketchfab.value || isLoading.value)

let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!containerRef.value) return
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry) isInView.value = entry.isIntersecting
    },
    { threshold: 0.3, rootMargin: "0px 0px 200px 0px" },
  )
  observer.observe(containerRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

watch(isInView, (val) => {
  if (val && !sketchfabInitialized.value) initSketchfab()
})

function initSketchfab() {
  if (!iframeRef.value || !isInView.value || sketchfabInitialized.value) return
  if (!props.project.modelId) return
  if (typeof window.Sketchfab !== "function") {
    console.warn("[MainProject] Sketchfab viewer script not loaded yet")
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
        api.addEventListener("viewerready", onViewerReady)
        sketchfabLoaded.value = true
        isLoading.value = false
      },
      error: () => {
        console.error("[MainProject] Sketchfab API initialization failed")
        sketchfabError.value = true
        isLoading.value = false
      },
      autostart:   1,
      preload:     1,
      ui_controls: 0,
    })
  } catch (err) {
    console.error("[MainProject] Error initializing Sketchfab:", err)
    sketchfabError.value = true
    isLoading.value = false
  }
}

function onViewerReady() {
  if (!sketchfabAPI) return
  initMaterials()
  storeOriginalLights()

  sketchfabAPI.getNodeMap((err: any, nodes: any) => {
    if (err) {
      console.error("[MainProject] getNodeMap error:", err)
      return
    }
    //gather geometry nodes and remember each node's original material id
    geometryNodes = (Object.values(nodes) as any[]).filter((n) => n.type === "Geometry")
    for (const node of geometryNodes) {
      originalMaterials[node.name] = node.materialID
    }
  })
}

function storeOriginalLights() {
  if (!sketchfabAPI) return
  for (let i = 0; i < 3; i++) {
    sketchfabAPI.getLight(i, (err: any, light: any) => {
      if (err) {
        console.error(`[MainProject] getLight ${i} error:`, err)
        return
      }
      originalLights[i] = { intensity: light.intensity, color: light.color }
    })
  }
}

function initMaterials() {
  if (!sketchfabAPI) return

  //emissive material used to highlight specific parts in wireframe mode
  sketchfabAPI.createMaterial({
    channels: {
      AlbedoPBR:    { color: [hexToRgb(emissiveMaterialColor)] },
      EmitColor:    { enable: true, type: "additive", factor: 1, color: hexToRgb(emissiveMaterialColor) },
      RoughnessPBR: { factor: 1 },
    },
  }, (err: any, material: any) => {
    if (err) {
      console.error("[MainProject] createMaterial (emissive) error:", err)
      return
    }
    emissiveMaterialId = material.id
  })

  //flat material applied to every non-highlighted node in wireframe mode
  sketchfabAPI.createMaterial({
    channels: {
      AlbedoPBR:    { color: hexToRgb(whiteMaterialColor.value) },
      EmitColor:    { enable: false },
      RoughnessPBR: { factor: 1 },
    },
  }, (err: any, material: any) => {
    if (err) {
      console.error("[MainProject] createMaterial (white) error:", err)
      return
    }
    whiteMaterialId = material.id
  })
}

function setLightsForWireframe() {
  if (!sketchfabAPI || !props.project.wireframeParameters?.lightsOverwrite) return
  for (const light of props.project.wireframeParameters.lightsOverwrite) {
    if (light.index < 0 || light.index >= 3) continue
    const intensity = light.intensity ?? originalLights[light.index]?.intensity
    const color     = light.color ? hexToRgb(light.color) : originalLights[light.index]?.color
    sketchfabAPI.setLight(light.index, { intensity, color })
  }
}

function restoreOriginalLights() {
  if (!sketchfabAPI) return
  for (const [indexStr, settings] of Object.entries(originalLights)) {
    sketchfabAPI.setLight(parseInt(indexStr), { intensity: settings.intensity, color: settings.color })
  }
}

function toggleWireframe(e: Event) {
  e.preventDefault()
  if (!sketchfabAPI || whiteMaterialId === null || emissiveMaterialId === null) {
    isWireframe.value = false
    return
  }

  const next = !isWireframe.value
  sketchfabAPI.setWireframe(true, { color: next ? wireframeColor.value : "00000000" })

  if (next) {
    setLightsForWireframe()
    for (const node of geometryNodes) {
      const matId = originalMaterials[node.name]
      if (emissiveMaterialsOverwrite.value.includes(matId)) {
        sketchfabAPI.assignMaterial(node, emissiveMaterialId)
      } else {
        sketchfabAPI.assignMaterial(node, whiteMaterialId)
      }
    }
  } else {
    restoreOriginalLights()
    for (const node of geometryNodes) {
      sketchfabAPI.assignMaterial(node, originalMaterials[node.name])
    }
  }

  isWireframe.value = next
}

const statRows = computed(() => [
  { key: "vertices", labelKey: "projectsStatVertices", value: props.project.stats.vertices ?? 0 },
  { key: "edges",    labelKey: "projectsStatEdges",    value: props.project.stats.edges ?? 0 },
  { key: "faces",    labelKey: "projectsStatFaces",    value: props.project.stats.faces ?? 0 },
])

//thumbnails come pre-resolved with both normal and wireframe URLs. when wireframe
//is on we prefer the wireframe variant; if it doesn't exist we fall back to the
//normal one so the slot never empties
function thumbSrc(t: { url: string | null; wireframeUrl: string | null }): string {
  return (isWireframe.value ? t.wireframeUrl ?? t.url : t.url) ?? ""
}
</script>

<template>
  <AnimatedReveal
    direction="bottom"
    :distance="100"
    :duration="0.8"
    :threshold="0.1"
    class="main-project"
  >
    <div ref="containerRef" :class="['container', 'main-project__container', layoutClass]">
      <div class="main-project__header">
        <h3 class="main-project__number">{{ String(index + 1).padStart(2, "0") }}</h3>
        <h3 class="main-project__title">{{ project.title[lang] }}</h3>
      </div>

      <div class="main-project__content">
        <div class="main-project__thumbnails">
          <div
            v-for="(thumb, i) in project.thumbnails"
            :key="i"
            class="main-project__thumbnail border-sm"
          >
            <img
              v-if="thumbSrc(thumb)"
              :src="thumbSrc(thumb)"
              :alt="thumb.description?.[lang] ?? ''"
              :title="thumb.description?.[lang] ?? ''"
            />
          </div>
        </div>

        <div class="main-project__panel">
          <div class="main-project__model-section">
            <div class="main-project__model border-sm">
              <img
                v-if="showMainImage && mainImageUrl"
                :src="(isWireframe ? wireframeImageUrl : mainImageUrl) ?? ''"
                :alt="project.title[lang]"
                class="main-project__main-image"
              />

              <iframe
                v-if="project.modelId"
                ref="iframeRef"
                :title="`Sketchfab Model - ${project.title[lang]}`"
                class="main-project__embed"
                :class="{ 'main-project__embed--hidden': !showSketchfab || isLoading }"
              ></iframe>

              <button
                type="button"
                class="main-project__wireframe-btn"
                :class="{ 'main-project__wireframe-btn--active': isWireframe, 'border-sm': !isWireframe }"
                :disabled="!sketchfabLoaded"
                aria-label="Toggle wireframe"
                @click="toggleWireframe"
              >
                <Grid :size="16" />
              </button>
            </div>
          </div>

          <div class="main-project__details">
            <p class="main-project__description">{{ project.description[lang] }}</p>

            <div class="main-project__stats-and-software">
              <div class="main-project__stats">
                <AnimatedReveal
                  v-for="(item, idx) in statRows"
                  :key="item.key"
                  direction="bottom"
                  :distance="20"
                  :duration="0.5"
                  :delay="idx * 0.1 + 0.3"
                  :initial-opacity="0"
                  :final-opacity="1"
                  class="main-project__stat"
                >
                  <div class="main-project__stat-label">{{ t(item.labelKey) }}</div>
                  <AnimatedCounter :from="0" :to="item.value" :duration="2" />
                </AnimatedReveal>
              </div>

              <div class="main-project__software-list">
                <div
                  v-for="(sw, idx) in project.software"
                  :key="idx"
                  class="main-project__software"
                >
                  <a :href="sw.url" target="_blank" rel="noopener noreferrer">
                    <img v-if="sw.logoUrl" :src="sw.logoUrl" :alt="sw.key" width="24" height="24" />
                    <span class="main-project__software-name">{{ sw.key }}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AnimatedReveal>
</template>

<style scoped>
.main-project {
  --thumbnail-gap:    var(--spacing-xxs);
  --thumbnail-count:  3;
  --project-height:        90vh;
  --project-header-height: 10vh;
  --project-content-height: 80vh;

  width: 100%;
  margin-bottom: var(--spacing-3xl);
  height: var(--project-height);
  overflow: hidden;
  padding-bottom: var(--spacing-lg);
  background: linear-gradient(to right, transparent, var(--color-background-secondary));
}

.main-project__container { height: var(--project-height); }

.main-project__header {
  display: flex;
  align-items: center;
  height: var(--project-header-height);
  font-size: var(--font-size-lg);
  background: transparent;
  gap: var(--spacing-xxs);
}

.main-project__number {
  font-weight: var(--font-weight-bold);
  color: transparent;
  -webkit-text-stroke: var(--border-width-sm) var(--color-text);
}

.main-project__content {
  display: grid;
  height: var(--project-content-height);
  position: relative;
  gap: var(--spacing-xl);
}

.main-project--layout-0 .main-project__content { display: flex; flex-direction: row; }
.main-project--layout-1 .main-project__content { display: flex; flex-direction: row-reverse; }

.main-project__thumbnails {
  display: flex;
  gap: var(--thumbnail-gap);
  justify-content: space-between;
  flex-direction: column;
  height: var(--project-content-height);
  position: relative;
}

.main-project__thumbnail {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
  height: calc(33% - (var(--thumbnail-gap) * (var(--thumbnail-count) - 2)));
}

.main-project__thumbnail img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.main-project__panel { display: flex; flex-direction: column; }

.main-project__model-section {
  display: flex;
  width: 100%;
  flex-grow: 1;
}

.main-project__model {
  height: 100%;
  width: 100%;
  position: relative;
}

.main-project__main-image,
.main-project__embed {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border: none;
}

.main-project__embed--hidden { display: none; }

.main-project__details { height: fit-content; }

.main-project__description {
  text-align: justify;
  margin: var(--spacing-xl) 0;
}

.main-project__stats-and-software {
  display: flex;
  justify-content: space-between;
  align-content: center;
}

.main-project__stats {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.main-project__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 100px;
  flex-grow: 1;
}

.main-project__stat-label {
  font-size: var(--font-size-base);
  color: var(--color-background-gray-300);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-normal);
}

.main-project__stat :deep(span) {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-hover);
}

.main-project__software-list {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.main-project__software {
  border-radius: var(--border-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-grow: 1;
}

.main-project__software a {
  display: flex;
  gap: var(--spacing-xs);
  background: linear-gradient(to bottom right, var(--color-background-gray-100), var(--color-background-gray-150));
  padding: var(--spacing-xs);
  border-radius: var(--border-radius-md);
  height: fit-content;
  flex-grow: 1;
}

.main-project__software img { filter: brightness(0.8); }
.main-project__software a:hover img { filter: brightness(1); }
.main-project__software a:hover * { color: var(--color-text-hover); }

/*WIREFRAME toggle button - floats at bottom-right of the model viewport*/
.main-project__wireframe-btn {
  position: absolute;
  bottom: var(--spacing-md);
  right:  var(--spacing-md);
  border-radius: 50%;
  background: var(--color-text-secondary);
  width:  var(--spacing-2xl);
  height: var(--spacing-2xl);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease;
  z-index: 10;
  color: hsl(0 0% 0%);
}

.main-project__wireframe-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.main-project__wireframe-btn--active {
  background-color: var(--color-accent);
}

@media (max-width: 768px) {
  .main-project__header { font-size: var(--font-size-base); }
  .main-project__title {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .main-project--layout-0 .main-project__content,
  .main-project--layout-1 .main-project__content {
    flex-direction: column;
  }

  .main-project__panel { height: inherit; }

  .main-project__thumbnails {
    flex-direction: row;
    height: fit-content;
  }

  .main-project__thumbnail {
    aspect-ratio: 1;
    height: fit-content;
    width: calc(33% - (var(--thumbnail-gap) * (var(--thumbnail-count) - 2)));
  }

  .main-project__software-list {
    align-content: center;
    justify-content: center;
    height: fit-content;
    width: 100%;
  }

  .main-project__software a {
    justify-content: center;
    width: 100%;
  }

  .main-project__stats {
    width: 100%;
    align-content: center;
    justify-content: space-around;
    margin-bottom: var(--spacing-md);
    flex-wrap: nowrap;
  }

  .main-project__stats-and-software {
    flex-direction: column;
    align-items: center;
  }
}

@media (max-width: 400px) {
  .main-project__software-name { display: none; }
}
</style>
