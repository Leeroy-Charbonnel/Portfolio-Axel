<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { Trash2, RefreshCw } from "lucide-vue-next"
import { usePortfolio } from "../../composables/usePortfolio"
import { useConfirm } from "../../composables/useConfirm"

//Admin-only file manager. Lists every row in the file table with a usage
//count and lets the admin delete individual files (only when unused).
//No bulk delete - the author inspects and removes rows manually since
//HDRs / 3D models can carry useful orphans (alternate-pose variants)
//that shouldn't be auto-killed.
//
//Three sub-tabs:
//- Images: ordinary image uploads (project main / thumbnails / gallery).
//  Software logos are NOT shown here - they're managed in SoftwareEditor.
//- 3D models: .glb / .gltf
//- HDRs: .hdr / .exr / .hdri

interface FileRow {
  id:               string
  originalFilename: string
  storedFilename:   string
  mimeType:         string
  sizeBytes:        number
  kind:             string
  createdAt:        string
  referenceCount:   number
  url:              string
}

const { data: portfolioData, reload: reloadPortfolio } = usePortfolio()
const { confirm } = useConfirm()

const files   = ref<FileRow[]>([])
const loading = ref(false)
const error   = ref<string | null>(null)

//Software logo file ids - excluded from the file list so logos only live
//in the SoftwareEditor.
const softwareLogoIds = computed<Set<string>>(() => {
  const ids = (portfolioData.value?.software ?? []).map((s) => s.logoFileId).filter((v): v is string => Boolean(v))
  return new Set(ids)
})

function isHdr(filename: string): boolean    { return /\.(hdr|exr|hdri)$/i.test(filename) }
function isModel(filename: string): boolean  { return /\.(glb|gltf)$/i.test(filename) }

type TabKey = "images" | "models" | "hdrs"
const TABS: { key: TabKey; label: string }[] = [
  { key: "images", label: "Images" },
  { key: "models", label: "3D models" },
  { key: "hdrs",   label: "HDRs" },
]
const currentTab = ref<TabKey>("images")

//Bucket every file row into one of the three sub-tabs. Software logos
//are kept out of the Images tab since SoftwareEditor manages them.
const filesByTab = computed<Record<TabKey, FileRow[]>>(() => {
  const out: Record<TabKey, FileRow[]> = { images: [], models: [], hdrs: [] }
  for (const f of files.value) {
    if (isHdr(f.originalFilename))                 out.hdrs.push(f)
    else if (isModel(f.originalFilename))          out.models.push(f)
    else if (!softwareLogoIds.value.has(f.id))     out.images.push(f)
  }
  return out
})

const visibleFiles = computed(() => filesByTab.value[currentTab.value])

//Per-tab summary stats. No bulk delete - the author wants to inspect
//and remove rows manually now that HDRs / 3D models can carry useful
//orphans (alternate-pose variants etc.) that shouldn't be auto-killed.
const orphanCount = computed(() => visibleFiles.value.filter((f) => f.referenceCount === 0).length)
const totalSize   = computed(() => visibleFiles.value.reduce((a, f) => a + f.sizeBytes, 0))

function tabCount(key: TabKey): number { return filesByTab.value[key].length }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function load() {
  loading.value = true
  error.value = null
  try {
    //Refresh /api/portfolio in parallel so softwareLogoIds stays in sync
    //with whatever logos were just up/down-loaded - otherwise stale
    //logoFileIds let the matching file row leak into the Images tab.
    const [res] = await Promise.all([
      fetch("/api/files", { credentials: "include" }),
      reloadPortfolio(),
    ])
    if (!res.ok) throw new Error(`GET /api/files -> ${res.status}`)
    files.value = await res.json()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    console.error("[FileManager] load failed:", e)
  } finally {
    loading.value = false
  }
}

async function deleteOne(file: FileRow) {
  if (file.referenceCount > 0) return
  const ok = await confirm({
    title:  "Delete this file?",
    what:   `${file.originalFilename} is removed from disk for good.`,
    action: "Delete",
    destructive: true,
  })
  if (!ok) return
  try {
    const res = await fetch(`/api/files/${file.id}`, { method: "DELETE", credentials: "include" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `DELETE returned ${res.status}`)
    }
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(load)
</script>

<template>
  <section class="file-manager">
    <header class="file-manager__header">
      <div>
        <h2 class="file-manager__title">Files</h2>
        <p class="file-manager__summary">
          {{ visibleFiles.length }} total · {{ formatBytes(totalSize) }}
          · <strong>{{ orphanCount }} unreferenced</strong>
        </p>
      </div>
      <div class="file-manager__actions">
        <button class="file-manager__reload" :disabled="loading" @click="load">
          <RefreshCw :size="14" />
          <span>Reload</span>
        </button>
      </div>
    </header>

    <!--SUB-TAB strip: Images / 3D models / HDRs. Active count badge shows
    how many rows each tab holds.-->
    <nav class="file-manager__tabs" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        role="tab"
        class="file-manager__tab"
        :class="{ 'file-manager__tab--active': currentTab === t.key }"
        @click="currentTab = t.key"
      >
        <span>{{ t.label }}</span>
        <span class="file-manager__tab-count">{{ tabCount(t.key) }}</span>
      </button>
    </nav>

    <p v-if="error" class="file-manager__error">{{ error }}</p>

    <table
      v-if="!loading || files.length > 0"
      class="file-manager__table"
      :class="{ 'file-manager__table--refreshing': loading }"
    >
      <thead>
        <tr>
          <th class="file-manager__th file-manager__th--preview"></th>
          <th class="file-manager__th">Filename</th>
          <th class="file-manager__th file-manager__th--num">Size</th>
          <th class="file-manager__th file-manager__th--num">Refs</th>
          <th class="file-manager__th file-manager__th--action"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="file in visibleFiles"
          :key="file.id"
          class="file-manager__row"
          :class="{ 'file-manager__row--orphan': file.referenceCount === 0 }"
        >
          <td class="file-manager__td">
            <div class="file-manager__preview">
              <img v-if="file.kind === 'image'" :src="file.url" :alt="file.originalFilename" />
              <span v-else class="file-manager__preview-tag">{{ file.kind }}</span>
            </div>
          </td>
          <td class="file-manager__td">
            <div class="file-manager__filename">{{ file.originalFilename }}</div>
            <div class="file-manager__uuid">{{ file.id }}</div>
          </td>
          <td class="file-manager__td file-manager__td--num">{{ formatBytes(file.sizeBytes) }}</td>
          <td class="file-manager__td file-manager__td--num">
            <span
              class="file-manager__ref"
              :class="{ 'file-manager__ref--orphan': file.referenceCount === 0 }"
            >{{ file.referenceCount }}</span>
          </td>
          <td class="file-manager__td file-manager__td--action">
            <button
              class="file-manager__delete"
              :disabled="file.referenceCount > 0"
              :title="file.referenceCount > 0 ? 'In use — cannot delete' : 'Delete this file'"
              @click="deleteOne(file)"
            >
              <Trash2 :size="14" />
            </button>
          </td>
        </tr>
        <tr v-if="visibleFiles.length === 0">
          <td colspan="5" class="file-manager__empty">No files yet.</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="file-manager__loading">Loading...</p>

  </section>
</template>

<style scoped>
.file-manager {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.file-manager__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--spacing-lg);
  flex-wrap: wrap;
}

.file-manager__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-normal);
  text-transform: uppercase;
  color: var(--color-text-hover);
}

.file-manager__summary {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-xxs);
}

.file-manager__summary strong { color: var(--color-text); }

.file-manager__actions {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.file-manager__reload {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background-color: transparent;
  color: var(--color-text-secondary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.file-manager__reload:hover:not(:disabled) {
  color: var(--color-text-hover);
  border-color: var(--color-accent);
}

.file-manager__reload:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/*SUB-TAB strip*/
.file-manager__tabs {
  display: flex;
  gap: 0;
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
  margin-bottom: calc(-1 * var(--spacing-md));
}
.file-manager__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: transparent;
  border: none;
  border-bottom: var(--border-width-md) solid transparent;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
  margin-bottom: -1px;
}
.file-manager__tab:hover { color: var(--color-text-hover); }
.file-manager__tab--active {
  color: var(--color-text-hover);
  border-bottom-color: var(--color-accent);
}
.file-manager__tab-count {
  font-size: 0.625rem; /*deliberately below --font-size-xs - tiny count badge, no smaller token exists*/
  padding: 0 var(--spacing-xs);
  background-color: var(--color-background-gray-100);
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.file-manager__tab--active .file-manager__tab-count {
  background-color: hsl(var(--primary) / 0.18);
  color: var(--color-text-hover);
}

.file-manager__error {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: hsl(var(--destructive) / 0.1);
  border-left: var(--border-width-md) solid hsl(var(--destructive));
  color: hsl(var(--destructive));
  font-size: var(--font-size-sm);
}

/*TABLE*/
.file-manager__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.file-manager__th {
  padding: var(--spacing-sm) var(--spacing-sm);
  text-align: left;
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
}

.file-manager__th--num    { text-align: right; }
.file-manager__th--action { width: var(--spacing-3xl); }
.file-manager__th--preview { width: 64px; }

.file-manager__td {
  padding: var(--spacing-sm);
  border-bottom: var(--border-width-sm) solid var(--color-gray-dark);
  vertical-align: middle;
}

.file-manager__td--num    { text-align: right; font-variant-numeric: tabular-nums; }
.file-manager__td--action { text-align: right; }

.file-manager__row--orphan { background-color: hsl(var(--destructive) / 0.05); }

.file-manager__preview {
  width: 48px;
  height: 48px;
  background-color: var(--color-background-gray-100);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.file-manager__preview img { width: 100%; height: 100%; object-fit: cover; }

.file-manager__preview-tag {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
}

.file-manager__filename {
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
}

.file-manager__uuid {
  font-size: var(--font-size-xs);
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-xxs);
}

.file-manager__ref {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--spacing-lg);
  padding: 0 var(--spacing-xs);
  background-color: var(--color-background-gray-100);
  color: var(--color-text-hover);
  font-weight: var(--font-weight-bold);
}

.file-manager__ref--orphan {
  background-color: hsl(var(--destructive) / 0.2);
  color: hsl(var(--destructive));
}

.file-manager__delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--spacing-xl);
  height: var(--spacing-xl);
  background-color: transparent;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.file-manager__delete:hover:not(:disabled) {
  color: var(--color-text-hover);
  border-color: hsl(var(--destructive));
  background-color: hsl(var(--destructive) / 0.6);
}

.file-manager__delete:disabled { opacity: 0.3; cursor: not-allowed; }

.file-manager__empty,
.file-manager__loading {
  padding: var(--spacing-xl);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

@media (max-width: 600px) {
  .file-manager__uuid { display: none; }
  .file-manager__th--preview, .file-manager__preview { display: none; }
}

/*a reload keeps the rows in place and dims them, rather than replacing the
table with a line of text and letting the panel collapse*/
.file-manager__table--refreshing {
  opacity: 0.55;
  pointer-events: none;
}
</style>
