<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue"
import { Grid, PanelLeft, PanelRight, PanelBottom, Square, Plus, ExternalLink, Box, LayoutTemplate } from "lucide-vue-next"
import { useRouter } from "vue-router"
import { useLanguage } from "../../composables/useLanguage"
import { useAdmin } from "../../composables/useAdmin"
import { useEffectiveViewerSettings, useResolvedGlbUrl } from "../../composables/useEffectiveViewerSettings"
import ModelPicker from "./ModelPicker.vue"
import { useInView } from "../../composables/useInView"
import { useLightbox } from "../../composables/useLightbox"
import { usePortfolio } from "../../composables/usePortfolio"
import { useSketchfabViewer } from "../../composables/useSketchfabViewer"
import { useWireframeSweep } from "../../composables/useWireframeSweep"
import { statLetter, statName } from "../../lib/portfolio-utils"
import AnimatedReveal from "./AnimatedReveal.vue"
import AnimatedCounter from "./AnimatedCounter.vue"
import EditableText from "./EditableText.vue"
import RemoveButton from "./RemoveButton.vue"
import ReplaceImageButton from "./ReplaceImageButton.vue"
import ThreeViewer from "./ThreeViewer.vue"
import { MAIN_PROJECT_LAYOUTS, type MainProjectDto, type MainProjectLayout } from "../../types/portfolio"

const props = defineProps<{
  project: MainProjectDto
  index:   number
}>()

const { lang } = useLanguage()
const { editMode } = useAdmin()
const { data: portfolioData, replaceImage, updateMainProject, deleteMainProject, setMainProjectSoftware } = usePortfolio()

//Merge per-project viewerSettings with the admin's GLOBAL editor prefs.
//Logic shared with MainProjectPhone via the composable.
const effectiveViewerSettings = useEffectiveViewerSettings(toRef(props, "project"), portfolioData)
const resolvedGlbUrl          = useResolvedGlbUrl(toRef(props, "project"), portfolioData)

//ModelPicker v-model - reads project.model3dId / desktop+mobile view
//names and writes them back via updateMainProject so the change
//persists immediately.
const modelPickerValue = computed(() => ({
  model3dId:   props.project.model3dId,
  desktopView: props.project.model3dDesktopView,
  mobileView:  props.project.model3dMobileView,
}))
async function onModelPickerChange(v: { model3dId: string | null; desktopView: string; mobileView: string }) {
  await updateMainProject(props.project.id, {
    model3dId:          v.model3dId,
    model3dDesktopView: v.desktopView,
    model3dMobileView:  v.mobileView,
  })
}
const router = useRouter()

function openModelEditor() {
  //The 3D editor now operates on model_3d rows, not projects. We need
  //a model attached before we can jump in.
  if (!props.project.model3dId) return
  router.push(`/edit-3d/${props.project.model3dId}`)
}
//Single button for both view + edit - the detail page route shows the
//editor UI automatically when editMode is on, view otherwise.
function openDetailPage() {
  router.push(`/project/${props.project.id}`)
}

//Software catalog for the edit-mode picker - read from the same shared
//portfolio fetch so /api/portfolio's `software` array drives the choices.
const allSoftware = computed(() => portfolioData.value?.software ?? [])
const selectedSoftwareIds = computed(() => new Set(props.project.software.map((s) => s.id)))

async function toggleSoftware(softwareId: number) {
  const nextIds = props.project.software.map((s) => s.id)
  const idx = nextIds.indexOf(softwareId)
  if (idx >= 0) nextIds.splice(idx, 1)
  else          nextIds.push(softwareId)
  await setMainProjectSoftware(props.project.id, nextIds)
}

const containerRef = ref<HTMLElement | null>(null)
useWireframeSweep(containerRef)
const iframeRef    = ref<HTMLIFrameElement | null>(null)

const { inView: isInView } = useInView(containerRef, { threshold: 0.3, rootMargin: "0px 0px 200px 0px" })
const isWireframe = ref(false)

//FALLBACK PREVIEW - the public stage picks its surface automatically:
//Three.js when a model is attached, else the Sketchfab embed, else the
//flat image. Edit mode shows the flat image by default (replace buttons
//need it) and this switcher lets the admin FORCE a stage to check what
//each fallback actually looks like without leaving edit mode.
type ViewerPreview = "edit" | "three" | "sketchfab" | "image"
const viewerPreview = ref<ViewerPreview>("edit")
watch(editMode, () => { viewerPreview.value = "edit" })

//The surface currently occupying the stage.
const activeSurface = computed<"three" | "sketchfab" | "image">(() => {
  if (editMode.value) {
    if (viewerPreview.value === "three"     && resolvedGlbUrl.value)  return "three"
    if (viewerPreview.value === "sketchfab" && props.project.modelId) return "sketchfab"
    return "image"
  }
  if (resolvedGlbUrl.value) return "three"
  if (props.project.modelId && !sketchfabError.value) return "sketchfab"
  return "image"
})

//Sketchfab lifecycle is owned by the shared composable - same flow lives
//in MainProjectPhone, so the behaviour stays identical between layouts.
//The composable's editMode input really means "iframe is v-if'd out";
//with the preview switcher the iframe exists whenever the sketchfab
//surface is active, so that's the signal we hand it.
const sketchfabSuspended = computed(() => activeSurface.value !== "sketchfab")
const sketchfab = useSketchfabViewer({
  iframeRef,
  modelId:  toRef(() => props.project.modelId),
  isInView,
  editMode: sketchfabSuspended,
  logTag:   "MainProject",
})
const sketchfabError = sketchfab.error
const isLoading      = sketchfab.isLoading

const mainImageUrl = computed(() => props.project.mainImageUrl)

//Used to decide whether to render the wireframe button. We show it when
//ANY of these has a wireframe variant available:
//- the 3D viewer (we always have one when a .glb is uploaded - the
//  ThreeViewer carries its own wireframe-mode rig from the editor)
//- the main image
//- at least one thumbnail
//Without a .glb and without any wireframe image variants, the button
//would be a no-op so we hide it.
const hasAnyWireframeImage = computed(() => {
  if (resolvedGlbUrl.value) return true
  if (props.project.mainWireframeUrl) return true
  return props.project.thumbnails.some((t) => t.wireframeUrl)
})
const layoutClass       = computed(() => `main-project--layout-${props.project.layout}`)
//ICON used for each layout choice in the picker (visually communicates the arrangement)
const LAYOUT_ICONS: Record<MainProjectLayout, typeof PanelLeft> = {
  "thumbs-left":   PanelLeft,
  "thumbs-right":  PanelRight,
  "thumbs-bottom": PanelBottom,
  "viewer-only":   Square,
}

const showThumbnails = computed(() => props.project.layout !== "viewer-only")

//LIGHTBOX - opening a clicked image presents the project's main + thumbs
//as an infinite horizontal carousel. Wireframe variant is picked based
//on the current isWireframe toggle so the lightbox matches the page state.
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

//Thumbnails map to lightbox slots by URL, not by position - lightboxImages
//skips the main image when missing and skips url-less thumbs, so i+1 would
//open the wrong image. The url is guaranteed present in the array because
//it's built from the same thumbnails with the same wireframe resolution.
function onThumbnailClick(thumb: { url: string | null; wireframeUrl: string | null }) {
  if (editMode.value || !thumb.url) return
  const url = isWireframe.value ? thumb.wireframeUrl ?? thumb.url : thumb.url
  openLightbox(lightboxImages.value, lightboxImages.value.findIndex((img) => img.url === url))
}

const showSketchfab = computed(() => Boolean(props.project.modelId && !sketchfabError.value && isInView.value && activeSurface.value === "sketchfab"))
//The flat image doubles as the Sketchfab poster while the embed loads.
const showImageLayer = computed(() =>
  activeSurface.value === "image"
  || (activeSurface.value === "sketchfab" && (!showSketchfab.value || isLoading.value)))

//Wireframe state is local to this layout - the composable doesn't own it.
watch(editMode, (newVal) => { if (newVal === false) isWireframe.value = false })

//Wireframe button only swaps the still-image sources (main image +
//thumbnails) to their `wireframeUrl` variants. It does NOT touch the
//Sketchfab viewer (no setWireframe, no material override, no light
//override) and it does NOT touch the local Three.js viewer either -
//the ThreeViewer has its own wireframe button for the 3D model itself.
function toggleWireframe(e: Event) {
  e.preventDefault()
  isWireframe.value = !isWireframe.value
}

const statRows = computed(() => [
  { key: "vertices"  as const, value: props.project.stats.vertices  ?? 0 },
  { key: "edges"     as const, value: props.project.stats.edges     ?? 0 },
  { key: "faces"     as const, value: props.project.stats.faces     ?? 0 },
  { key: "triangles" as const, value: props.project.stats.triangles ?? 0 },
])


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

async function onStatSave(key: "vertices" | "edges" | "faces" | "triangles", val: string) {
  const n = parseInt(val.replace(/[^\d-]/g, ""), 10)
  if (Number.isNaN(n)) return
  await updateMainProject(props.project.id, {
    stats: { ...props.project.stats, [key]: n },
  })
}

function onReplaceMainImage() {
  return replaceImage("main image", async (id) => {
    await updateMainProject(props.project.id, { mainImageFileId: id })
  })
}

function onReplaceWireframeImage() {
  return replaceImage("wireframe image", async (id) => {
    await updateMainProject(props.project.id, { mainWireframeFileId: id })
  })
}

async function onDelete() {
  await deleteMainProject(props.project.id)
}

//THUMBNAIL editing - the thumbnails column is stored as a jsonb array on the
//main_project row. Mutations replace the whole array via the same PUT route.
//Server expects {fileId, wireframeFileId, description}; the API GET also
//exposes resolved URLs which we strip before PUTting to keep the body tight.

type ThumbnailPatch = { fileId: string | null; wireframeFileId: string | null; description: { en: string; fr: string } }

function serializeThumbnails(items: ThumbnailPatch[]): ThumbnailPatch[] {
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
  }]
  await updateMainProject(props.project.id, { thumbnails: serializeThumbnails(next) })
}

async function removeThumbnail(idx: number) {
  const next = (props.project.thumbnails ?? []).filter((_, i) => i !== idx)
  await updateMainProject(props.project.id, { thumbnails: serializeThumbnails(next) })
}

function replaceThumbnailImage(idx: number) {
  return replaceImage("thumbnail image", async (id) => {
    const next = (props.project.thumbnails ?? []).map((t, i) => i === idx ? { ...t, fileId: id } : t)
    await updateMainProject(props.project.id, { thumbnails: serializeThumbnails(next) })
  })
}

function replaceThumbnailWireframe(idx: number) {
  return replaceImage("thumbnail wireframe", async (id) => {
    const next = (props.project.thumbnails ?? []).map((t, i) => i === idx ? { ...t, wireframeFileId: id } : t)
    await updateMainProject(props.project.id, { thumbnails: serializeThumbnails(next) })
  })
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
    <article ref="containerRef" :class="['container', 'main-project__article', layoutClass, { 'main-project__article--wireframe': isWireframe }]">
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
          <!--STAGE SURFACES - activeSurface picks exactly one: Three.js when
          a model is attached, else the Sketchfab embed, else the flat image.
          In edit mode the flat image wins by default and the preview
          switcher below forces a specific surface.-->
          <ThreeViewer
            v-if="activeSurface === 'three'"
            :glb-url="resolvedGlbUrl ?? ''"
            :settings="effectiveViewerSettings"
            :wireframe="isWireframe"
            :is-in-view="isInView"
            class="main-project__three"
          />

          <template v-if="showImageLayer && mainImageUrl">
            <img
              :src="mainImageUrl ?? ''"
              :alt="project.title[lang]"
              class="main-project__viewer-image"
              :class="{ 'main-project__viewer-image--clickable': !editMode }"
              @click="onImageClick(0)"
            />
            <img
              v-if="project.mainWireframeUrl"
              :src="project.mainWireframeUrl"
              :alt="''"
              aria-hidden="true"
              class="main-project__viewer-image main-project__wf-layer wf-layer"
            />
          </template>
          <div v-else-if="showImageLayer && !mainImageUrl" class="main-project__viewer-empty">
            No image
          </div>

          <iframe
            v-if="activeSurface === 'sketchfab'"
            ref="iframeRef"
            :title="`Sketchfab Model - ${project.title[lang]}`"
            class="main-project__viewer-embed"
            :class="{ 'main-project__viewer-embed--hidden': !showSketchfab || isLoading }"
          ></iframe>

          <ReplaceImageButton v-if="editMode && activeSurface === 'image'" @click="isWireframe ? onReplaceWireframeImage() : onReplaceMainImage()" />

          <!--OVERLAY ACTIONS - admin shortcuts + detail page link. Stacked
          vertically in a flex wrapper so they don't overlap (previously
          they shared a single absolute position and the second hid the
          first).-->
          <div class="main-project__overlay-actions">
            <!--FALLBACK PREVIEW - forces the stage onto one surface so the
            admin can check what each public fallback (3D -> Sketchfab ->
            image) looks like without leaving edit mode. "Edit" restores
            the editable flat image.-->
            <div v-if="editMode" class="main-project__preview-switch" role="group" aria-label="Preview surface">
              <button
                type="button"
                class="main-project__overlay-btn"
                :class="{ 'main-project__overlay-btn--active': viewerPreview === 'edit' }"
                title="Editable flat image (default)"
                @click="viewerPreview = 'edit'"
              >Edit</button>
              <button
                type="button"
                class="main-project__overlay-btn"
                :class="{ 'main-project__overlay-btn--active': viewerPreview === 'three' }"
                :disabled="!resolvedGlbUrl"
                :title="resolvedGlbUrl ? 'Preview the Three.js viewer' : 'No 3D model attached'"
                @click="viewerPreview = 'three'"
              >3D</button>
              <button
                type="button"
                class="main-project__overlay-btn"
                :class="{ 'main-project__overlay-btn--active': viewerPreview === 'sketchfab' }"
                :disabled="!project.modelId"
                :title="project.modelId ? 'Preview the Sketchfab embed fallback' : 'No Sketchfab model id set'"
                @click="viewerPreview = 'sketchfab'"
              >Sketchfab</button>
              <button
                type="button"
                class="main-project__overlay-btn"
                :class="{ 'main-project__overlay-btn--active': viewerPreview === 'image' }"
                title="Preview the flat image fallback"
                @click="viewerPreview = 'image'"
              >Image</button>
            </div>
            <!--MODEL PICKER - in edit mode only. Lets the admin assign
            which model + which views (desktop / mobile) this project
            renders. Selection writes through updateMainProject so the
            viewer reloads immediately after pick.-->
            <ModelPicker
              v-if="editMode"
              :model-value="modelPickerValue"
              @update:model-value="onModelPickerChange"
            />
            <!--EDIT 3D - admin-only shortcut to the model editor page-->
            <button
              v-if="editMode && project.model3dId"
              type="button"
              class="main-project__overlay-btn"
              title="Edit the attached 3D model"
              @click="openModelEditor"
            >
              <Box :size="14" />
              <span>Edit 3D</span>
            </button>
            <!--PROJECT DETAIL PAGE - one button for both modes. The page
            itself reads useAdmin().editMode and swaps to the bento-grid
            editor when the admin has Edit Content on.-->
            <button
              type="button"
              class="main-project__overlay-btn"
              :title="editMode ? 'Edit the project detail page' : 'Open the project detail page'"
              @click="openDetailPage"
            >
              <LayoutTemplate :size="14" />
              <span>{{ editMode ? "Edit page" : "View page" }}</span>
            </button>
          </div>
        </div>

        <div v-if="showThumbnails" class="main-project__thumbnails">
          <div
            v-for="(thumb, i) in project.thumbnails"
            :key="i"
            class="main-project__thumbnail"
            :class="{ 'main-project__thumbnail--clickable': !editMode && thumb.url }"
            @click="onThumbnailClick(thumb)"
          >
            <img v-if="thumb.url" :src="thumb.url" :alt="thumb.description?.[lang] ?? ''" />
            <div v-else class="main-project__thumbnail-empty">No image</div>
            <img
              v-if="thumb.wireframeUrl"
              :src="thumb.wireframeUrl"
              :alt="''"
              aria-hidden="true"
              class="main-project__wf-layer wf-layer"
            />
            <RemoveButton v-if="editMode" label="Remove thumbnail" @click.stop="removeThumbnail(i)" />
            <ReplaceImageButton v-if="editMode" @click.stop="isWireframe ? replaceThumbnailWireframe(i) : replaceThumbnailImage(i)" />
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

        <!--Viewer-corner cluster: wireframe toggle + sketchfab link sit
        as a single flex row in the bottom-right of the stage so the two
        affordances read as a unit. Wireframe flips images + 3D mode; the
        Sketchfab icon opens the model page on sketchfab.com.-->
        <div
          v-if="hasAnyWireframeImage || (!editMode && project.modelId)"
          class="main-project__viewer-actions"
        >
          <button
            v-if="hasAnyWireframeImage"
            type="button"
            class="main-project__wireframe-btn"
            :class="{ 'main-project__wireframe-btn--active': isWireframe }"
            @click="toggleWireframe"
          >
            <Grid :size="14" />
            <span>Wireframe</span>
          </button>

          <a
            v-if="!editMode && project.modelId"
            class="main-project__sketchfab-link"
            :href="`https://sketchfab.com/models/${project.modelId}`"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open on Sketchfab"
            title="Open on Sketchfab"
          >
            <ExternalLink :size="14" />
          </a>
        </div>
      </div>

      <!--DETAILS - 2-col grid: description LEFT (wide), stats sidebar RIGHT.
      The software list and optional model-id sit below as a full-width row
      so the project frame stays balanced regardless of stats column height.-->
      <div class="main-project__details">
        <!--Admin-only Sketchfab model id - moved ABOVE the separator so
        it sits with the other authoring fields. Red tint marks it as
        "invisible in view mode" so the admin knows it's edit-only.-->
        <div v-if="editMode" class="main-project__model-id main-project__model-id--admin-only">
          <span class="main-project__model-id-label">Sketchfab model ID</span>
          <EditableText
            tag="span"
            class="main-project__model-id-value"
            :value="project.modelId"
            placeholder="(empty = no embed)"
            @save="onModelIdSave"
          />
        </div>
        <div class="main-project__details-top">
          <EditableText
            tag="p"
            class="main-project__description"
            :value="project.description[lang]"
            :multiline="true"
            placeholder="Project description..."
            @save="onDescriptionSave"
          />

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
              <span
                class="main-project__stat-icon"
                :title="statName(item.key, lang)"
                :aria-label="statName(item.key, lang)"
              >{{ statLetter(item.key, lang) }}</span>
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
        </div>

        <!--SOFTWARE - moved ABOVE the separator so the badges sit visually
        attached to the description block. View mode renders only the
        attached entries as link pills. Edit mode renders the FULL catalog
        as toggleable pills so the admin can add or remove by clicking.
        Empty catalog hints at the Settings page.-->
        <div v-if="!editMode" class="main-project__software-list">
          <a
            v-for="sw in project.software"
            :key="sw.id"
            :href="sw.url"
            target="_blank"
            rel="noopener noreferrer"
            class="main-project__software"
          >
            <img v-if="sw.logoUrl" :src="sw.logoUrl" :alt="sw.key" width="20" height="20" />
            <span class="main-project__software-name">{{ sw.key }}</span>
          </a>
        </div>

        <div v-else class="main-project__software-list main-project__software-list--edit">
          <button
            v-for="sw in allSoftware"
            :key="sw.id"
            type="button"
            class="main-project__software"
            :class="{ 'main-project__software--active': selectedSoftwareIds.has(sw.id) }"
            :title="sw.key"
            @click="toggleSoftware(sw.id)"
          >
            <img v-if="sw.logoUrl" :src="sw.logoUrl" :alt="sw.key" width="20" height="20" />
            <span class="main-project__software-name">{{ sw.key }}</span>
          </button>
          <span v-if="!allSoftware.length" class="main-project__software-empty">
            No software in catalog. Add some in /settings.
          </span>
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
  --content-max: 62ch;
  position: relative;
  width: 100%;
  margin-bottom: var(--mp-margin-bottom);
  padding: var(--mp-padding-y) 0;
}

.main-project__article {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--mp-section-gap);
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
  font-family: sans-serif;
  font-size: var(--mp-number-size);
  font-weight: var(--font-weight-black);
  line-height: 1;
  color: transparent;
  -webkit-text-stroke: var(--border-width-md) var(--color-gray-medium);
  letter-spacing: -0.02em;
  flex-shrink: 0;
}

.main-project__title {
  font-size: var(--mp-title-size);
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
  aspect-ratio: var(--mp-viewer-aspect);
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
}

/*Static image fallback: same neutral fill as the stat badges so the empty
viewer reads as part of the same visual family instead of a transparent
hole in the layout. Resolved through --tag-bg so the side panel can retint
the empty-viewer + every badge in one knob.*/
.main-project__viewer-image {
  background-color: var(--tag-bg);
}

.main-project__viewer-embed {
  background: transparent;
}

.main-project__viewer-embed--hidden { display: none; }

/*Local Three.js viewer replaces the iframe when a .glb is uploaded.*/
.main-project__three {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
}

/*Overlay actions - wrapper that stacks "Edit 3D" and "Edit / View page"
vertically in the viewer's top-right corner. Each child button is just
styled in place; the wrapper owns the absolute positioning.*/
.main-project__overlay-actions {
  position: absolute;
  top:   var(--spacing-md);
  right: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  z-index: 20;
}
.main-project__overlay-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: hsl(0 0% 0% / 0.7);
  border: var(--border-width-sm) solid var(--color-accent);
  color: var(--color-accent);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  backdrop-filter: blur(var(--filter-blur));
  transition: background-color 0.15s ease, color 0.15s ease;
}
.main-project__overlay-btn:hover {
  background-color: var(--color-accent);
  color: hsl(0 0% 0%);
}
.main-project__overlay-btn--active {
  background-color: var(--color-accent);
  color: hsl(0 0% 0%);
}
.main-project__overlay-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.main-project__overlay-btn:disabled:hover {
  background-color: hsl(0 0% 0% / 0.7);
  color: var(--color-accent);
}

/*FALLBACK PREVIEW switch - one row of overlay pills in the overlay stack*/
.main-project__preview-switch {
  display: flex;
  gap: var(--spacing-xxs);
  justify-content: flex-end;
}

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

/*Sketchfab wireframe toggle - bottom-LEFT corner of the stage, mirrors the
shape and metrics of .main-project__sketchfab-link on the top-right so the
two floating controls feel like a matched pair.*/
/*Viewer-corner action cluster: bottom-right of the stage, holds the
wireframe toggle + sketchfab link as a horizontal pair.*/
.main-project__viewer-actions {
  position: absolute;
  bottom: var(--spacing-md);
  right:  var(--spacing-md);
  display: inline-flex;
  align-items: stretch;
  gap: var(--spacing-xs);
  z-index: 15;
}

.main-project__wireframe-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-text-secondary);
  color: var(--color-text-hover);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  backdrop-filter: blur(var(--filter-blur));
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.main-project__wireframe-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.main-project__wireframe-btn--active  { background-color: var(--color-accent); border-color: var(--color-accent); color: hsl(0 0% 0%); }

/*Sketchfab icon link - square button next to the wireframe toggle.
Same height as the wireframe button (align-items:stretch on the cluster
makes both buttons share the wireframe's intrinsic height).*/
.main-project__sketchfab-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  padding: 0 var(--spacing-xs);
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-accent);
  color: var(--color-accent);
  text-decoration: none;
  backdrop-filter: blur(var(--filter-blur));
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
  gap: var(--mp-thumb-gap);
  z-index: 10;
  max-height: calc(100% - var(--spacing-xl) * 2);
  width: calc(var(--mp-thumb-strip-width) - var(--spacing-md));
}

.main-project__viewer-image--clickable,
.main-project__thumbnail--clickable { cursor: zoom-in; }

/*=== WIREFRAME OVERLAY - shared diagonal sweep ========================
ONE single diagonal line sweeps across the whole card, passing through
every wireframe layer in lockstep. Driven by @property --wipe (0..1) on
the article root, which is smoothly transitioned by CSS. Each .wf-layer
carries --my-x/--my-y/--my-w/--my-h (offsets + size relative to the
article) written by useWireframeSweep; the article exposes --card-w
and --card-h. Each layer computes its own pixel threshold:
  t = (card_w + card_h) * wipe - my_x - my_y
and clip-paths a right-triangle (0,0), (t,0), (0,t) expressed in its
own coordinate space. As `wipe` grows, every layer's hypotenuse aligns
into one continuous diagonal walking across the card.*/
@property --wipe {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}

.main-project__article {
  --wipe: 0;
  transition: --wipe 1400ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.main-project__article--wireframe { --wipe: 1; }

.main-project__wf-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: inherit;
  pointer-events: none;
  --t: calc(
    (var(--card-w, 1) + var(--card-h, 1)) * var(--wipe)
    - var(--my-x, 0) - var(--my-y, 0)
  );
  clip-path: polygon(
    0% 0%,
    calc(var(--t, 0) * 100% / var(--my-w, 1)) 0%,
    0% calc(var(--t, 0) * 100% / var(--my-h, 1))
  );
}
img.main-project__wf-layer { object-fit: cover; }
img.main-project__viewer-image.main-project__wf-layer { object-fit: contain; }

.main-project__thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: var(--mp-thumb-aspect);
  overflow: hidden;
  /*no border - thumbnails sit raw on top of the viewer. Independent knob
  --mp-thumb-bg lets the admin retint the strip without touching the stat
  badges (--tag-bg).*/
  background-color: var(--mp-thumb-bg);
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
  aspect-ratio: var(--mp-thumb-aspect);
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
  background-color: var(--mp-thumb-bg);
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
  aspect-ratio: var(--mp-thumb-aspect);
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

/*DETAILS - 2-col top row (description + stats sidebar), then optional
model-id, then a full-width software row. The top row uses CSS grid so the
description gets the bulk of the width and the stats column sits flush to
the right without forcing the description to wrap mid-paragraph.*/
.main-project__details {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding-top: var(--spacing-md);
}

.main-project__details-top {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--mp-details-gap);
  align-items: start;
}

.main-project__description {
  line-height: var(--mp-description-lh);
  font-size: var(--mp-description-size);
  color: var(--color-text);
  min-width: 0;       /*prevents the description from forcing the grid to overflow*/
}

.main-project__model-id {
  display: flex;
  gap: var(--spacing-sm);
  align-items: baseline;
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: hsl(var(--background) / 0.4);
  font-size: var(--font-size-xs);
  align-self: flex-start;
}

/*ADMIN-ONLY field marker - red tint so the admin can tell at a glance
that this row doesn't appear to visitors (same hue as the wireframe
section in the model editor's Material card).*/
.main-project__model-id--admin-only {
  background-color: hsl(var(--destructive) / 0.08);
  border: var(--border-width-sm) solid hsl(var(--destructive) / 0.35);
}
.main-project__model-id--admin-only .main-project__model-id-label { color: hsl(var(--destructive)); }

.main-project__model-id-label {
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.main-project__model-id-value {
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  color: var(--color-text-hover);
}

/*STATS - vertical column sidebar in the details-top grid. Each row is a
letter badge + number on a single horizontal line so a quick glance shows
vert/edge/face counts.*/
.main-project__stats {
  display: flex;
  flex-direction: column;
  gap: var(--mp-stat-gap);
  min-width: 8rem;
}

.main-project__stat {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-sm);
}

/*Letter badge - shares the visual language of the gallery letters. Square,
filled with --tag-bg, mono font for the single character (V/E/F/T or the
French S/A/F/T). Title attribute carries the full name as a tooltip.*/
.main-project__stat-icon {
  display: grid;
  place-content: center;
  width:  var(--mp-stat-badge-size);
  height: var(--mp-stat-badge-size);
  background-color: var(--tag-bg);
  color: var(--color-text-hover);
  font-size: calc(var(--mp-stat-badge-size) * 0.5);
  font-weight: var(--font-weight-bold);
  font-family: sans-serif;
  letter-spacing: 0;
  /*line-height:0 collapses the line box so the glyph renders centered
  on the grid track instead of being offset by the line box's ascent/
  descent space - this is the trick that finally pins the capital
  letter to the visual center of the badge.*/
  line-height: 0;
  cursor: default;
  flex-shrink: 0;
}

/*EXCLUDE the badge: this rule was matching the .main-project__stat-icon
span and forcing min-width:5ch + text-align:right + display:inline-block
on it - that's what was breaking the centering of S/A/F/T.*/
.main-project__stat :deep(span:not(.main-project__stat-icon)),
.main-project__stat-value {
  font-size: var(--mp-stat-value-size);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-hover);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  /*Fixed width so the edit-mode dotted underline ends at the same place
  for every stat row (vertices / edges / faces / triangles), regardless
  of how long the value is.*/
  min-width: 5ch;
  display: inline-block;
  text-align: right;
}

/*SOFTWARE LIST - sits directly under the description block. The hairline
that used to live above the software now lives BELOW it so the badges
read as part of the description's meta strip and the separator marks the
end of the visible content (admin model-id row goes below the line).*/
.main-project__software-list {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  align-items: center;
  padding-bottom: var(--spacing-lg);
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
}

.main-project__software {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: transparent;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  color: var(--color-text-secondary);
  font-size: var(--mp-software-size);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-normal);
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.main-project__software:hover {
  border-color: var(--color-accent);
  color: var(--color-text-hover);
}

/*Edit-mode software list shows every catalog entry as a toggleable pill.
Unselected entries fade slightly so the active set reads at a glance.*/
.main-project__software-list--edit { gap: var(--spacing-sm); }

.main-project__software-list--edit .main-project__software {
  cursor: pointer;
  opacity: 0.45;
}

.main-project__software-list--edit .main-project__software--active {
  opacity: 1;
  border-color: var(--color-accent);
  color: var(--color-text-hover);
}

.main-project__software-empty {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-style: italic;
}

.main-project__software img { filter: brightness(0.8); transition: filter 0.2s ease; }
.main-project__software:hover img { filter: brightness(1); }

/*PHONE-ONLY description overlay - hidden on desktop. The phone media
query / simulate-phone block below flips display:block and positions it.*/

/*RESPONSIVE - desktop fallbacks stay until we hit phone width. The phone
breakpoint switches to the "quinconce" staggered layout: thumbnails +
description share ONE side, viewer takes the opposite side, and the desc
spills past the stage bottom into the next project.*/

/*=== PHONE QUINCONCE - shared rules + the @media + simulate-phone wrappers ==*/
/*The phone rules that used to close this file are gone: MainProjects.vue only
mounts MainProject in its v-else, so useIsPhone() is false whenever this
component exists. Neither the 480px media query nor html.simulate-phone could
ever match one. The phone layout lives in MainProjectPhone.vue.*/
</style>
