<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Box,
  Columns2,
  Film,
  ImageIcon,
  Images,
  ListCollapse,
  Plus,
  Save,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-vue-next"
import { useLanguage } from "../composables/useLanguage"
import { useAdmin } from "../composables/useAdmin"
import { usePortfolio } from "../composables/usePortfolio"
import { pickBilingual as pickBi } from "../lib/markdown"
import ModelPicker from "../components/portfolio/ModelPicker.vue"
import DetailBlockRenderer from "../components/portfolio/blocks/DetailBlockRenderer.vue"
import type {
  AccordionBlockContent,
  CarouselBlockContent,
  CompareBlockContent,
  DetailBlock,
  DetailBlockContent,
  DetailBlockType,
  DetailPage,
  ImageBlockContent,
  MainProjectDto,
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
//Block RENDERING is delegated to DetailBlockRenderer (shared with the
//public view) - this file only owns layout, drag state, and the side
//panel editors.

const route  = useRoute()
const router = useRouter()
const { lang }   = useLanguage()
const { editMode } = useAdmin()
//All data flows through the shared portfolio cache - this page used to
//refetch /api/portfolio by hand, which bypassed (and desynced) the cache
//every other section reads.
const { data: portfolioData, loaded: portfolioLoaded, reload: reloadPortfolio, uploadFile, updateMainProject } = usePortfolio()

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

//Typed accessors for the panel editors - one cast per type, template
//stays clean. Only valid while selectedBlock.type matches.
const selText      = computed(() => selectedBlock.value?.content as TextBlockContent)
const selImage     = computed(() => selectedBlock.value?.content as ImageBlockContent)
const selVideo     = computed(() => selectedBlock.value?.content as VideoBlockContent)
const selCarousel  = computed(() => selectedBlock.value?.content as CarouselBlockContent)
const selCompare   = computed(() => selectedBlock.value?.content as CompareBlockContent)
const selAccordion = computed(() => selectedBlock.value?.content as AccordionBlockContent)
const selViewer    = computed(() => selectedBlock.value?.content as Viewer3dBlockContent)

//BLOCK TYPE REGISTRY - one entry per addable type: panel button label +
//icon, phantom icon during create-drag.
const BLOCK_TYPES: { type: DetailBlockType; label: string; icon: unknown }[] = [
  { type: "text",      label: "Text",      icon: Type },
  { type: "image",     label: "Image / GIF", icon: ImageIcon },
  { type: "video",     label: "Video",     icon: Film },
  { type: "carousel",  label: "Carousel",  icon: Images },
  { type: "compare",   label: "Compare",   icon: Columns2 },
  { type: "accordion", label: "Accordion", icon: ListCollapse },
  { type: "viewer3d",  label: "3D Viewer", icon: Box },
]
function iconFor(type: DetailBlockType | undefined): unknown {
  return BLOCK_TYPES.find((t) => t.type === type)?.icon ?? Type
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
//(add, remove, move, resize, media swap, list reorder). Ctrl+Z (or Cmd+Z)
//pops the last snapshot and restores it. Text content edits are not
//snapshotted - the textarea's native undo handles them, and capturing
//every keystroke would drown the stack. Reset on (re)load.
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
      return { fileId: c.fileId, url: null, alt: c.alt }
    }
    case "video": {
      const c = b.content as VideoBlockContent
      return { ...c, url: null }
    }
    case "carousel": {
      const c = b.content as CarouselBlockContent
      return { intervalMs: c.intervalMs, items: c.items.map((i) => ({ ...i, url: null })) }
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
//ModelPicker before publish. Video defaults to gif-style playback
//(autoplay + loop + muted, no controls) since that's the main use case.
const DEFAULT_CONTENT: Record<DetailBlockType, () => DetailBlockContent> = {
  text:      () => ({ text: { en: "", fr: "" } }),
  image:     () => ({ fileId: null, url: null, alt: { en: "", fr: "" } }),
  video:     () => ({ fileId: null, url: null, autoplay: true, loop: true, muted: true, controls: false }),
  carousel:  () => ({ items: [], intervalMs: 0 }),
  compare:   () => ({
    beforeFileId: null, beforeUrl: null, afterFileId: null, afterUrl: null,
    beforeLabel: { en: "Before", fr: "Avant" },
    afterLabel:  { en: "After",  fr: "Après" },
  }),
  accordion: () => ({ items: [{ title: { en: "Section 1", fr: "Section 1" }, body: { en: "", fr: "" } }] }),
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
//UPLOADS - shared pick-then-upload helper for every media block type.
//Native picker; cancelling resolves to []. Upload failures surface via
//the shared uploadFile toast + local status.
function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

async function uploadPicked(accept: string, multiple = false): Promise<{ id: string; url: string }[]> {
  const files = await pickFiles(accept, multiple)
  if (!files.length) return []
  status.value = "Uploading..."
  try {
    const rows: { id: string; url: string }[] = []
    for (const f of files) rows.push(await uploadFile(f))
    status.value = ""
    return rows
  } catch (e) {
    status.value = `Upload failed: ${(e as Error).message}`
    return []
  }
}

async function onPickImage() {
  if (!selectedBlock.value || selectedBlock.value.type !== "image") return
  const [row] = await uploadPicked("image/*")
  if (!row) return
  snapshot()
  selImage.value.fileId = row.id
  selImage.value.url    = row.url
  markDirty()
}

async function onPickVideo() {
  if (!selectedBlock.value || selectedBlock.value.type !== "video") return
  const [row] = await uploadPicked("video/*")
  if (!row) return
  snapshot()
  selVideo.value.fileId = row.id
  selVideo.value.url    = row.url
  markDirty()
}

async function onAddCarouselImages() {
  if (!selectedBlock.value || selectedBlock.value.type !== "carousel") return
  const rows = await uploadPicked("image/*", true)
  if (!rows.length) return
  snapshot()
  for (const row of rows) {
    selCarousel.value.items.push({ fileId: row.id, url: row.url, caption: { en: "", fr: "" } })
  }
  markDirty()
}

function removeCarouselItem(i: number) {
  snapshot()
  selCarousel.value.items.splice(i, 1)
  markDirty()
}
function moveCarouselItem(i: number, delta: number) {
  const items = selCarousel.value.items
  const j = i + delta
  if (j < 0 || j >= items.length) return
  snapshot()
  const [it] = items.splice(i, 1)
  items.splice(j, 0, it!)
  markDirty()
}

async function onPickCompare(side: "before" | "after") {
  if (!selectedBlock.value || selectedBlock.value.type !== "compare") return
  const [row] = await uploadPicked("image/*")
  if (!row) return
  snapshot()
  if (side === "before") { selCompare.value.beforeFileId = row.id; selCompare.value.beforeUrl = row.url }
  else                   { selCompare.value.afterFileId  = row.id; selCompare.value.afterUrl  = row.url }
  markDirty()
}

function addAccordionItem() {
  snapshot()
  const n = selAccordion.value.items.length + 1
  selAccordion.value.items.push({ title: { en: `Section ${n}`, fr: `Section ${n}` }, body: { en: "", fr: "" } })
  markDirty()
}
function removeAccordionItem(i: number) {
  snapshot()
  selAccordion.value.items.splice(i, 1)
  markDirty()
}
function moveAccordionItem(i: number, delta: number) {
  const items = selAccordion.value.items
  const j = i + delta
  if (j < 0 || j >= items.length) return
  snapshot()
  const [it] = items.splice(i, 1)
  items.splice(j, 0, it!)
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

onMounted(() => {
  loadProject()
  window.addEventListener("keydown", onKeyDown)
})
onBeforeUnmount(() => {
  detachDocumentListeners()
  window.removeEventListener("keydown", onKeyDown)
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
      <button
        v-if="editMode"
        type="button" class="detail-page__save"
        :disabled="!dirty || saving"
        @click="onSave"
      >
        <Save :size="14" />
        <span>{{ saving ? "Saving..." : "Save" }}</span>
      </button>
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
              :class="`detail-page__block--${block.type}`"
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
              <component :is="iconFor(drag.type)" :size="28" />
            </div>
          </div>
        </template>
      </main>

      <!--===== SIDE PANEL ====================================================-->
      <aside v-if="editMode" class="detail-page__panel">
        <div class="detail-page__panel-group">
          <h2 class="detail-page__panel-title">Add block</h2>
          <p class="detail-page__panel-hint">Click to append, or drag onto the grid to place anywhere.</p>
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
            <h2 class="detail-page__panel-title">Edit {{ selectedBlock.type }}</h2>
            <button type="button" class="detail-page__remove" @click="removeSelected" title="Delete block">
              <Trash2 :size="14" />
            </button>
          </div>

          <!--=== TEXT ========================================================-->
          <template v-if="selectedBlock.type === 'text'">
            <p class="detail-page__panel-hint">Markdown supported. Double-click the block to edit inline (current language).</p>
            <label class="detail-page__field">
              <span>FR (markdown source)</span>
              <textarea
                rows="6"
                :value="selText.text.fr"
                @input="(e) => { selText.text.fr = (e.target as HTMLTextAreaElement).value; markDirty() }"
              ></textarea>
            </label>
            <label class="detail-page__field">
              <span>EN (markdown source)</span>
              <textarea
                rows="6"
                :value="selText.text.en"
                @input="(e) => { selText.text.en = (e.target as HTMLTextAreaElement).value; markDirty() }"
              ></textarea>
            </label>
          </template>

          <!--=== IMAGE / GIF =================================================-->
          <template v-else-if="selectedBlock.type === 'image'">
            <p class="detail-page__panel-hint">Static images and animated GIFs both work here.</p>
            <button type="button" class="detail-page__upload" @click="onPickImage">
              <Upload :size="14" />
              <span>{{ selImage.fileId ? "Replace image" : "Upload image" }}</span>
            </button>
            <label class="detail-page__field">
              <span>Alt (FR)</span>
              <input
                type="text"
                :value="selImage.alt?.fr ?? ''"
                @input="(e) => { if (!selImage.alt) selImage.alt = { en: '', fr: '' }; selImage.alt.fr = (e.target as HTMLInputElement).value; markDirty() }"
              />
            </label>
            <label class="detail-page__field">
              <span>Alt (EN)</span>
              <input
                type="text"
                :value="selImage.alt?.en ?? ''"
                @input="(e) => { if (!selImage.alt) selImage.alt = { en: '', fr: '' }; selImage.alt.en = (e.target as HTMLInputElement).value; markDirty() }"
              />
            </label>
          </template>

          <!--=== VIDEO =======================================================-->
          <template v-else-if="selectedBlock.type === 'video'">
            <p class="detail-page__panel-hint">
              Default is gif-style playback (autoplay, loop, muted). Enable
              controls for a regular video player.
            </p>
            <button type="button" class="detail-page__upload" @click="onPickVideo">
              <Upload :size="14" />
              <span>{{ selVideo.fileId ? "Replace video" : "Upload video" }}</span>
            </button>
            <label class="detail-page__toggle">
              <input type="checkbox" :checked="selVideo.autoplay" @change="(e) => { selVideo.autoplay = (e.target as HTMLInputElement).checked; markDirty() }" />
              <span>Autoplay</span>
            </label>
            <label class="detail-page__toggle">
              <input type="checkbox" :checked="selVideo.loop" @change="(e) => { selVideo.loop = (e.target as HTMLInputElement).checked; markDirty() }" />
              <span>Loop</span>
            </label>
            <label class="detail-page__toggle">
              <input type="checkbox" :checked="selVideo.muted" @change="(e) => { selVideo.muted = (e.target as HTMLInputElement).checked; markDirty() }" />
              <span>Muted (required for autoplay)</span>
            </label>
            <label class="detail-page__toggle">
              <input type="checkbox" :checked="selVideo.controls" @change="(e) => { selVideo.controls = (e.target as HTMLInputElement).checked; markDirty() }" />
              <span>Show controls</span>
            </label>
          </template>

          <!--=== CAROUSEL ====================================================-->
          <template v-else-if="selectedBlock.type === 'carousel'">
            <button type="button" class="detail-page__upload" @click="onAddCarouselImages">
              <Upload :size="14" />
              <span>Add image(s)</span>
            </button>
            <label class="detail-page__field">
              <span>Auto-advance</span>
              <select
                :value="String(selCarousel.intervalMs)"
                @change="(e) => { selCarousel.intervalMs = parseInt((e.target as HTMLSelectElement).value, 10); markDirty() }"
              >
                <option value="0">Manual only</option>
                <option value="3000">Every 3s</option>
                <option value="5000">Every 5s</option>
                <option value="8000">Every 8s</option>
              </select>
            </label>
            <p v-if="!selCarousel.items.length" class="detail-page__panel-hint">No slides yet - add images above.</p>
            <div v-for="(item, i) in selCarousel.items" :key="item.fileId + i" class="detail-page__item">
              <div class="detail-page__item-head">
                <img v-if="item.url" :src="item.url" alt="" class="detail-page__item-thumb" />
                <span class="detail-page__item-label">Slide {{ i + 1 }}</span>
                <button type="button" class="detail-page__item-btn" :disabled="i === 0" title="Move up" @click="moveCarouselItem(i, -1)"><ArrowUp :size="12" /></button>
                <button type="button" class="detail-page__item-btn" :disabled="i === selCarousel.items.length - 1" title="Move down" @click="moveCarouselItem(i, 1)"><ArrowDown :size="12" /></button>
                <button type="button" class="detail-page__item-btn detail-page__item-btn--danger" title="Remove slide" @click="removeCarouselItem(i)"><X :size="12" /></button>
              </div>
              <label class="detail-page__field">
                <span>Caption (FR)</span>
                <input type="text" :value="item.caption?.fr ?? ''" @input="(e) => { if (!item.caption) item.caption = { en: '', fr: '' }; item.caption.fr = (e.target as HTMLInputElement).value; markDirty() }" />
              </label>
              <label class="detail-page__field">
                <span>Caption (EN)</span>
                <input type="text" :value="item.caption?.en ?? ''" @input="(e) => { if (!item.caption) item.caption = { en: '', fr: '' }; item.caption.en = (e.target as HTMLInputElement).value; markDirty() }" />
              </label>
            </div>
          </template>

          <!--=== COMPARE =====================================================-->
          <template v-else-if="selectedBlock.type === 'compare'">
            <p class="detail-page__panel-hint">Two images split by a divider that follows the mouse.</p>
            <div class="detail-page__compare-row">
              <button type="button" class="detail-page__upload" @click="onPickCompare('before')">
                <Upload :size="14" />
                <span>{{ selCompare.beforeFileId ? "Replace before" : "Upload before" }}</span>
              </button>
              <img v-if="selCompare.beforeUrl" :src="selCompare.beforeUrl" alt="" class="detail-page__item-thumb" />
            </div>
            <div class="detail-page__compare-row">
              <button type="button" class="detail-page__upload" @click="onPickCompare('after')">
                <Upload :size="14" />
                <span>{{ selCompare.afterFileId ? "Replace after" : "Upload after" }}</span>
              </button>
              <img v-if="selCompare.afterUrl" :src="selCompare.afterUrl" alt="" class="detail-page__item-thumb" />
            </div>
            <label class="detail-page__field">
              <span>Before label (FR)</span>
              <input type="text" :value="selCompare.beforeLabel.fr" @input="(e) => { selCompare.beforeLabel.fr = (e.target as HTMLInputElement).value; markDirty() }" />
            </label>
            <label class="detail-page__field">
              <span>Before label (EN)</span>
              <input type="text" :value="selCompare.beforeLabel.en" @input="(e) => { selCompare.beforeLabel.en = (e.target as HTMLInputElement).value; markDirty() }" />
            </label>
            <label class="detail-page__field">
              <span>After label (FR)</span>
              <input type="text" :value="selCompare.afterLabel.fr" @input="(e) => { selCompare.afterLabel.fr = (e.target as HTMLInputElement).value; markDirty() }" />
            </label>
            <label class="detail-page__field">
              <span>After label (EN)</span>
              <input type="text" :value="selCompare.afterLabel.en" @input="(e) => { selCompare.afterLabel.en = (e.target as HTMLInputElement).value; markDirty() }" />
            </label>
          </template>

          <!--=== ACCORDION ===================================================-->
          <template v-else-if="selectedBlock.type === 'accordion'">
            <p class="detail-page__panel-hint">Collapsible sections. Body supports markdown.</p>
            <button type="button" class="detail-page__upload" @click="addAccordionItem">
              <Plus :size="14" />
              <span>Add section</span>
            </button>
            <div v-for="(item, i) in selAccordion.items" :key="i" class="detail-page__item">
              <div class="detail-page__item-head">
                <span class="detail-page__item-label">Section {{ i + 1 }}</span>
                <button type="button" class="detail-page__item-btn" :disabled="i === 0" title="Move up" @click="moveAccordionItem(i, -1)"><ArrowUp :size="12" /></button>
                <button type="button" class="detail-page__item-btn" :disabled="i === selAccordion.items.length - 1" title="Move down" @click="moveAccordionItem(i, 1)"><ArrowDown :size="12" /></button>
                <button type="button" class="detail-page__item-btn detail-page__item-btn--danger" title="Remove section" @click="removeAccordionItem(i)"><X :size="12" /></button>
              </div>
              <label class="detail-page__field">
                <span>Title (FR)</span>
                <input type="text" :value="item.title.fr" @input="(e) => { item.title.fr = (e.target as HTMLInputElement).value; markDirty() }" />
              </label>
              <label class="detail-page__field">
                <span>Title (EN)</span>
                <input type="text" :value="item.title.en" @input="(e) => { item.title.en = (e.target as HTMLInputElement).value; markDirty() }" />
              </label>
              <label class="detail-page__field">
                <span>Body FR (markdown)</span>
                <textarea rows="4" :value="item.body.fr" @input="(e) => { item.body.fr = (e.target as HTMLTextAreaElement).value; markDirty() }"></textarea>
              </label>
              <label class="detail-page__field">
                <span>Body EN (markdown)</span>
                <textarea rows="4" :value="item.body.en" @input="(e) => { item.body.en = (e.target as HTMLTextAreaElement).value; markDirty() }"></textarea>
              </label>
            </div>
          </template>

          <!--=== 3D VIEWER ===================================================-->
          <template v-else-if="selectedBlock.type === 'viewer3d'">
            <p class="detail-page__panel-hint">
              Pick which 3D model to embed and which named view to show on
              desktop / mobile. Models + views are managed in Settings →
              3D Models and per-model from the Views tab of the 3D editor.
            </p>
            <ModelPicker
              :model-value="selViewer"
              @update:model-value="(v: Viewer3dBlockContent) => { Object.assign(selectedBlock!.content, v); markDirty() }"
            />
          </template>
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

/*===== TOP BAR - brutalist header: hard border, index stamp, uppercase
title. The accent square next to the title is the only colored element,
everything else is monochrome + structure. =====*/
.detail-page__top {
  display: flex; align-items: center; gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: var(--border-width-md) solid var(--color-border-primary);
  flex-shrink: 0;
}
.detail-page__back {
  display: inline-flex; align-items: center; gap: var(--spacing-xxs);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  background: transparent; color: hsl(var(--foreground));
  border: var(--border-width-sm) solid var(--color-border-muted);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.detail-page__back:hover { color: var(--color-accent); border-color: var(--color-accent); }
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
.detail-page__save {
  display: inline-flex; align-items: center; gap: var(--spacing-xxs);
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-xs); font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  background-color: transparent;
  color: var(--color-accent);
  border: var(--border-width-sm) solid var(--color-accent);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.detail-page__save:hover:not(:disabled) { background-color: var(--color-accent); color: hsl(0 0% 0%); }
.detail-page__save:disabled { opacity: 0.4; cursor: not-allowed; }

/*===== BODY ===============================================================*/
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

/*===== VIEW MODE GRID - square corners, structural borders ===============*/
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

/*===== SIDE PANEL =========================================================*/
.detail-page__panel {
  width: 320px;
  flex-shrink: 0;
  padding: var(--spacing-lg);
  border-left: var(--border-width-md) solid var(--color-border-primary);
  overflow-y: auto;
  display: flex; flex-direction: column;
  gap: var(--spacing-lg);
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
.detail-page__panel-empty,
.detail-page__panel-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin: 0 0 var(--spacing-xs) 0;
  line-height: 1.4;
}
.detail-page__panel-empty { font-style: italic; }
/*Add-block buttons lay out 2-up so 7 types stay compact.*/
.detail-page__add-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-xs);
}
.detail-page__add,
.detail-page__upload {
  display: flex; align-items: center; gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-tight);
  background: transparent; color: hsl(var(--foreground));
  border: var(--border-width-sm) solid var(--color-gray-medium);
  cursor: pointer;
  touch-action: none;   /* drag from buttons works on touch */
  user-select: none;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.detail-page__add:hover,
.detail-page__upload:hover { color: var(--color-accent); border-color: var(--color-accent); }
.detail-page__remove {
  display: inline-flex; align-items: center;
  padding: var(--spacing-xxs) var(--spacing-xs);
  background: transparent; color: var(--color-text-tertiary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  cursor: pointer;
}
.detail-page__remove:hover { color: hsl(var(--destructive)); border-color: hsl(var(--destructive)); }
.detail-page__field {
  display: flex; flex-direction: column; gap: var(--spacing-xxs);
  font-size: var(--font-size-xs);
}
.detail-page__field > span {
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}
.detail-page__field input,
.detail-page__field textarea,
.detail-page__field select {
  padding: var(--spacing-xs);
  font-family: inherit;
  font-size: var(--font-size-xs);
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  border: var(--border-width-sm) solid var(--color-gray-medium);
  resize: vertical;
}
.detail-page__field textarea {
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  line-height: 1.4;
}
.detail-page__field input:focus,
.detail-page__field textarea:focus,
.detail-page__field select:focus { outline: none; border-color: var(--color-accent); }

/*Checkbox toggle rows for the video options.*/
.detail-page__toggle {
  display: flex; align-items: center; gap: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: hsl(var(--foreground));
  cursor: pointer;
}
.detail-page__toggle input { accent-color: var(--color-accent); cursor: pointer; }

/*List items in the panel (carousel slides, accordion sections).*/
.detail-page__item {
  display: flex; flex-direction: column; gap: var(--spacing-xs);
  padding: var(--spacing-xs);
  border: var(--border-width-sm) solid var(--color-gray-medium);
}
.detail-page__item-head {
  display: flex; align-items: center; gap: var(--spacing-xs);
}
.detail-page__item-label {
  flex: 1 1 auto;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-tight);
  color: var(--color-text-secondary);
}
.detail-page__item-thumb {
  width: var(--spacing-2xl); height: var(--spacing-xl);
  object-fit: cover;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  flex-shrink: 0;
}
.detail-page__item-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--spacing-lg); height: var(--spacing-lg);
  background: transparent;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  color: var(--color-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
}
.detail-page__item-btn:hover:not(:disabled) { color: var(--color-accent); border-color: var(--color-accent); }
.detail-page__item-btn--danger:hover:not(:disabled) { color: hsl(var(--destructive)); border-color: hsl(var(--destructive)); }
.detail-page__item-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.detail-page__compare-row {
  display: flex; align-items: center; gap: var(--spacing-xs);
}

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
