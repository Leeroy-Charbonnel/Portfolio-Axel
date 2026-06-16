<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { Trash2, AlertTriangle, RefreshCw } from "lucide-vue-next"

//Admin-only file manager. Lists every row in the file table with a usage
//count, lets the admin delete individual files (only when unused) and bulk-
//delete every orphan in one click (with a confirm modal).

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

const files   = ref<FileRow[]>([])
const loading = ref(false)
const error   = ref<string | null>(null)

const showBulkConfirm = ref(false)
const bulkInFlight    = ref(false)

const orphans     = computed(() => files.value.filter((f) => f.referenceCount === 0))
const orphanCount = computed(() => orphans.value.length)
const totalSize   = computed(() => files.value.reduce((a, f) => a + f.sizeBytes, 0))
const orphanSize  = computed(() => orphans.value.reduce((a, f) => a + f.sizeBytes, 0))

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
    const res = await fetch("/api/files", { credentials: "include" })
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
  if (!window.confirm(`Delete ${file.originalFilename}?\n\nThis permanently removes the file from disk.`)) return
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

async function deleteOrphans() {
  bulkInFlight.value = true
  try {
    const res = await fetch("/api/files/orphans", { method: "DELETE", credentials: "include" })
    if (!res.ok) throw new Error(`DELETE /api/files/orphans -> ${res.status}`)
    await load()
    showBulkConfirm.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    bulkInFlight.value = false
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
          {{ files.length }} total · {{ formatBytes(totalSize) }} ·
          <strong>{{ orphanCount }} unreferenced</strong> ({{ formatBytes(orphanSize) }})
        </p>
      </div>
      <div class="file-manager__actions">
        <button class="file-manager__reload" :disabled="loading" @click="load">
          <RefreshCw :size="14" />
          <span>Reload</span>
        </button>
        <button
          class="file-manager__bulk"
          :disabled="orphanCount === 0"
          @click="showBulkConfirm = true"
        >
          <Trash2 :size="14" />
          <span>Delete {{ orphanCount }} unreferenced</span>
        </button>
      </div>
    </header>

    <p v-if="error" class="file-manager__error">{{ error }}</p>

    <table v-if="!loading" class="file-manager__table">
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
          v-for="file in files"
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
        <tr v-if="files.length === 0">
          <td colspan="5" class="file-manager__empty">No files yet.</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="file-manager__loading">Loading...</p>

    <!--BULK DELETE confirmation modal-->
    <div v-if="showBulkConfirm" class="file-manager__modal-backdrop" @click.self="showBulkConfirm = false">
      <div class="file-manager__modal">
        <div class="file-manager__modal-icon">
          <AlertTriangle :size="24" />
        </div>
        <h3 class="file-manager__modal-title">Delete {{ orphanCount }} unreferenced file{{ orphanCount > 1 ? "s" : "" }} ?</h3>
        <p class="file-manager__modal-body">
          This will permanently delete <strong>{{ orphanCount }} file{{ orphanCount > 1 ? "s" : "" }}</strong>
          ({{ formatBytes(orphanSize) }}) from disk and from the database.
          They aren't used anywhere in the portfolio.
          <br><br>
          <strong>This cannot be undone.</strong>
        </p>
        <div class="file-manager__modal-actions">
          <button class="file-manager__modal-cancel" :disabled="bulkInFlight" @click="showBulkConfirm = false">
            Cancel
          </button>
          <button class="file-manager__modal-confirm" :disabled="bulkInFlight" @click="deleteOrphans">
            <Trash2 :size="14" />
            <span>{{ bulkInFlight ? "Deleting..." : `Delete ${orphanCount} file${orphanCount > 1 ? "s" : ""}` }}</span>
          </button>
        </div>
      </div>
    </div>
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

.file-manager__reload,
.file-manager__bulk {
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

.file-manager__bulk:hover:not(:disabled) {
  color: var(--color-text-hover);
  border-color: hsl(var(--destructive));
  background-color: hsl(var(--destructive) / 0.1);
}

.file-manager__bulk:disabled,
.file-manager__reload:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

/*MODAL*/
.file-manager__modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: hsl(var(--background) / 0.85);
  backdrop-filter: blur(var(--filter-blur));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-md);
}

.file-manager__modal {
  max-width: 32rem;
  width: 100%;
  background-color: var(--color-background-secondary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  padding: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.file-manager__modal-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--spacing-2xl);
  height: var(--spacing-2xl);
  background-color: hsl(var(--destructive) / 0.15);
  color: hsl(var(--destructive));
}

.file-manager__modal-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-hover);
  letter-spacing: var(--letter-spacing-tight);
}

.file-manager__modal-body {
  color: var(--color-text);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.file-manager__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.file-manager__modal-cancel,
.file-manager__modal-confirm {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.file-manager__modal-cancel {
  background-color: transparent;
  color: var(--color-text-secondary);
  border: var(--border-width-sm) solid var(--color-gray-medium);
}

.file-manager__modal-cancel:hover:not(:disabled) {
  color: var(--color-text-hover);
  border-color: var(--color-text);
}

.file-manager__modal-confirm {
  background-color: hsl(var(--destructive));
  color: var(--color-text-hover);
  border: var(--border-width-sm) solid hsl(var(--destructive));
}

.file-manager__modal-confirm:hover:not(:disabled) {
  background-color: hsl(var(--destructive) / 0.85);
}

.file-manager__modal-cancel:disabled,
.file-manager__modal-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 600px) {
  .file-manager__uuid { display: none; }
  .file-manager__th--preview, .file-manager__preview { display: none; }
}
</style>
