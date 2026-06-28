<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { ArrowLeft, ImageIcon, Save, Trash2, Type, Upload } from "lucide-vue-next"
import { marked } from "marked"
import { useLanguage } from "../composables/useLanguage"
import { useAdmin } from "../composables/useAdmin"
import type {
  DetailBlock,
  DetailBlockType,
  DetailPage,
  MainProjectDto,
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

const route  = useRoute()
const router = useRouter()
const { lang }   = useLanguage()
const { editMode } = useAdmin()

const projectId   = computed(() => parseInt(String(route.params.id ?? ""), 10))
const project     = ref<MainProjectDto | null>(null)
const loading     = ref(true)
const loadError   = ref<string | null>(null)
const saving      = ref(false)
const status      = ref("")

const projectTitle = computed(() =>
  project.value ? (project.value.title[lang.value] || project.value.title.fr || project.value.title.en) : "",
)

const blocks      = ref<DetailBlock[]>([])
const selectedId  = ref<string | null>(null)
const selectedBlock = computed(() => blocks.value.find((b) => b.id === selectedId.value) ?? null)

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
  const c = block.content as { text: { en: string; fr: string } }
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
//(add, remove, move, resize, image swap). Ctrl+Z (or Cmd+Z) pops the last
//snapshot and restores it. Text content edits are not snapshotted - the
//textarea's native undo handles them, and capturing every keystroke would
//drown the stack. Reset on (re)load.
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
//MARKDOWN - text blocks store raw markdown source. The editor textarea
//shows the source as-is; the view mode and the edit-mode panel preview
//render the parsed HTML.
function renderMd(src: string): string {
  if (!src) return ""
  return marked.parse(src, { async: false, breaks: true, gfm: true }) as string
}

//===========================================================================
//GRID DIMENSIONS - the source of truth for both rendering AND pointer
//hit-testing. Pixel coords from a pointer event are projected onto cell
//coords using the same formula CSS Grid uses internally.
const GRID_COLS = 3
const MIN_GHOST_ROWS = 12  //empty editor still shows a usable canvas

const totalRows = computed(() => {
  let max = 0
  for (const b of blocks.value) if (b.y + b.h > max) max = b.y + b.h
  return Math.max(max, 1)
})

//MOBILE VIEW - blocks lay out in a single column. Per-block mobileY /
//mobileH override the desktop coords; when absent, fall back to desktop
//y / h so an unauthored project still renders.
function mobileY(b: DetailBlock): number { return b.mobileY ?? b.y }
function mobileH(b: DetailBlock): number { return b.mobileH ?? b.h }
const totalMobileRows = computed(() => {
  let max = 0
  for (const b of blocks.value) {
    const end = mobileY(b) + mobileH(b)
    if (end > max) max = end
  }
  return Math.max(max, 1)
})
const gridBgRows = computed(() => {
  let bottom = 0
  for (const b of blocks.value) if (b.y + b.h > bottom) bottom = b.y + b.h
  if (drag.value && drag.value.currentY + drag.value.currentH > bottom) {
    bottom = drag.value.currentY + drag.value.currentH
  }
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
  const gapPx = getCssPx(el, "--detail-gap") ?? 8
  const rowPx = getCssPx(el, "--detail-row-h") ?? 200
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
//RESIZE - SE handle (the only one for v1). On move, the block's width
//and height extend to cover whichever cell the pointer is over.
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
async function loadProject() {
  loading.value = true
  try {
    const r = await fetch("/api/portfolio")
    if (!r.ok) throw new Error(`${r.status}`)
    const data = await r.json() as { mainProjects: MainProjectDto[] }
    const p = data.mainProjects.find((mp) => mp.id === projectId.value)
    if (!p) { loadError.value = "Project not found"; return }
    project.value = p
    blocks.value  = (p.detailPage?.blocks ?? []).map((b) => ({ ...b }))
    //Fresh data → drop the undo history. Surviving past a save would
    //mean Ctrl+Z restoring something the user already committed to disk.
    undoStack.value = []
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function onSave() {
  if (saving.value) return
  saving.value = true
  status.value = "Saving..."
  const payload: DetailPage = {
    blocks: blocks.value.map((b) => {
      if (b.type === "image") {
        const c = b.content as { fileId: string | null; url: string | null; alt?: { en: string; fr: string } }
        return { ...b, content: { fileId: c.fileId, url: null, alt: c.alt } }
      }
      return b
    }),
  }
  try {
    const r = await fetch(`/api/main-project/${projectId.value}`, {
      method:      "PUT",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
      body:        JSON.stringify({ detailPage: payload }),
    })
    if (!r.ok) throw new Error(`save ${r.status}`)
    dirty.value = false
    status.value = "Saved"
    await loadProject()
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
function nextFreeY(): number {
  let max = 0
  for (const b of blocks.value) if (b.y + b.h > max) max = b.y + b.h
  return max
}
function addBlockAt(type: DetailBlockType, x: number, y: number) {
  const id = uniqueId()
  const w = 1, h = 1
  const clampedX = Math.max(0, Math.min(GRID_COLS - w, x))
  const clampedY = Math.max(0, y)
  //Refuse to add on top of an existing block. Caller already vets
  //drag-drop targets, but addBlock() (panel "click to append") could
  //hit a collision when nextFreeY landed on a sparse layout.
  if (wouldOverlap(clampedX, clampedY, w, h)) return
  snapshot()
  const base = { id, type, x: clampedX, y: clampedY, w, h }
  const block: DetailBlock = type === "text"
    ? { ...base, content: { text: { en: "", fr: "" } } }
    : { ...base, content: { fileId: null, url: null, alt: { en: "", fr: "" } } }
  blocks.value = [...blocks.value, block]
  selectedId.value = id
  markDirty()
}
function addBlock(type: DetailBlockType) {
  addBlockAt(type, 0, nextFreeY())
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
//IMAGE UPLOAD
const imageInput = ref<HTMLInputElement | null>(null)
async function onPickImage(e: Event) {
  const target = e.target as HTMLInputElement
  const f = target.files?.[0]
  if (!f) return
  if (!selectedBlock.value || selectedBlock.value.type !== "image") return
  status.value = "Uploading..."
  try {
    const fd = new FormData()
    fd.append("file", f)
    const r = await fetch("/api/files", { method: "POST", credentials: "include", body: fd })
    if (!r.ok) throw new Error(`upload ${r.status}`)
    const row = await r.json() as { id: string; url: string }
    snapshot()
    const c = selectedBlock.value.content as { fileId: string | null; url: string | null }
    c.fileId = row.id
    c.url    = row.url
    markDirty()
    status.value = ""
  } catch (err) {
    status.value = `Upload failed: ${(err as Error).message}`
  } finally {
    target.value = ""
  }
}

//===========================================================================
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push("/")
}

//===========================================================================
//KEYBOARD - Delete / Backspace removes the selected block; Ctrl/Cmd+Z
//pops the undo stack. We ignore the event when focus is in an input or
//textarea so the user can type backspace / native-undo in those.
function onKeyDown(e: KeyboardEvent) {
  if (!editMode.value) return
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
              :style="{
                gridColumnStart: block.x + 1,
                gridColumnEnd:   `span ${block.w}`,
                gridRowStart:    block.y + 1,
                gridRowEnd:      `span ${block.h}`,
                '--mobile-row-start': mobileY(block) + 1,
                '--mobile-row-span':  mobileH(block),
              }"
            >
              <div
                v-if="block.type === 'text'"
                class="detail-page__text detail-page__text--md"
                v-html="renderMd((block.content as { text: { en: string; fr: string } }).text[lang]
                  || (block.content as { text: { en: string; fr: string } }).text.fr
                  || (block.content as { text: { en: string; fr: string } }).text.en)"
              ></div>
              <img
                v-else-if="block.type === 'image' && (block.content as { url: string | null }).url"
                :src="(block.content as { url: string }).url"
                :alt="(block.content as { alt?: { en: string; fr: string } }).alt?.[lang] || (block.content as { alt?: { fr: string } }).alt?.fr || ''"
                class="detail-page__img"
              />
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
              <template v-if="block.type === 'text'">
                <!--Inline edit: dbl-click swaps the rendered markdown
                for a raw-source textarea on the CURRENT lang. Blur or
                Escape commits and re-renders. Side-panel textareas
                stay available for editing the OTHER locale.-->
                <textarea
                  v-if="editingId === block.id"
                  ref="inlineTextareaRef"
                  class="bento-block__text-edit"
                  :value="(block.content as { text: { en: string; fr: string } }).text[lang] ?? ''"
                  @input="(e) => onInlineInput(e, block)"
                  @blur="stopInlineEdit"
                  @keydown="onInlineKeyDown"
                  @pointerdown.stop
                ></textarea>
                <!--Live RENDERED markdown preview - matches the public
                view 1:1, so the author confirms formatting on the spot.-->
                <div
                  v-else
                  class="bento-block__text-md detail-page__text--md"
                  v-html="renderMd((block.content as { text: { en: string; fr: string } }).text[lang]
                    || (block.content as { text: { en: string; fr: string } }).text.fr
                    || (block.content as { text: { en: string; fr: string } }).text.en
                    || '_Empty text block (markdown)_')"
                ></div>
              </template>
              <template v-else-if="block.type === 'image'">
                <img
                  v-if="(block.content as { url: string | null }).url"
                  :src="(block.content as { url: string }).url"
                  class="bento-block__img"
                  alt=""
                />
                <div v-else class="bento-block__img-placeholder">
                  <ImageIcon :size="32" />
                  <span>No image</span>
                </div>
              </template>

              <!--SE resize handle - always rendered so it can fade in
              on hover; selected blocks keep it visible permanently.
              Stops propagation so its pointerdown doesn't start a
              move drag.-->
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
              <component :is="drag.type === 'text' ? Type : ImageIcon" :size="28" />
            </div>
          </div>
        </template>
      </main>

      <!--===== SIDE PANEL ====================================================-->
      <aside v-if="editMode" class="detail-page__panel">
        <div class="detail-page__panel-group">
          <h2 class="detail-page__panel-title">Add block</h2>
          <p class="detail-page__panel-hint">Click to append, or drag onto the grid to place anywhere.</p>
          <button
            type="button" class="detail-page__add"
            @pointerdown="onPanelButtonPointerDown($event, 'text')"
          >
            <Type :size="14" /> <span>Text</span>
          </button>
          <button
            type="button" class="detail-page__add"
            @pointerdown="onPanelButtonPointerDown($event, 'image')"
          >
            <ImageIcon :size="14" /> <span>Image</span>
          </button>
        </div>

        <div v-if="selectedBlock" class="detail-page__panel-group">
          <div class="detail-page__panel-head">
            <h2 class="detail-page__panel-title">Edit {{ selectedBlock.type }}</h2>
            <button type="button" class="detail-page__remove" @click="removeSelected" title="Delete block">
              <Trash2 :size="14" />
            </button>
          </div>

          <template v-if="selectedBlock.type === 'text'">
            <p class="detail-page__panel-hint">Markdown supported. Double-click the block to edit inline (current language).</p>
            <label class="detail-page__field">
              <span>FR (markdown source)</span>
              <textarea
                rows="6"
                :value="(selectedBlock.content as { text: { fr: string } }).text.fr"
                @input="(e) => { (selectedBlock!.content as { text: { fr: string } }).text.fr = (e.target as HTMLTextAreaElement).value; markDirty() }"
              ></textarea>
            </label>
            <label class="detail-page__field">
              <span>EN (markdown source)</span>
              <textarea
                rows="6"
                :value="(selectedBlock.content as { text: { en: string } }).text.en"
                @input="(e) => { (selectedBlock!.content as { text: { en: string } }).text.en = (e.target as HTMLTextAreaElement).value; markDirty() }"
              ></textarea>
            </label>
          </template>

          <template v-else-if="selectedBlock.type === 'image'">
            <button type="button" class="detail-page__upload" @click="imageInput?.click()">
              <Upload :size="14" />
              <span>{{ (selectedBlock.content as { fileId: string | null }).fileId ? "Replace image" : "Upload image" }}</span>
            </button>
            <input ref="imageInput" type="file" accept="image/*" hidden @change="onPickImage" />
            <label class="detail-page__field">
              <span>Alt (FR)</span>
              <input
                type="text"
                :value="(selectedBlock.content as { alt?: { fr: string } }).alt?.fr ?? ''"
                @input="(e) => { const c = selectedBlock!.content as { alt?: { en: string; fr: string } }; if (!c.alt) c.alt = { en: '', fr: '' }; c.alt.fr = (e.target as HTMLInputElement).value; markDirty() }"
              />
            </label>
            <label class="detail-page__field">
              <span>Alt (EN)</span>
              <input
                type="text"
                :value="(selectedBlock.content as { alt?: { en: string } }).alt?.en ?? ''"
                @input="(e) => { const c = selectedBlock!.content as { alt?: { en: string; fr: string } }; if (!c.alt) c.alt = { en: '', fr: '' }; c.alt.en = (e.target as HTMLInputElement).value; markDirty() }"
              />
            </label>
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
  background-color: var(--background);
  color:          var(--foreground);

  /* Bento dims - exposed via CssVarsPanel "Detail page" group. */
  --detail-row-h: var(--detail-grid-row-h, 200px);
  --detail-gap:   var(--detail-grid-gap, 8px);
  --detail-max-w: var(--detail-grid-max-width, 1200px);
}

/*===== TOP BAR ============================================================*/
.detail-page__top {
  display: flex; align-items: center; gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
  flex-shrink: 0;
}
.detail-page__back {
  display: inline-flex; align-items: center; gap: var(--spacing-xxs);
  padding: var(--spacing-xxs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  background: transparent; color: var(--foreground);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius); cursor: pointer;
}
.detail-page__back:hover { background: var(--color-gray-light); }
.detail-page__title {
  flex: 1 1 auto;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  margin: 0;
}
.detail-page__status {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}
.detail-page__save {
  display: inline-flex; align-items: center; gap: var(--spacing-xxs);
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-xs); font-weight: var(--font-weight-bold);
  background-color: var(--color-accent); color: hsl(0 0% 0%);
  border: none; border-radius: var(--radius); cursor: pointer;
}
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
}
.detail-page__msg--err { color: hsl(0 80% 60%); }

/*===== VIEW MODE GRID =====================================================*/
.detail-page__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--detail-gap);
  max-width: var(--detail-max-w);
  margin: 0 auto;
}
.detail-page__block {
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  background-color: var(--color-gray-light);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius);
}
.detail-page__text {
  margin: 0;
  padding: var(--spacing-md);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  width: 100%; height: 100%;
  overflow: auto;
}
/* Heading sizes - markdown isn't visibly markdown until h1/h2/h3 actually
look bigger than body text. Pulled from --font-size-* tokens so they
scale with the rest of the type system. */
.detail-page__text--md :deep(h1) {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: 1.2;
}
.detail-page__text--md :deep(h2) {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  margin: var(--spacing-xs) 0 var(--spacing-xs) 0;
  line-height: 1.25;
}
.detail-page__text--md :deep(h3) {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  margin: var(--spacing-xs) 0 var(--spacing-xxs) 0;
  line-height: 1.3;
}
.detail-page__text--md :deep(p)      { margin: 0 0 var(--spacing-xs) 0; }
.detail-page__text--md :deep(strong) { font-weight: var(--font-weight-bold); }
.detail-page__text--md :deep(em)     { font-style: italic; }
.detail-page__text--md :deep(ul),
.detail-page__text--md :deep(ol) { margin: 0 0 var(--spacing-xs) var(--spacing-md); padding: 0; }
.detail-page__text--md :deep(li)     { margin-bottom: var(--spacing-xxs); }
.detail-page__text--md :deep(a)      { color: var(--color-accent); text-decoration: underline; }
.detail-page__text--md :deep(code) {
  font-family: monospace;
  background: hsl(0 0% 100% / 0.06);
  padding: 0 var(--spacing-xxs); border-radius: 2px;
}
.detail-page__text--md :deep(blockquote) {
  margin: 0 0 var(--spacing-xs) 0;
  padding-left: var(--spacing-sm);
  border-left: var(--border-width-md) solid var(--color-gray-medium);
  color: var(--color-text-tertiary);
}
.detail-page__img {
  width: 100%; height: 100%; object-fit: cover; display: block;
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
  border-radius: var(--radius);
  opacity: 0.4;
}

.bento-block {
  background-color: var(--color-gray-light);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius);
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
  outline: var(--border-width-sm) solid var(--color-accent);
  outline-offset: -2px;
}
.bento-block--phantom {
  background-color: hsl(0 0% 100% / 0.08);
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
  background-color: hsl(0 70% 50% / 0.18);
  border-color:     hsl(0 80% 60%);
  outline:          var(--border-width-sm) solid hsl(0 80% 60%);
  outline-offset:   -2px;
  color:            hsl(0 80% 70%);
}
/* Rendered markdown inside the edit-mode bento block. Same look as
the public view (.detail-page__text--md does the typography); this
rule only handles the box - padding + scrolling. Children are non-
interactive so a click on a link inside doesn't navigate, the whole
tile keeps acting as the drag handle. */
.bento-block__text-md {
  margin: 0;
  padding: var(--spacing-sm);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  width: 100%; height: 100%;
  overflow: auto;
  word-break: break-word;
  pointer-events: none;
}
/* Inline source editor - swapped in on dbl-click for the active lang.
Stops the parent move-drag via @pointerdown.stop in the template;
this rule restores normal text cursor + selection. */
.bento-block__text-edit {
  margin: 0;
  padding: var(--spacing-sm);
  width: 100%; height: 100%;
  background-color: var(--background);
  color: var(--foreground);
  border: none;
  outline: none;
  resize: none;
  font-family: monospace;
  font-size: 0.78rem;
  line-height: 1.45;
  cursor: text;
  /* Override the bento-grid's touch-action: none so caret placement
  by touch (mobile) and text selection still work in the textarea. */
  touch-action: auto;
  user-select: text;
}
.bento-block__img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.bento-block__img-placeholder {
  display: flex; flex-direction: column;
  align-items: center; gap: var(--spacing-xs);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}
.bento-block__resize {
  position: absolute;
  bottom: -7px; right: -7px;
  width: 16px; height: 16px;
  background: var(--color-accent);
  border: 2px solid var(--background);
  border-radius: 50%;
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
  border-left: var(--border-width-sm) solid var(--color-gray-medium);
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
  color: var(--color-text-tertiary);
  margin: 0;
}
.detail-page__panel-empty,
.detail-page__panel-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin: 0 0 var(--spacing-xs) 0;
  line-height: 1.4;
}
.detail-page__panel-empty { font-style: italic; }
.detail-page__add,
.detail-page__upload {
  display: flex; align-items: center; gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  background: transparent; color: var(--foreground);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius); cursor: pointer;
  touch-action: none;   /* drag from buttons works on touch */
  user-select: none;
}
.detail-page__add:hover,
.detail-page__upload:hover { background: var(--color-gray-light); }
.detail-page__remove {
  display: inline-flex; align-items: center;
  padding: var(--spacing-xxs) var(--spacing-xs);
  background: transparent; color: var(--color-text-tertiary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius); cursor: pointer;
}
.detail-page__remove:hover { color: hsl(0 80% 60%); border-color: hsl(0 80% 60%); }
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
.detail-page__field textarea {
  padding: var(--spacing-xs);
  font-family: inherit;
  font-size: var(--font-size-xs);
  background-color: var(--background);
  color: var(--foreground);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  border-radius: var(--radius);
  resize: vertical;
}
.detail-page__field textarea {
  font-family: monospace;
  font-size: 0.78rem;
  line-height: 1.4;
}
.detail-page__field input:focus,
.detail-page__field textarea:focus { outline: none; border-color: var(--color-accent); }

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
}
</style>
