<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue"
import { Grid, PanelLeft, PanelRight, PanelBottom, Square, Plus, ExternalLink } from "lucide-vue-next"
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
      autostart:    1,
      preload:      1,
      //KILL every Sketchfab UI overlay - keep only the canvas. Cursor still
      //orbits/pans the model, but no toolbar, no help text, no watermark,
      //no fullscreen button, no settings, no annotations, no AR.
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
      //transparent background so the 3D model "floats" on the page bg
      //instead of sitting in a visible iframe rectangle
      transparent: 1,
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

//THUMBNAIL editing - the thumbnails column is stored as a jsonb array on the
//main_project row. Mutations replace the whole array via the same PUT route.
//Server expects {fileId, wireframeFileId, description}; the API GET also
//exposes resolved URLs which we strip before PUTting to keep the body tight.

function serializeThumbnails(items: { fileId: string | null; wireframeFileId: string | null; description: { en: string; fr: string } }[]): any[] {
  return items.map((t) => ({
    fileId:          t.fileId,
    wireframeFileId: t.wireframeFileId,
    description:     t.description,
  }))
}

async function addThumbnail() {
  const next = [...(props.project.thumbnails ?? []), {
    fileId:          null,
    wireframeFileId: null,
    description:     { en: "", fr: "" },
  }] as any
  await updateMainProject(props.project.id, { thumbnails: serializeThumbnails(next) })
}

async function removeThumbnail(idx: number) {
  const next = (props.project.thumbnails ?? []).filter((_, i) => i !== idx)
  await updateMainProject(props.project.id, { thumbnails: serializeThumbnails(next as any) })
}

async function replaceThumbnailImage(idx: number) {
  const file = await pickImageFile()
  if (!file) return
  try {
    const { id } = await uploadFile(file)
    const next = (props.project.thumbnails ?? []).map((t, i) => i === idx ? { ...t, fileId: id } : t)
    await updateMainProject(props.project.id, { thumbnails: serializeThumbnails(next as any) })
  } catch (e) { console.error("[MainProject] replace thumbnail failed:", e) }
}

async function replaceThumbnailWireframe(idx: number) {
  const file = await pickImageFile()
  if (!file) return
  try {
    const { id } = await uploadFile(file)
    const next = (props.project.thumbnails ?? []).map((t, i) => i === idx ? { ...t, wireframeFileId: id } : t)
    await updateMainProject(props.project.id, { thumbnails: serializeThumbnails(next as any) })
  } catch (e) { console.error("[MainProject] replace thumbnail wireframe failed:", e) }
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
    <article ref="containerRef" :class="['container', 'main-project__article', layoutClass]">
      <RemoveButton v-if="editMode" label="Delete project" @click="onDelete" />

      <!--Layout picker - absolute top-right of the article so overflow on the
      thumbnail strip never clips it. Admin only.-->
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

      <header class="main-project__header">
        <h3 class="main-project__number">{{ String(index + 1).padStart(2, "0") }}</h3>
        <EditableText
          tag="h3"
          class="main-project__title"
          :value="project.title[lang]"
          placeholder="Project title"
          @save="onTitleSave"
        />
      </header>

      <!--STAGE - viewer is the container; thumbnails sit absolutely positioned
      on top of it (right-edge column by default, switched per layout).-->
      <div class="main-project__stage">
        <div class="main-project__viewer">
          <img
            v-if="showMainImage && mainImageUrl"
            :src="(isWireframe ? wireframeImageUrl : mainImageUrl) ?? ''"
            :alt="project.title[lang]"
            class="main-project__viewer-image"
          />
          <div v-else-if="showMainImage && !mainImageUrl" class="main-project__viewer-empty">
            No image
          </div>

          <iframe
            v-if="project.modelId && !editMode"
            ref="iframeRef"
            :title="`Sketchfab Model - ${project.title[lang]}`"
            class="main-project__viewer-embed"
            :class="{ 'main-project__viewer-embed--hidden': !showSketchfab || isLoading }"
          ></iframe>

          <ReplaceImageButton v-if="editMode" @click="isWireframe ? onReplaceWireframeImage() : onReplaceMainImage()" />
        </div>

        <div v-if="showThumbnails" class="main-project__thumbnails">
          <div
            v-for="(thumb, i) in project.thumbnails"
            :key="i"
            class="main-project__thumbnail"
          >
            <img v-if="thumbSrc(thumb)" :src="thumbSrc(thumb)" :alt="thumb.description?.[lang] ?? ''" />
            <div v-else class="main-project__thumbnail-empty">No image</div>
            <RemoveButton v-if="editMode" label="Remove thumbnail" @click="removeThumbnail(i)" />
            <ReplaceImageButton v-if="editMode" @click="isWireframe ? replaceThumbnailWireframe(i) : replaceThumbnailImage(i)" />
          </div>

          <button
            v-if="editMode"
            type="button"
            class="main-project__thumbnail-add"
            aria-label="Add thumbnail"
            @click="addThumbnail"
          >
            <Plus :size="20" />
          </button>
        </div>

        <!--Wireframe toggle - tucked at the bottom-LEFT of the stage so it
        doesn't collide with the thumbnail column on the right. Only visible
        in view mode and when the Sketchfab viewer is loaded.-->
        <button
          v-if="!editMode"
          type="button"
          class="main-project__wireframe-btn"
          :class="{ 'main-project__wireframe-btn--active': isWireframe }"
          :disabled="!sketchfabLoaded"
          aria-label="Toggle wireframe"
          @click="toggleWireframe"
        >
          <Grid :size="16" />
        </button>

        <!--Sketchfab link - top-right, accent color. Opens the model page on
        sketchfab.com in a new tab so visitors can inspect / fork / download.-->
        <a
          v-if="!editMode && project.modelId"
          class="main-project__sketchfab-link"
          :href="`https://sketchfab.com/models/${project.modelId}`"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open on Sketchfab"
        >
          <ExternalLink :size="14" />
          <span>Sketchfab</span>
        </a>
      </div>

      <!--DETAILS - description, optional Sketchfab id, stats + software meta row-->
      <div class="main-project__details">
        <EditableText
          tag="p"
          class="main-project__description"
          :value="project.description[lang]"
          :multiline="true"
          placeholder="Project description..."
          @save="onDescriptionSave"
        />

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

        <div class="main-project__meta">
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
            <a
              v-for="(sw, idx) in project.software"
              :key="idx"
              :href="sw.url"
              target="_blank"
              rel="noopener noreferrer"
              class="main-project__software"
            >
              <img v-if="sw.logoUrl" :src="sw.logoUrl" :alt="sw.key" width="20" height="20" />
              <span class="main-project__software-name">{{ sw.key }}</span>
            </a>
          </div>
        </div>
      </div>
    </article>
  </AnimatedReveal>
</template>

<style scoped>
/*MAIN PROJECT - clean editorial layout, 4 body variants
================================================================================
The article stacks vertically: header > body > description > meta. Only the
BODY varies per layout (viewer + thumbnails arrangement). Everything below
the body is always full-width single-column - no sidebars, no empty zones.

  - Consistent 16/9 viewer aspect across all layouts (rhythm via arrangement,
    not aspect math).
  - Square thumbnails everywhere.
  - Description always full-width with a max-content cap for readability.
  - Meta row: stats LEFT + software RIGHT in a single flex line.

Layout picker pins top-right of the article (absolute), never clips.
*/

.main-project {
  --thumb-aspect:  1;
  --viewer-aspect: 16 / 9;
  --thumb-strip:   16%;     /*width of the side thumbnail column*/
  --content-max:   62ch;
  position: relative;
  width: 100%;
  margin-bottom: var(--spacing-6xl);
  padding: var(--spacing-3xl) 0;
}

.main-project__article {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xl);
}

/*HEADER - watermark number + bold title -----------------------------------*/
.main-project__header {
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-lg);
  padding-bottom: var(--spacing-md);
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
}

.main-project__number {
  font-size: clamp(3rem, 8vw, 6rem);
  font-weight: 900;
  line-height: 1;
  color: transparent;
  -webkit-text-stroke: var(--border-width-md) var(--color-gray-medium);
  letter-spacing: -0.02em;
  flex-shrink: 0;
}

.main-project__title {
  font-size: clamp(1.5rem, 3vw, var(--font-size-2xl));
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tight);
  line-height: 1.1;
  padding-bottom: 0.4em;
}

/*LAYOUT PICKER - absolute top-right of article, never clipped --------------*/
.main-project__layout-picker {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  padding: var(--spacing-xxs);
  background-color: var(--color-background-secondary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
}

.main-project__layout-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-xl);
  height: var(--spacing-xl);
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

/*STAGE - one positioned container that holds the viewer (no frame, transparent
background) and the thumbnail column as absolute overlays on top. Layout
variants only switch where the thumbnail column sits.*/
.main-project__stage {
  position: relative;
  aspect-ratio: var(--viewer-aspect);
  width: 100%;
}

/*VIEWER - fills the entire stage with NO background, NO border. The Sketchfab
iframe gets a transparent BG via the API so the 3D model literally floats on
the page; same idea for the static image fallback.*/
.main-project__viewer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: transparent;
}

.main-project__viewer-image,
.main-project__viewer-embed {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border: none;
  background: transparent;
}

.main-project__viewer-embed--hidden { display: none; }

.main-project__viewer-empty {
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

/*Sketchfab wireframe toggle - bottom-LEFT corner of the stage, opposite from
the thumbnail column on the right. Keeps it visible without colliding.*/
.main-project__wireframe-btn {
  position: absolute;
  bottom: var(--spacing-md);
  left:   var(--spacing-md);
  width:  var(--spacing-2xl);
  height: var(--spacing-2xl);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-text-secondary);
  border-radius: var(--border-radius-full);
  color: var(--color-text-hover);
  cursor: pointer;
  z-index: 15;
  backdrop-filter: blur(var(--filter-blur));
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.main-project__wireframe-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.main-project__wireframe-btn--active  { background-color: var(--color-accent); border-color: var(--color-accent); color: hsl(0 0% 0%); }

/*Sketchfab external-link button - top-right of the stage, accent-coloured*/
.main-project__sketchfab-link {
  position: absolute;
  top:   var(--spacing-md);
  right: var(--spacing-md);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-accent);
  color: var(--color-accent);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  text-decoration: none;
  backdrop-filter: blur(var(--filter-blur));
  z-index: 15;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.main-project__sketchfab-link:hover {
  background-color: var(--color-accent);
  color: hsl(0 0% 0%);
}

/*THUMBNAILS - absolute overlay ON TOP of the viewer. Default position:
right-edge column, vertically centered. Layout variants reposition the
column (left edge, bottom row, hidden entirely).*/
.main-project__thumbnails {
  position: absolute;
  top: 50%;
  right: var(--spacing-md);
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  z-index: 10;
  max-height: calc(100% - var(--spacing-xl) * 2);
  width: calc(var(--thumb-strip) - var(--spacing-md));
}

.main-project__thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: var(--thumb-aspect);
  overflow: hidden;
  /*no border - thumbnails sit raw on top of the viewer*/
}

/*LAYOUT VARIANTS - the stage stays the same, only the thumbnails reposition*/
.main-project--layout-thumbs-right .main-project__thumbnails {
  right: var(--spacing-md);
  left: auto;
  flex-direction: column;
}

.main-project--layout-thumbs-left .main-project__thumbnails {
  left: var(--spacing-md);
  right: auto;
  flex-direction: column;
}

.main-project--layout-thumbs-bottom .main-project__thumbnails {
  top: auto;
  bottom: var(--spacing-md);
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  flex-direction: row;
  width: auto;
  max-width: calc(100% - var(--spacing-xl) * 2);
  max-height: none;
  height: calc(var(--spacing-6xl) + var(--spacing-md));
}
.main-project--layout-thumbs-bottom .main-project__thumbnail,
.main-project--layout-thumbs-bottom .main-project__thumbnail-add {
  width: auto;
  height: 100%;
  aspect-ratio: var(--thumb-aspect);
}

.main-project--layout-viewer-only .main-project__thumbnails {
  display: none;
}

.main-project__thumbnail img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.main-project__thumbnail-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background-gray-100);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.main-project__thumbnail-add {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: var(--thumb-aspect);
  background-color: hsl(0 0% 0% / 0.5);
  backdrop-filter: blur(var(--filter-blur));
  border: var(--border-width-md) dashed var(--color-text-hover);
  color: var(--color-text-hover);
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}

.main-project__thumbnail-add:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  background-color: hsl(var(--primary) / 0.15);
}

/*DETAILS - single column stack. Description first (max-width capped for
readability), then optional model-id, then a full-width meta row.*/
.main-project__details {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding-top: var(--spacing-md);
}

.main-project__description {
  line-height: 1.75;
  font-size: var(--font-size-base);
  color: var(--color-text);
  max-width: var(--content-max);
}

.main-project__model-id {
  display: flex;
  gap: var(--spacing-sm);
  align-items: baseline;
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: hsl(var(--background) / 0.4);
  border-left: var(--border-width-md) solid var(--color-accent);
  font-size: var(--font-size-xs);
  align-self: flex-start;
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

/*META row - stats LEFT, software list RIGHT. Hairline separator above
mirrors the article-header hairline, framing the project visually.*/
.main-project__meta {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--spacing-2xl);
  flex-wrap: wrap;
  padding-top: var(--spacing-lg);
  border-top: var(--border-width-sm) solid var(--color-gray-medium);
}

/*STATS - horizontal row of stat columns ----------------------------------*/
.main-project__stats {
  display: flex;
  gap: var(--spacing-2xl);
  flex-wrap: wrap;
}

.main-project__stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-xxs);
}

.main-project__stat-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.main-project__stat :deep(span),
.main-project__stat-value {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-hover);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

/*SOFTWARE LIST - inline pills, right side of the meta row ----------------*/
.main-project__software-list {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  align-items: center;
}

.main-project__software {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: transparent;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-normal);
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.main-project__software:hover {
  border-color: var(--color-accent);
  color: var(--color-text-hover);
}

.main-project__software img { filter: brightness(0.8); transition: filter 0.2s ease; }
.main-project__software:hover img { filter: brightness(1); }

/*RESPONSIVE - mobile keeps the same stage approach. Thumbnails shrink to
fit the side column or move to a horizontal row at the bottom.*/
@media (max-width: 900px) {
  .main-project { padding: var(--spacing-xl) 0; margin-bottom: var(--spacing-5xl); }
  .main-project__stage { aspect-ratio: 4 / 5; }

  .main-project--layout-thumbs-left  .main-project__thumbnails,
  .main-project--layout-thumbs-right .main-project__thumbnails {
    top: auto;
    bottom: var(--spacing-md);
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    flex-direction: row;
    width: auto;
    max-width: calc(100% - var(--spacing-xl) * 2);
    max-height: none;
    height: var(--spacing-5xl);
  }

  .main-project--layout-thumbs-left  .main-project__thumbnail,
  .main-project--layout-thumbs-right .main-project__thumbnail,
  .main-project--layout-thumbs-bottom .main-project__thumbnail,
  .main-project--layout-thumbs-left  .main-project__thumbnail-add,
  .main-project--layout-thumbs-right .main-project__thumbnail-add,
  .main-project--layout-thumbs-bottom .main-project__thumbnail-add {
    width: auto;
    height: 100%;
    aspect-ratio: var(--thumb-aspect);
  }

  .main-project__layout-picker {
    position: static;
    margin-left: auto;
    align-self: flex-end;
  }
  .main-project__header { flex-wrap: wrap; align-items: baseline; }
}

@media (max-width: 600px) {
  .main-project__meta {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-lg);
  }
  .main-project__software-name { display: none; }
}
</style>
