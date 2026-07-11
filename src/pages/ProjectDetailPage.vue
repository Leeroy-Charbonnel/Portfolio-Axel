<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Component } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
  ArrowLeft,
  Box,
  Columns2,
  Film,
  GalleryHorizontalEnd,
  Hash,
  Heading1,
  ImageIcon,
  Images,
  ListCollapse,
  MonitorPlay,
  MousePointerClick,
  Quote,
  Table,
  Trash2,
  Type,
} from "lucide-vue-next"
import { useLanguage } from "../composables/useLanguage"
import { useAdmin } from "../composables/useAdmin"
import { useAdminActions } from "../composables/useAdminActions"
import { usePortfolio } from "../composables/usePortfolio"
import { pickBilingual as pickBi } from "../lib/markdown"
import DetailBlockRenderer from "../components/portfolio/detail/DetailBlockRenderer.vue"
import TextEditor      from "../components/portfolio/detail/editors/TextEditor.vue"
import HeadingEditor   from "../components/portfolio/detail/editors/HeadingEditor.vue"
import QuoteEditor     from "../components/portfolio/detail/editors/QuoteEditor.vue"
import ImageEditor     from "../components/portfolio/detail/editors/ImageEditor.vue"
import VideoEditor     from "../components/portfolio/detail/editors/VideoEditor.vue"
import CarouselEditor  from "../components/portfolio/detail/editors/CarouselEditor.vue"
import MarqueeEditor   from "../components/portfolio/detail/editors/MarqueeEditor.vue"
import CompareEditor   from "../components/portfolio/detail/editors/CompareEditor.vue"
import AccordionEditor from "../components/portfolio/detail/editors/AccordionEditor.vue"
import SpecsEditor     from "../components/portfolio/detail/editors/SpecsEditor.vue"
import CountersEditor  from "../components/portfolio/detail/editors/CountersEditor.vue"
import ButtonEditor    from "../components/portfolio/detail/editors/ButtonEditor.vue"
import EmbedEditor     from "../components/portfolio/detail/editors/EmbedEditor.vue"
import Viewer3dEditor  from "../components/portfolio/detail/editors/Viewer3dEditor.vue"
import type {
  CarouselBlockContent,
  CompareBlockContent,
  DetailBlock,
  DetailBlockContent,
  DetailBlockType,
  DetailPage,
  ImageBlockContent,
  MainProjectDto,
  MarqueeBlockContent,
  TextBlockContent,
  VideoBlockContent,
  Viewer3dBlockContent,
} from "../types/portfolio"

//PROJECT DETAIL PAGE - public read-only render AND bento-grid editor on
//the same URL (/project/:id). useAdmin().editMode flips between view
//and edit. Both modes share a 3-column CSS Grid with fixed row height,
//so cell positions translate directly to (x, y, w, h) coords stored
//on each block.
//
//Edit interactions are HAND-ROLLED (no gridstack) because the library
//was opinionated about DOM ownership, eating drop events, and fighting
//Vue's reactivity. With CSS Grid + a tiny pointer-event state machine
//we get exact snap-to-cell behaviour in ~150 lines.
//
//Block rendering lives in detail/DetailBlockRenderer.vue (one file per
//block component); the side-panel editors live in detail/editors/ (one
//file per type, shared upload / bilingual-field / item-card code). This
//page only owns layout, drag state, undo, and the save round-trip.

const route  = useRoute()
const router = useRouter()
const { lang }   = useLanguage()
const { editMode } = useAdmin()
//All data flows through the shared portfolio cache - this page used to
//refetch /api/portfolio by hand, which bypassed (and desynced) the cache
//every other section reads.
const { data: portfolioData, loaded: portfolioLoaded, reload: reloadPortfolio, updateMainProject } = usePortfolio()

const projectId   = computed(() => parseInt(String(route.params.id ?? ""), 10))
const project     = ref<MainProjectDto | null>(null)
const loading     = ref(true)
const loadError   = ref<string | null>(null)
const saving      = ref(false)
const status      = ref("")

const projectTitle = computed(() => pickBi(project.value?.title, lang.value))
//Zero-padded position of this project in the portfolio order - the big
//brutalist index stamp next to the title.
const projectIndex = computed(() => {
  const list = portfolioData.value?.mainProjects ?? []
  const i = list.findIndex((p) => p.id === projectId.value)
  return i >= 0 ? String(i + 1).padStart(2, "0") : "--"
})

const blocks      = ref<DetailBlock[]>([])
const selectedId  = ref<string | null>(null)
const selectedBlock = computed(() => blocks.value.find((b) => b.id === selectedId.value) ?? null)

//BLOCK TYPE REGISTRY - one entry per addable type: panel button label +
//icon (also the phantom icon during create-drag) + its panel editor.
const BLOCK_TYPES: { type: DetailBlockType; label: string; icon: Component; editor: Component }[] = [
  { type: "text",      label: "Text",        icon: Type,                editor: TextEditor },
  { type: "heading",   label: "Heading",     icon: Heading1,            editor: HeadingEditor },
  { type: "quote",     label: "Quote",       icon: Quote,               editor: QuoteEditor },
  { type: "image",     label: "Image / GIF", icon: ImageIcon,           editor: ImageEditor },
  { type: "video",     label: "Video",       icon: Film,                editor: VideoEditor },
  { type: "carousel",  label: "Carousel",    icon: Images,              editor: CarouselEditor },
  { type: "marquee",   label: "Marquee",     icon: GalleryHorizontalEnd, editor: MarqueeEditor },
  { type: "compare",   label: "Compare",     icon: Columns2,            editor: CompareEditor },
  { type: "accordion", label: "Accordion",   icon: ListCollapse,        editor: AccordionEditor },
  { type: "specs",     label: "Specs",       icon: Table,               editor: SpecsEditor },
  { type: "counters",  label: "Counters",    icon: Hash,                editor: CountersEditor },
  { type: "button",    label: "Button",      icon: MousePointerClick,   editor: ButtonEditor },
  { type: "embed",     label: "Embed",       icon: MonitorPlay,         editor: EmbedEditor },
  { type: "viewer3d",  label: "3D Viewer",   icon: Box,                 editor: Viewer3dEditor },
]
function entryFor(type: DetailBlockType | undefined) {
  return BLOCK_TYPES.find((t) => t.type === type)
}

//INLINE TEXT EDIT - double-click a text block to swap its rendered
//markdown for a raw-source textarea. Blur / Escape commits and re-
//renders. We only edit the CURRENT language (lang); the other locale
//stays untouched and is editable from the side-panel textareas.
const editingId       = ref<string | null>(null)
const inlineTextareaRef = ref<HTMLTextAreaElement | null>(null)

function startInlineEdit(block: DetailBlock) {
  if (!editMode.value || block.type !== "text") return
  selectedId.value = block.id
  editingId.value  = block.id
  //Snapshot so the whole edit session is one undo step. Subsequent
  //keystrokes don't push more snapshots - native textarea undo
  //handles intra-session edits.
  snapshot()
  nextTick(() => { inlineTextareaRef.value?.focus() })
}
function stopInlineEdit() {
  editingId.value = null
}
function onInlineInput(e: Event, block: DetailBlock) {
  const v = (e.target as HTMLTextAreaElement).value
  const c = block.content as TextBlockContent
  if (!c.text) c.text = { en: "", fr: "" }
  c.text[lang.value] = v
  markDirty()
}
function onInlineKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault()
    ;(e.target as HTMLTextAreaElement).blur()
  }
}

const dirty = ref(false)
function markDirty() { dirty.value = true }

//===========================================================================
//UNDO STACK - snapshot the blocks array BEFORE every structural mutation
//(add, remove, move, resize, media swap, list reorder - editors emit
//"structural" right before those). Ctrl+Z pops the last snapshot. Text
//content edits are not snapshotted - the textarea's native undo handles
//them, and capturing every keystroke would drown the stack.
const undoStack = ref<DetailBlock[][]>([])
const UNDO_LIMIT = 100

function cloneBlocks(src: DetailBlock[]): DetailBlock[] {
  return src.map((b) => ({ ...b, content: JSON.parse(JSON.stringify(b.content)) }))
}
function snapshot() {
  undoStack.value.push(cloneBlocks(blocks.value))
  if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
}
function undo() {
  const prev = undoStack.value.pop()
  if (!prev) return
  blocks.value = prev
  if (selectedId.value && !prev.find((b) => b.id === selectedId.value)) {
    selectedId.value = null
  }
  markDirty()
}

//===========================================================================
//GRID DIMENSIONS - the source of truth for both rendering AND pointer
//hit-testing. Pixel coords from a pointer event are projected onto cell
//coords using the same formula CSS Grid uses internally.
const GRID_COLS = 3
const MIN_GHOST_ROWS = 12  //empty editor still shows a usable canvas

//Highest bottom row across all blocks, given a y / h projection. Used
//to size view-mode grid rows (desktop and mobile), the edit-mode ghost
//canvas, and to pick the next free Y for panel-click block appends.
function maxBottom(getY: (b: DetailBlock) => number, getH: (b: DetailBlock) => number): number {
  let max = 0
  for (const b of blocks.value) {
    const end = getY(b) + getH(b)
    if (end > max) max = end
  }
  return max
}
const desktopY = (b: DetailBlock) => b.y
const desktopH = (b: DetailBlock) => b.h

//MOBILE VIEW - blocks lay out in a single column. Per-block mobileY /
//mobileH override the desktop coords; when absent, fall back to desktop
//y / h so an unauthored project still renders.
function mobileY(b: DetailBlock): number { return b.mobileY ?? b.y }
function mobileH(b: DetailBlock): number { return b.mobileH ?? b.h }

const totalRows       = computed(() => Math.max(maxBottom(desktopY, desktopH), 1))
const totalMobileRows = computed(() => Math.max(maxBottom(mobileY,  mobileH ), 1))
const gridBgRows      = computed(() => {
  let bottom = maxBottom(desktopY, desktopH)
  if (drag.value && drag.value.currentY + drag.value.currentH > bottom) {
    bottom = drag.value.currentY + drag.value.currentH
  }
  //+2 leaves room to drag below the last block without scrolling.
  return Math.max(MIN_GHOST_ROWS, bottom + 2)
})

//===========================================================================
//DRAG STATE - one ref drives every interaction (move, resize, create).
//`mode` tells which path is active; `current{X,Y,W,H}` is what the
//rendered block / phantom uses while the drag is live; on commit
//(pointerup) we write back into the block and clear the state.
type DragMode = "move" | "resize" | "create"
interface DragState {
  mode:      DragMode
  blockId?:  string             //for move + resize
  type?:     DetailBlockType    //for create
  originalX: number
  originalY: number
  originalW: number
  originalH: number
  currentX:  number             //-1 means "pointer not over the grid yet"
  currentY:  number
  currentW:  number
  currentH:  number
  pointerStartX: number         //in pixels - used to gate "is it actually a drag?"
  pointerStartY: number
  moved:     boolean            //flipped true once movement crosses the threshold
  invalid:   boolean            //true when the live rect overlaps another block
}

const drag = ref<DragState | null>(null)
const DRAG_THRESHOLD_PX = 4

//===========================================================================
//COLLISION - two grid rects overlap when they intersect on BOTH axes.
//Used during drag to flag invalid drop targets (move / resize / create
//into an already-occupied cell) and to cancel the commit on pointerup.
function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}
function wouldOverlap(x: number, y: number, w: number, h: number, ignoreId?: string): boolean {
  for (const b of blocks.value) {
    if (b.id === ignoreId) continue
    if (rectsOverlap(x, y, w, h, b.x, b.y, b.w, b.h)) return true
  }
  return false
}

//Project a pixel (px, py) inside the grid rect into (gridX, gridY).
//Returns -1, -1 if the pointer is outside the grid bounds.
function pointerToCell(clientX: number, clientY: number): { gridX: number; gridY: number } {
  const el = gridRef.value
  if (!el) return { gridX: -1, gridY: -1 }
  const rect = el.getBoundingClientRect()
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return { gridX: -1, gridY: -1 }
  }
  //Both vars are declared on .detail__grid in this file's CSS - a null
  //read means the stylesheet drifted; scream instead of silently
  //desyncing pointer math from the rendered grid.
  const gapPx = getCssPx(el, "--detail-gap")
  const rowPx = getCssPx(el, "--detail-row-h")
  if (gapPx === null || rowPx === null) {
    console.error("[detail-page] --detail-gap / --detail-row-h missing on the grid element")
    return { gridX: -1, gridY: -1 }
  }
  const colPx = (rect.width - (GRID_COLS - 1) * gapPx) / GRID_COLS
  const slotW = colPx + gapPx
  const slotH = rowPx + gapPx
  const px = clientX - rect.left
  const py = clientY - rect.top
  const gridX = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(px / slotW)))
  const gridY = Math.max(0, Math.floor(py / slotH))
  return { gridX, gridY }
}

function getCssPx(el: HTMLElement, varName: string): number | null {
  const v = getComputedStyle(el).getPropertyValue(varName).trim()
  if (!v) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

//===========================================================================
//Block styles for CSS Grid. While dragging, the block jumps to the
//live `current{X,Y,W,H}` so the author sees snap previewing in real-
//time. Once the drag commits, we write back into the block and clear
//the drag state.
function blockGridStyle(block: DetailBlock): Record<string, string> {
  const active = drag.value && drag.value.blockId === block.id && drag.value.moved
  const x = active ? drag.value!.currentX : block.x
  const y = active ? drag.value!.currentY : block.y
  const w = active ? drag.value!.currentW : block.w
  const h = active ? drag.value!.currentH : block.h
  return {
    gridColumnStart: String(x + 1),
    gridColumnEnd:   `span ${w}`,
    gridRowStart:    String(y + 1),
    gridRowEnd:      `span ${h}`,
  }
}

//===========================================================================
//MOVE - start on pointerdown on a block. Real movement only kicks in
//after DRAG_THRESHOLD_PX so a simple click still selects without
//shuffling the layout by accident.
const gridRef = ref<HTMLDivElement | null>(null)

function onBlockPointerDown(e: PointerEvent, block: DetailBlock) {
  if (!editMode.value) return
  //Inline editing: pointer events inside the block are the textarea's
  //(focus, caret placement, selection) - don't hijack them for a drag.
  if (editingId.value === block.id) return
  //Resize handle has its own pointerdown that stops propagation, so
  //if we get here it's a real block-body pointerdown.
  e.preventDefault()
  drag.value = {
    mode:      "move",
    blockId:   block.id,
    originalX: block.x,
    originalY: block.y,
    originalW: block.w,
    originalH: block.h,
    currentX:  block.x,
    currentY:  block.y,
    currentW:  block.w,
    currentH:  block.h,
    pointerStartX: e.clientX,
    pointerStartY: e.clientY,
    moved: false,
    invalid: false,
  }
  attachDocumentListeners()
}

//===========================================================================
//RESIZE - SE handle. On move, the block's width and height extend to
//cover whichever cell the pointer is over.
function onResizeStart(e: PointerEvent, block: DetailBlock) {
  if (!editMode.value) return
  e.preventDefault()
  e.stopPropagation()   //don't also fire a move drag
  selectedId.value = block.id
  drag.value = {
    mode:      "resize",
    blockId:   block.id,
    originalX: block.x,
    originalY: block.y,
    originalW: block.w,
    originalH: block.h,
    currentX:  block.x,
    currentY:  block.y,
    currentW:  block.w,
    currentH:  block.h,
    pointerStartX: e.clientX,
    pointerStartY: e.clientY,
    moved: false,
    invalid: false,
  }
  attachDocumentListeners()
}

//===========================================================================
//CREATE - pointerdown on a side-panel button starts a "create" drag.
//A phantom block follows the cursor as long as it's over the grid. On
//pointerup: if the cursor is over the grid → place there; if outside →
//append at the next free row (lets the author still get a quick-add
//without precise placement).
function onPanelButtonPointerDown(e: PointerEvent, type: DetailBlockType) {
  if (!editMode.value) return
  e.preventDefault()
  drag.value = {
    mode:      "create",
    type,
    originalX: 0, originalY: 0, originalW: 1, originalH: 1,
    currentX:  -1, currentY: -1, currentW: 1, currentH: 1,
    pointerStartX: e.clientX,
    pointerStartY: e.clientY,
    moved: false,
    invalid: false,
  }
  attachDocumentListeners()
}

//===========================================================================
//DOCUMENT-LEVEL pointer tracking so the drag survives leaving the grid
//(and reaches the pointerup even if it happens outside).
function attachDocumentListeners() {
  document.addEventListener("pointermove", onDocPointerMove)
  document.addEventListener("pointerup",   onDocPointerUp)
  document.addEventListener("pointercancel", onDocPointerUp)
}
function detachDocumentListeners() {
  document.removeEventListener("pointermove", onDocPointerMove)
  document.removeEventListener("pointerup",   onDocPointerUp)
  document.removeEventListener("pointercancel", onDocPointerUp)
}

function onDocPointerMove(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  if (!d.moved) {
    const dx = Math.abs(e.clientX - d.pointerStartX)
    const dy = Math.abs(e.clientY - d.pointerStartY)
    if (dx + dy < DRAG_THRESHOLD_PX) return
    d.moved = true
  }
  const cell = pointerToCell(e.clientX, e.clientY)

  if (d.mode === "move") {
    if (cell.gridX < 0) return
    //Snap the block's TOP-LEFT to the hovered cell. Clamp so the block
    //stays inside the 3-col bound horizontally.
    d.currentX = Math.max(0, Math.min(GRID_COLS - d.originalW, cell.gridX))
    d.currentY = Math.max(0, cell.gridY)
  } else if (d.mode === "resize") {
    if (cell.gridX < 0) return
    //SE handle: width grows from the block's left edge; height from its top.
    d.currentW = Math.max(1, Math.min(GRID_COLS - d.originalX, cell.gridX - d.originalX + 1))
    d.currentH = Math.max(1, cell.gridY - d.originalY + 1)
  } else if (d.mode === "create") {
    //Track the hovered cell; -1 means "not over grid, hide the phantom".
    d.currentX = cell.gridX
    d.currentY = cell.gridY
  }

  //Flag collision so the live block / phantom can render red AND the
  //pointerup commit can refuse the change. For move + resize we ignore
  //the block itself; create has no existing id to skip.
  if (d.mode === "create" && d.currentX < 0) {
    d.invalid = false
  } else {
    const ignoreId = (d.mode === "move" || d.mode === "resize") ? d.blockId : undefined
    d.invalid = wouldOverlap(d.currentX, d.currentY, d.currentW, d.currentH, ignoreId)
  }
}

function onDocPointerUp(_e: PointerEvent) {
  detachDocumentListeners()
  const d = drag.value
  if (!d) return

  if (d.mode === "move") {
    if (!d.moved) {
      //Click without movement = select.
      if (d.blockId) selectedId.value = d.blockId
    } else if (d.invalid) {
      //Dropped on an occupied cell - cancel silently. The block snaps
      //back to its original coords because we never wrote d.current*
      //onto the block.
    } else {
      const block = blocks.value.find((b) => b.id === d.blockId)
      if (block && (block.x !== d.currentX || block.y !== d.currentY)) {
        snapshot()
        block.x = d.currentX
        block.y = d.currentY
        markDirty()
      }
    }
  } else if (d.mode === "resize") {
    if (!d.invalid) {
      const block = blocks.value.find((b) => b.id === d.blockId)
      if (block && (block.w !== d.currentW || block.h !== d.currentH)) {
        snapshot()
        block.w = d.currentW
        block.h = d.currentH
        markDirty()
      }
    }
  } else if (d.mode === "create") {
    if (d.currentX >= 0 && !d.invalid) {
      addBlockAt(d.type!, d.currentX, d.currentY)
    } else if (!d.moved) {
      //No movement and not over grid: treat as a "click" → append.
      addBlock(d.type!)
    }
    //If they dragged outside the grid OR onto an occupied cell, we
    //silently cancel (no surprise add).
  }
  drag.value = null
}

//===========================================================================
//LOAD / SAVE
//Pull this page's project + a local editable copy of its blocks out of
//the shared portfolio cache. Fresh data drops the undo history -
//surviving past a save would mean Ctrl+Z restoring something the user
//already committed to disk.
function syncFromPortfolio() {
  const p = portfolioData.value?.mainProjects.find((mp) => mp.id === projectId.value)
  if (!p) { loadError.value = "Project not found"; return }
  project.value = p
  blocks.value  = (p.detailPage?.blocks ?? []).map((b) => ({ ...b, content: JSON.parse(JSON.stringify(b.content)) }))
  undoStack.value = []
}

async function loadProject() {
  loading.value = true
  loadError.value = null
  try {
    if (!portfolioLoaded.value) await reloadPortfolio()
    syncFromPortfolio()
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

//Strip the denormalized url fields before persisting - fileIds are the
//source of truth, /api/portfolio re-resolves urls on every read.
function sanitizeContent(b: DetailBlock): DetailBlockContent {
  switch (b.type) {
    case "image": {
      const c = b.content as ImageBlockContent
      return { fileId: c.fileId, url: null, alt: c.alt, fit: c.fit }
    }
    case "video": {
      const c = b.content as VideoBlockContent
      return { ...c, url: null }
    }
    case "carousel": {
      const c = b.content as CarouselBlockContent
      return { intervalMs: c.intervalMs, items: c.items.map((i) => ({ ...i, url: null })) }
    }
    case "marquee": {
      const c = b.content as MarqueeBlockContent
      return { speedPxs: c.speedPxs, items: c.items.map((i) => ({ ...i, url: null })) }
    }
    case "compare": {
      const c = b.content as CompareBlockContent
      return { ...c, beforeUrl: null, afterUrl: null }
    }
    default:
      return b.content
  }
}

async function onSave() {
  if (saving.value) return
  saving.value = true
  status.value = "Saving..."
  const payload: DetailPage = {
    blocks: blocks.value.map((b) => ({ ...b, content: sanitizeContent(b) })),
  }
  try {
    //updateMainProject reloads the shared cache on success, so every
    //other section (MainProject cards etc.) sees the new blocks too.
    await updateMainProject(projectId.value, { detailPage: payload })
    dirty.value = false
    status.value = "Saved"
    syncFromPortfolio()
    setTimeout(() => { if (status.value === "Saved") status.value = "" }, 1500)
  } catch (e) {
    status.value = `Save failed: ${(e as Error).message}`
  } finally {
    saving.value = false
  }
}

//===========================================================================
//BLOCK CRUD
function uniqueId(): string {
  return Math.random().toString(36).slice(2, 10)
}
//Per-type default content. viewer3d defaults model3dId to null so the
//placeholder ("No model") shows and the user is forced through the
//ModelPicker before publish. Video defaults to gif-style playback.
const DEFAULT_CONTENT: Record<DetailBlockType, () => DetailBlockContent> = {
  text:      () => ({ text: { en: "", fr: "" } }),
  heading:   () => ({ text: { en: "Section", fr: "Section" } }),
  quote:     () => ({ text: { en: "", fr: "" }, author: "" }),
  image:     () => ({ fileId: null, url: null, alt: { en: "", fr: "" }, fit: "cover" }),
  video:     () => ({ fileId: null, url: null, autoplay: true, loop: true, muted: true, controls: false }),
  carousel:  () => ({ items: [], intervalMs: 0 }),
  marquee:   () => ({ items: [], speedPxs: 60 }),
  compare:   () => ({
    beforeFileId: null, beforeUrl: null, afterFileId: null, afterUrl: null,
    beforeLabel: { en: "Before", fr: "Avant" },
    afterLabel:  { en: "After",  fr: "Après" },
    followMouse: false,
  }),
  accordion: () => ({ items: [{ title: { en: "Section 1", fr: "Section 1" }, body: { en: "", fr: "" } }] }),
  specs:     () => ({ rows: [{ label: { en: "Software", fr: "Logiciel" }, value: { en: "", fr: "" } }] }),
  counters:  () => ({ items: [{ label: { en: "Vertices", fr: "Sommets" }, value: 0 }] }),
  button:    () => ({ label: { en: "See more", fr: "Voir plus" }, url: "", newTab: true }),
  embed:     () => ({ url: "" }),
  viewer3d:  () => ({ model3dId: null, desktopView: "", mobileView: "" }),
}

function addBlockAt(type: DetailBlockType, x: number, y: number) {
  const id = uniqueId()
  const w = 1, h = 1
  const clampedX = Math.max(0, Math.min(GRID_COLS - w, x))
  const clampedY = Math.max(0, y)
  //Refuse to add on top of an existing block. Drag-drop targets are
  //already vetted by the drag handlers, but the panel "click to
  //append" path could land on a sparse layout.
  if (wouldOverlap(clampedX, clampedY, w, h)) return
  snapshot()
  const block: DetailBlock = { id, type, x: clampedX, y: clampedY, w, h, content: DEFAULT_CONTENT[type]() }
  blocks.value = [...blocks.value, block]
  selectedId.value = id
  markDirty()
}
function addBlock(type: DetailBlockType) {
  addBlockAt(type, 0, maxBottom(desktopY, desktopH))
}
function removeSelected() {
  const id = selectedId.value
  if (!id) return
  snapshot()
  blocks.value = blocks.value.filter((b) => b.id !== id)
  selectedId.value = null
  markDirty()
}

//===========================================================================
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push("/")
}

//===========================================================================
//KEYBOARD - Delete / Backspace removes the selected block; Ctrl/Cmd+Z
//pops the undo stack; Ctrl/Cmd+S saves. We ignore the event when focus
//is in an input or textarea so the user can type normally in those
//(except Ctrl+S which should save from anywhere).
function onKeyDown(e: KeyboardEvent) {
  if (!editMode.value) return
  if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
    e.preventDefault()
    if (dirty.value && !saving.value) void onSave()
    return
  }
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
  if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
    e.preventDefault()
    undo()
    return
  }
  if ((e.key === "Delete" || e.key === "Backspace") && selectedId.value) {
    e.preventDefault()
    removeSelected()
  }
}

//SAVE lives in the fixed admin cluster (left of the read/edit toggle) -
//the page registers its action + state there instead of rendering its
//own header button.
const { registerSave, unregisterSave } = useAdminActions()

onMounted(() => {
  loadProject()
  window.addEventListener("keydown", onKeyDown)
  registerSave({ dirty, saving, run: () => { void onSave() } })
})
onBeforeUnmount(() => {
  detachDocumentListeners()
  window.removeEventListener("keydown", onKeyDown)
  unregisterSave()
})
</script>

<template>
  <div class="detail-page" :class="{ 'detail-page--edit': editMode }">
    <header class="detail-page__top">
      <button type="button" class="detail-page__back" @click="goBack" title="Back">
        <ArrowLeft :size="16" />
        <span>Back</span>
      </button>
      <span class="detail-page__index" aria-hidden="true">{{ projectIndex }}</span>
      <h1 class="detail-page__title">{{ projectTitle }}</h1>
      <span v-if="editMode" class="detail-page__status">{{ status }}</span>
    </header>

    <div class="detail-page__body">
      <main class="detail-page__main">
        <p v-if="loading" class="detail-page__msg">Loading...</p>
        <p v-else-if="loadError" class="detail-page__msg detail-page__msg--err">{{ loadError }}</p>

        <!--===== VIEW MODE - read-only =========================================-->
        <template v-else-if="!editMode">
          <p v-if="!blocks.length" class="detail-page__msg">
            This project doesn't have a detail page yet.
          </p>
          <div
            v-else
            class="detail-page__grid"
            :style="{
              '--detail-rows-desktop':  `repeat(${totalRows}, var(--detail-row-h))`,
              '--detail-rows-mobile':   `repeat(${totalMobileRows}, var(--detail-row-h))`,
              gridTemplateRows:         `var(--detail-rows-desktop)`,
            }"
          >
            <div
              v-for="block in blocks"
              :key="block.id"
              class="detail-page__block"
              :style="{
                gridColumnStart: block.x + 1,
                gridColumnEnd:   `span ${block.w}`,
                gridRowStart:    block.y + 1,
                gridRowEnd:      `span ${block.h}`,
                '--mobile-row-start': mobileY(block) + 1,
                '--mobile-row-span':  mobileH(block),
              }"
            >
              <DetailBlockRenderer :block="block" />
            </div>
          </div>
        </template>

        <!--===== EDIT MODE - hand-rolled bento grid ===========================-->
        <template v-else>
          <div
            ref="gridRef"
            class="bento-grid"
            :style="{ gridTemplateRows: `repeat(${gridBgRows}, var(--detail-row-h))` }"
          >
            <!--Ghost grid background - faint dashed cells always visible
            so snap targets are clear even on empty rows.-->
            <div class="grid-bg" aria-hidden="true">
              <div v-for="n in 3 * gridBgRows" :key="n" class="grid-bg__cell"></div>
            </div>

            <!--Actual blocks. blockGridStyle returns the LIVE coords while
            the block is being dragged so the author sees real-time snap.-->
            <div
              v-for="block in blocks"
              :key="block.id"
              class="bento-block"
              :class="{
                'bento-block--selected': selectedId === block.id,
                'bento-block--dragging': drag?.blockId === block.id && drag.moved,
                'bento-block--invalid':  drag?.blockId === block.id && drag.moved && drag.invalid,
              }"
              :style="blockGridStyle(block)"
              @pointerdown="onBlockPointerDown($event, block)"
              @dblclick="block.type === 'text' && startInlineEdit(block)"
            >
              <!--Type tag - always visible in edit mode so the author can
              tell a video from an image at a glance.-->
              <span class="bento-block__tag">{{ block.type }}</span>

              <!--Inline text edit: dbl-click swaps the rendered markdown
              for a raw-source textarea on the CURRENT lang.-->
              <textarea
                v-if="block.type === 'text' && editingId === block.id"
                ref="inlineTextareaRef"
                class="bento-block__text-edit"
                :value="(block.content as TextBlockContent).text[lang] ?? ''"
                @input="(e) => onInlineInput(e, block)"
                @blur="stopInlineEdit"
                @keydown="onInlineKeyDown"
                @pointerdown.stop
              ></textarea>

              <!--3D viewer stays a static placeholder in edit mode - the
              live ThreeViewer would grab pointer events for orbit and
              fight the block drag/resize.-->
              <div v-else-if="block.type === 'viewer3d'" class="bento-block__placeholder">
                <Box :size="32" />
                <span>{{ (block.content as Viewer3dBlockContent).model3dId ? "3D Viewer" : "3D Viewer (pick a model)" }}</span>
              </div>

              <!--Everything else renders the REAL block via the shared
              renderer, wrapped pointer-events:none so the tile keeps
              acting as the drag handle. Interactive blocks (carousel,
              compare, accordion) show as static previews.-->
              <div v-else class="bento-block__preview">
                <DetailBlockRenderer :block="block" />
              </div>

              <!--SE resize handle - fades in on hover; selected blocks
              keep it visible. Stops propagation so its pointerdown
              doesn't start a move drag.-->
              <div
                class="bento-block__resize"
                title="Drag to resize"
                @pointerdown="onResizeStart($event, block)"
              ></div>
            </div>

            <!--Phantom block during create-drag. Renders ONLY when the
            cursor is over the grid (currentX >= 0). pointer-events:none
            so it doesn't intercept the live pointer.-->
            <div
              v-if="drag?.mode === 'create' && drag.currentX >= 0"
              class="bento-block bento-block--phantom"
              :class="{ 'bento-block--invalid': drag.invalid }"
              :style="{
                gridColumnStart: String(drag.currentX + 1),
                gridColumnEnd:   `span ${drag.currentW}`,
                gridRowStart:    String(drag.currentY + 1),
                gridRowEnd:      `span ${drag.currentH}`,
              }"
            >
              <component :is="entryFor(drag.type)?.icon ?? Type" :size="28" />
            </div>
          </div>
        </template>
      </main>

      <!--===== SIDE PANEL ====================================================-->
      <aside v-if="editMode" class="detail-page__panel">
        <div class="detail-page__panel-group">
          <h2 class="detail-page__panel-title">Add block</h2>
          <p class="dp-hint">Click to append, or drag onto the grid to place anywhere.</p>
          <div class="detail-page__add-grid">
            <button
              v-for="bt in BLOCK_TYPES"
              :key="bt.type"
              type="button" class="detail-page__add"
              :title="`Add a ${bt.label} block`"
              @pointerdown="onPanelButtonPointerDown($event, bt.type)"
            >
              <component :is="bt.icon" :size="14" />
              <span>{{ bt.label }}</span>
            </button>
          </div>
        </div>

        <div v-if="selectedBlock" class="detail-page__panel-group">
          <div class="detail-page__panel-head">
            <h2 class="detail-page__panel-title">Edit {{ entryFor(selectedBlock.type)?.label ?? selectedBlock.type }}</h2>
            <button type="button" class="dp-icon-btn dp-icon-btn--danger" @click="removeSelected" title="Delete block">
              <Trash2 :size="14" />
            </button>
          </div>
          <!--One editor component per block type (detail/editors/). They
          mutate the content directly, emit "structural" right before a
          list/media mutation (undo snapshot) and "dirty" after any edit.-->
          <component
            :is="entryFor(selectedBlock.type)!.editor"
            :key="selectedBlock.id"
            :content="selectedBlock.content"
            @structural="snapshot"
            @dirty="markDirty"
          />
        </div>

        <p v-else class="detail-page__panel-empty">Click a block on the page to edit its content.</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  display:        flex;
  flex-direction: column;
  min-height:     100vh;
  background-color: hsl(var(--background));
  color:          hsl(var(--foreground));

  /* Bento dims - exposed via CssVarsPanel "Detail page" group. */
  --detail-row-h: var(--detail-grid-row-h, 200px);
  --detail-gap:   var(--detail-grid-gap, 8px);
  --detail-max-w: var(--detail-grid-max-width, 1200px);
}

/*===== TOP BAR - brutalist header: index stamp + uppercase title. The
accent square next to the title is the only colored element.=====*/
.detail-page__top {
  display: flex; align-items: center; gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: var(--border-width-md) solid var(--color-border-primary);
  flex-shrink: 0;
}
/*Back is borderless (user rule) - background appears on hover only.*/
.detail-page__back {
  display: inline-flex; align-items: center; gap: var(--spacing-xxs);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  background: transparent; color: hsl(var(--foreground));
  border: none;
  cursor: pointer;
  transition: color var(--transition-fast) ease, background-color var(--transition-fast) ease;
}
.detail-page__back:hover { color: var(--color-accent); background-color: var(--color-background-gray-100); }
.detail-page__index {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent);
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  line-height: 1;
}
.detail-page__title {
  flex: 1 1 auto;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  margin: 0;
  color: var(--color-text-hover);
}
.detail-page__status {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
}
/*===== BODY ===============================================================*/
/*EDIT MODE is a fullscreen app layout: the page locks to the viewport
and the grid + panel become two INDEPENDENT scroll areas, so the editor
tools never leave the screen no matter how far the grid scrolls.
(position:sticky was defeated by the global overflow-x:hidden on body -
an ancestor with any overflow kills sticky, hence this layout instead.)*/
.detail-page--edit {
  height: 100vh;
  overflow: hidden;
}
.detail-page__body {
  display: flex; flex: 1 1 auto; min-height: 0;
}
.detail-page__main {
  flex: 1 1 auto;
  padding: var(--spacing-xl) var(--spacing-lg);
  width: 100%;
  position: relative;
}
.detail-page--edit .detail-page__main { overflow-y: auto; }
.detail-page__msg {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  text-align: center;
  padding: var(--spacing-2xl) 0;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}
.detail-page__msg--err { color: hsl(var(--destructive)); }

/*===== VIEW MODE GRID =====================================================*/
.detail-page__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--detail-gap);
  max-width: var(--detail-max-w);
  margin: 0 auto;
}
/*Public blocks are chromeless - no surface fill, no border. The content
itself (image, video, text) does all the visual work; only the grid gap
separates blocks.*/
.detail-page__block {
  display: flex; align-items: stretch; justify-content: stretch;
  overflow: hidden;
}

/*===== EDIT MODE GRID =====================================================*/
.bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--detail-gap);
  max-width: var(--detail-max-w);
  margin: 0 auto;
  position: relative;
  /* No native scroll snap during drag - we manage snap ourselves. */
  touch-action: none;
  user-select: none;
}

/* Ghost background cells fill EVERY cell of the (3 × gridBgRows) grid.
The .grid-bg is itself a grid item that spans the whole area; the v-for
inside paints one faint dashed cell per slot. */
.grid-bg {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: subgrid;
  gap: var(--detail-gap);
  z-index: 0;
  pointer-events: none;
}
.grid-bg__cell {
  border: var(--border-width-sm) dashed var(--color-gray-medium);
  opacity: 0.4;
}

.bento-block {
  background-color: var(--color-background-secondary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  position: relative;
  overflow: hidden;
  cursor: grab;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: outline-color 0.15s;
}
.bento-block--dragging {
  cursor: grabbing;
  opacity: 0.85;
  z-index: 10;
  /* Disable transitions during the drag so cell snaps feel immediate. */
  transition: none;
}
.bento-block--selected {
  outline: var(--border-width-md) solid var(--color-accent);
  outline-offset: calc(-1 * var(--border-width-md));
}
.bento-block--phantom {
  background-color: var(--tag-bg);
  border-style: dashed;
  border-color: var(--color-accent);
  color: var(--color-accent);
  z-index: 5;
  pointer-events: none;
}
/* Collision feedback - block / phantom turns red when the live rect
overlaps another block. The pointerup handler refuses to commit in
this state so the block snaps back to where it came from. */
.bento-block--invalid {
  background-color: hsl(var(--destructive) / 0.18);
  border-color:     hsl(var(--destructive));
  outline:          var(--border-width-sm) solid hsl(var(--destructive));
  outline-offset:   calc(-1 * var(--border-width-md));
  color:            hsl(var(--destructive));
}
/*Type tag - tiny uppercase label pinned to the top-left corner of every
edit-mode tile so the author can tell block types apart at a glance.*/
.bento-block__tag {
  position: absolute;
  top: 0; left: 0;
  z-index: 6;
  padding: 0 var(--spacing-xxs);
  font-size: 0.6rem;
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-tight);
  color: var(--color-text-tertiary);
  background-color: var(--semi-transparent-dark);
  pointer-events: none;
}
/*Live preview wrapper - the real block renders inside but never takes
pointer input; the whole tile is the drag handle.*/
.bento-block__preview {
  width: 100%; height: 100%;
  pointer-events: none;
}
/* Inline source editor - swapped in on dbl-click for the active lang.
Stops the parent move-drag via @pointerdown.stop in the template;
this rule restores normal text cursor + selection. */
.bento-block__text-edit {
  margin: 0;
  padding: var(--spacing-sm);
  width: 100%; height: 100%;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  border: none;
  outline: none;
  resize: none;
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  font-size: var(--font-size-xs);
  line-height: 1.45;
  cursor: text;
  /* Override the bento-grid's touch-action: none so caret placement
  by touch (mobile) and text selection still work in the textarea. */
  touch-action: auto;
  user-select: text;
}
.bento-block__placeholder {
  display: flex; flex-direction: column;
  align-items: center; gap: var(--spacing-xs);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  pointer-events: none;  /* let the parent grab drag pointerdown */
}
.bento-block__resize {
  position: absolute;
  bottom: 0; right: 0;
  width: var(--spacing-md); height: var(--spacing-md);
  background: var(--color-accent);
  cursor: se-resize;
  z-index: 20;
  /* Hidden by default; fades in when the block is hovered or selected
  so the author doesn't have to click first to start a resize. */
  opacity: 0;
  transition: opacity 0.12s ease-out;
}
.bento-block:hover .bento-block__resize,
.bento-block--selected .bento-block__resize {
  opacity: 1;
}

/*===== SIDE PANEL - background LEVELS delimit the parts, no borders. The
panel itself is level 1 (secondary bg), groups are transparent, item
cards inside the editors are level 2 (dp-item), inputs level 3.
The panel is a fixed column of the fullscreen edit layout (see the
.detail-page--edit rules above): it never scrolls away with the grid and
scrolls internally when its own content is taller than the viewport.
position:relative + z-index 2 lift it above the global grain overlay
(z 1) so no grain texture sits on the tools.*/
.detail-page__panel {
  width: 340px;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
  padding: var(--spacing-lg);
  background-color: var(--color-background-secondary);
  overflow-y: auto;
  display: flex; flex-direction: column;
  gap: var(--spacing-xl);
}
.detail-page__panel-group {
  display: flex; flex-direction: column;
  gap: var(--spacing-xs);
}
.detail-page__panel-head {
  display: flex; align-items: center; justify-content: space-between;
}
.detail-page__panel-title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-hover);
  margin: 0;
  padding-left: var(--spacing-xs);
  border-left: var(--border-width-lg) solid var(--color-accent);
}
.detail-page__panel-empty {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin: 0;
  font-style: italic;
}
/*Add-block buttons lay out 2-up. Background does the delimiting.*/
.detail-page__add-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-xxs);
}
.detail-page__add {
  display: flex; align-items: center; gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-tight);
  background-color: var(--color-background-gray-100);
  color: hsl(var(--foreground));
  border: none;
  cursor: pointer;
  touch-action: none;   /* drag from buttons works on touch */
  user-select: none;
  transition: background-color var(--transition-fast) ease, color var(--transition-fast) ease;
}
.detail-page__add:hover { background-color: var(--color-background-gray-150); color: var(--color-accent); }

/*===== MOBILE (view mode) - 1 col forced ==================================*/
/* The grid switches to a single column and consumes the per-block
--mobile-row-start / --mobile-row-span CSS vars (set inline from
mobileY / mobileH, falling back to desktop y / h when unauthored). */
@media (max-width: 768px) {
  .detail-page__grid {
    grid-template-columns: 1fr;
    grid-template-rows: var(--detail-rows-mobile);
  }
  .detail-page__block {
    grid-column: 1 / -1 !important;
    grid-row-start: var(--mobile-row-start) !important;
    grid-row-end:   span var(--mobile-row-span) !important;
  }
  .detail-page__title { font-size: var(--font-size-md); }
  .detail-page__index { font-size: var(--font-size-lg); }
}
</style>
