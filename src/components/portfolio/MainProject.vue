<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue"
import { Grid, PanelLeft, PanelRight, PanelBottom, Square } from "lucide-vue-next"
import { useLanguage } from "../../composables/useLanguage"
import { useAdmin } from "../../composables/useAdmin"
import { usePortfolio } from "../../composables/usePortfolio"
import { hexToRgb, pickImageFile } from "../../lib/portfolio-utils"
import AnimatedReveal from "./AnimatedReveal.vue"
import AnimatedCounter from "./AnimatedCounter.vue"
import EditableText from "./EditableText.vue"
import RemoveButton from "./RemoveButton.vue"
import ReplaceImageButton from "./ReplaceImageButton.vue"
import { MAIN_PROJECT_LAYOUTS, type MainProjectDto, type MainProjectLayout } from "../../types/portfolio"

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
const { editMode } = useAdmin()
const { uploadFile, updateMainProject, deleteMainProject } = usePortfolio()

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

const wireframeColor             = computed(() => props.project.wireframeParameters?.wireframeColor ?? "00000020")
const whiteMaterialColor         = computed(() => props.project.wireframeParameters?.whiteMaterialColor ?? "ffffff")
const emissiveMaterialsOverwrite = computed(() => props.project.wireframeParameters?.emissiveMaterialsOverwrite ?? [])
const emissiveMaterialColor      = "#85efff"

const mainImageUrl      = computed(() => props.project.mainImageUrl)
const wireframeImageUrl = computed(() => props.project.mainWireframeUrl ?? props.project.mainImageUrl)
const layoutClass       = computed(() => `main-project--layout-${props.project.layout}`)

//ICON used for each layout choice in the picker (visually communicates the arrangement)
const LAYOUT_ICONS: Record<MainProjectLayout, typeof PanelLeft> = {
  "thumbs-left":   PanelLeft,
  "thumbs-right":  PanelRight,
  "thumbs-bottom": PanelBottom,
  "viewer-only":   Square,
}

const showThumbnails = computed(() => props.project.layout !== "viewer-only")

const showSketchfab = computed(() => Boolean(props.project.modelId && !sketchfabError.value && isInView.value && !editMode.value))
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
  if (val && !sketchfabInitialized.value && !editMode.value) initSketchfab()
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
    if (err) { console.error("[MainProject] getNodeMap error:", err); return }
    geometryNodes = (Object.values(nodes) as any[]).filter((n) => n.type === "Geometry")
    for (const node of geometryNodes) originalMaterials[node.name] = node.materialID
  })
}

function storeOriginalLights() {
  if (!sketchfabAPI) return
  for (let i = 0; i < 3; i++) {
    sketchfabAPI.getLight(i, (err: any, light: any) => {
      if (err) { console.error(`[MainProject] getLight ${i} error:`, err); return }
      originalLights[i] = { intensity: light.intensity, color: light.color }
    })
  }
}

function initMaterials() {
  if (!sketchfabAPI) return
  sketchfabAPI.createMaterial({
    channels: {
      AlbedoPBR:    { color: [hexToRgb(emissiveMaterialColor)] },
      EmitColor:    { enable: true, type: "additive", factor: 1, color: hexToRgb(emissiveMaterialColor) },
      RoughnessPBR: { factor: 1 },
    },
  }, (err: any, material: any) => {
    if (err) { console.error("[MainProject] createMaterial (emissive) error:", err); return }
    emissiveMaterialId = material.id
  })
  sketchfabAPI.createMaterial({
    channels: {
      AlbedoPBR:    { color: hexToRgb(whiteMaterialColor.value) },
      EmitColor:    { enable: false },
      RoughnessPBR: { factor: 1 },
    },
  }, (err: any, material: any) => {
    if (err) { console.error("[MainProject] createMaterial (white) error:", err); return }
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
    for (const node of geometryNodes) sketchfabAPI.assignMaterial(node, originalMaterials[node.name])
  }
  isWireframe.value = next
}

const statRows = computed(() => [
  { key: "vertices" as const, labelKey: "projectsStatVertices", value: props.project.stats.vertices ?? 0 },
  { key: "edges"    as const, labelKey: "projectsStatEdges",    value: props.project.stats.edges ?? 0 },
  { key: "faces"    as const, labelKey: "projectsStatFaces",    value: props.project.stats.faces ?? 0 },
])

function thumbSrc(t: { url: string | null; wireframeUrl: string | null }): string {
  return (isWireframe.value ? t.wireframeUrl ?? t.url : t.url) ?? ""
}

//ADMIN MUTATIONS - each save fires a PUT and the parent's reload picks up the new state
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

async function onModelIdSave(newVal: string) {
  await updateMainProject(props.project.id, { modelId: newVal.trim() })
}

async function onLayoutChange(layout: MainProjectLayout) {
  if (layout === props.project.layout) return
  await updateMainProject(props.project.id, { layout })
}

async function onStatSave(key: "vertices" | "edges" | "faces", val: string) {
  const n = parseInt(val.replace(/[^\d-]/g, ""), 10)
  if (Number.isNaN(n)) return
  await updateMainProject(props.project.id, {
    stats: { ...props.project.stats, [key]: n },
  })
}

async function onReplaceMainImage() {
  const file = await pickImageFile()
  if (!file) return
  try {
    const { id } = await uploadFile(file)
    await updateMainProject(props.project.id, { mainImageFileId: id })
  } catch (e) { console.error("[MainProject] replace main image failed:", e) }
}

async function onReplaceWireframeImage() {
  const file = await pickImageFile()
  if (!file) return
  try {
    const { id } = await uploadFile(file)
    await updateMainProject(props.project.id, { mainWireframeFileId: id })
  } catch (e) { console.error("[MainProject] replace wireframe image failed:", e) }
}

async function onDelete() {
  await deleteMainProject(props.project.id)
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
      <RemoveButton v-if="editMode" label="Delete project" @click="onDelete" />

      <div class="main-project__header">
        <h3 class="main-project__number">{{ String(index + 1).padStart(2, "0") }}</h3>

        <EditableText
          tag="h3"
          class="main-project__title"
          :value="project.title[lang]"
          placeholder="Project title"
          @save="onTitleSave"
        />

        <!--Layout picker - admin only. 4 icons, one per arrangement option-->
        <div v-if="editMode" class="main-project__layout-picker" role="group" aria-label="Layout">
          <button
            v-for="opt in MAIN_PROJECT_LAYOUTS"
            :key="opt.key"
            type="button"
            class="main-project__layout-option"
            :class="{ 'main-project__layout-option--active': project.layout === opt.key }"
            :aria-label="opt.label"
            :title="opt.label"
            @click="onLayoutChange(opt.key)"
          >
            <component :is="LAYOUT_ICONS[opt.key]" :size="16" />
          </button>
        </div>
      </div>

      <div class="main-project__content">
        <div v-if="showThumbnails" class="main-project__thumbnails">
          <div
            v-for="(thumb, i) in project.thumbnails"
            :key="i"
            class="main-project__thumbnail border-sm no-grain"
          >
            <img v-if="thumbSrc(thumb)" :src="thumbSrc(thumb)" :alt="thumb.description?.[lang] ?? ''" />
          </div>
        </div>

        <div class="main-project__panel">
          <div class="main-project__model-section no-grain">
            <div class="main-project__model border-sm">
              <img
                v-if="showMainImage && mainImageUrl"
                :src="(isWireframe ? wireframeImageUrl : mainImageUrl) ?? ''"
                :alt="project.title[lang]"
                class="main-project__main-image"
              />
              <div v-else-if="showMainImage && !mainImageUrl" class="main-project__main-image main-project__main-image--empty">
                No image
              </div>

              <iframe
                v-if="project.modelId && !editMode"
                ref="iframeRef"
                :title="`Sketchfab Model - ${project.title[lang]}`"
                class="main-project__embed"
                :class="{ 'main-project__embed--hidden': !showSketchfab || isLoading }"
              ></iframe>

              <ReplaceImageButton v-if="editMode" @click="isWireframe ? onReplaceWireframeImage() : onReplaceMainImage()" />

              <button
                v-if="!editMode"
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
            <EditableText
              tag="p"
              class="main-project__description"
              :value="project.description[lang]"
              :multiline="true"
              placeholder="Project description..."
              @save="onDescriptionSave"
            />

            <!--Sketchfab model id - admin-only field, hidden in view mode-->
            <div v-if="editMode" class="main-project__model-id">
              <span class="main-project__model-id-label">Sketchfab model ID</span>
              <EditableText
                tag="span"
                class="main-project__model-id-value"
                :value="project.modelId"
                placeholder="(empty = no embed)"
                @save="onModelIdSave"
              />
            </div>

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
                  <AnimatedCounter v-if="!editMode" :from="0" :to="item.value" :duration="2" />
                  <EditableText
                    v-else
                    tag="span"
                    class="main-project__stat-value"
                    :value="String(item.value)"
                    @save="(v) => onStatSave(item.key, v)"
                  />
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
  --thumbnail-gap:   var(--spacing-xxs);
  --thumbnail-count: 3;
  --project-height:         90vh;
  --project-header-height:  10vh;
  --project-content-height: 80vh;

  width: 100%;
  margin-bottom: var(--spacing-3xl);
  height: var(--project-height);
  overflow: hidden;
  padding-bottom: var(--spacing-lg);
  background: linear-gradient(to right, transparent, var(--color-background-secondary));
  position: relative;
}

.main-project__container {
  height: var(--project-height);
  position: relative;
}

.main-project__header {
  display: flex;
  align-items: center;
  height: var(--project-header-height);
  font-size: var(--font-size-lg);
  background: transparent;
  gap: var(--spacing-xs);
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

/*LAYOUT VARIANTS - each rearranges the same content (thumbnails + viewer-panel)
without changing the DOM. Thumbnails container takes its dimensions from the
parent flex direction.*/
.main-project--layout-thumbs-left  .main-project__content { display: flex; flex-direction: row; }
.main-project--layout-thumbs-right .main-project__content { display: flex; flex-direction: row-reverse; }

.main-project--layout-thumbs-bottom .main-project__content {
  display: flex;
  flex-direction: column-reverse;
}
.main-project--layout-thumbs-bottom .main-project__thumbnails {
  flex-direction: row;
  height: calc(var(--project-content-height) * 0.22);
  width: 100%;
}
.main-project--layout-thumbs-bottom .main-project__thumbnail {
  height: 100%;
  width: calc(33% - var(--thumbnail-gap));
}

.main-project--layout-viewer-only .main-project__content {
  display: flex;
  flex-direction: column;
}

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

/*LAYOUT PICKER - shown only in edit mode, sits inside the header next to the title*/
.main-project__layout-picker {
  display: inline-flex;
  align-items: center;
  gap: 0;
  margin-left: auto;
  padding: var(--spacing-xxs);
  background-color: var(--color-background-secondary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
}

.main-project__layout-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-2xl);
  height: var(--spacing-2xl);
  color: var(--color-text-tertiary);
  background-color: transparent;
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.main-project__layout-option:hover {
  color: var(--color-text-hover);
  background-color: var(--color-background-gray-100);
}

.main-project__layout-option--active {
  color: var(--color-accent);
  background-color: hsl(var(--primary) / 0.12);
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

.main-project__main-image--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background-gray-100);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.main-project__embed--hidden { display: none; }

.main-project__details { height: fit-content; }

.main-project__description {
  text-align: justify;
  margin: var(--spacing-xl) 0;
}

.main-project__model-id {
  display: flex;
  gap: var(--spacing-sm);
  align-items: baseline;
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: hsl(var(--background) / 0.4);
  border-left: var(--border-width-md) solid var(--color-accent);
  font-size: var(--font-size-xs);
}

.main-project__model-id-label {
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.main-project__model-id-value {
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  color: var(--color-text-hover);
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

.main-project__stat :deep(span),
.main-project__stat-value {
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
  height: fit-content;
  flex-grow: 1;
}

.main-project__software img { filter: brightness(0.8); }
.main-project__software a:hover img { filter: brightness(1); }
.main-project__software a:hover * { color: var(--color-text-hover); }

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
  color: hsl(var(--background));
}

.main-project__wireframe-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.main-project__wireframe-btn--active   { background-color: var(--color-accent); }

@media (max-width: 768px) {
  .main-project__header { font-size: var(--font-size-base); }
  .main-project__title {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }
  /*all layouts collapse to single column on mobile*/
  .main-project--layout-thumbs-left  .main-project__content,
  .main-project--layout-thumbs-right .main-project__content,
  .main-project--layout-thumbs-bottom .main-project__content,
  .main-project--layout-viewer-only  .main-project__content { flex-direction: column; }
  .main-project__panel { height: inherit; }
  .main-project__thumbnails { flex-direction: row; height: fit-content; }
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
  .main-project__software a { justify-content: center; width: 100%; }
  .main-project__stats {
    width: 100%;
    align-content: center;
    justify-content: space-around;
    margin-bottom: var(--spacing-md);
    flex-wrap: nowrap;
  }
  .main-project__stats-and-software { flex-direction: column; align-items: center; }
}

@media (max-width: 400px) {
  .main-project__software-name { display: none; }
}
</style>
