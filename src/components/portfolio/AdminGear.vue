<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import { useRouter } from "vue-router"
import { Settings as Gear, BookOpen, Pencil, Save, SlidersHorizontal, Paintbrush, LogOut } from "lucide-vue-next"
import { useAdmin } from "../../composables/useAdmin"
import { useAdminActions } from "../../composables/useAdminActions"
import { useCssVarsPanel } from "../../composables/useCssVarsPanel"

//Admin-only entry point. Renders nothing for visitors. For admins, a
//button cluster top-right: an optional Save button (registered by pages
//that own a save round-trip, e.g. the detail-page editor), a book/pen
//toggle (book = read mode, pen = edit mode, click to switch) and a gear
//dropdown with settings / css / sign-out.

const router = useRouter()
const { isAdmin, editMode, toggleEdit, signOut } = useAdmin()
const { saveAction } = useAdminActions()
const { show: showCssPanel } = useCssVarsPanel()

const open        = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

function close() { open.value = false }

function onClickOutside(e: MouseEvent) {
  if (!open.value) return
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) close()
}

function onEsc(e: KeyboardEvent) {
  if (e.key === "Escape") close()
}

onMounted(() => {
  document.addEventListener("click",   onClickOutside)
  document.addEventListener("keydown", onEsc)
})

onUnmounted(() => {
  document.removeEventListener("click",   onClickOutside)
  document.removeEventListener("keydown", onEsc)
})

function goSettings() {
  close()
  router.push("/settings")
}

function openCssPanel() {
  close()
  showCssPanel()
}

async function handleSignOut() {
  close()
  await signOut()
}
</script>

<template>
  <div v-if="isAdmin" ref="dropdownRef" class="admin-gear">
    <!--SAVE - shown when the current page registered a save action and
    edit mode is on. Always clickable (no dirty detection - a click just
    saves); only a save already in flight blocks a re-click.-->
    <button
      v-if="saveAction && editMode"
      type="button"
      class="admin-gear__btn"
      :disabled="saveAction.saving.value"
      :data-tooltip="saveAction.saving.value ? 'Saving...' : 'Save'"
      aria-label="Save"
      @click="saveAction.run()"
    >
      <Save :size="18" />
    </button>

    <!--READ / EDIT toggle - book means "you are reading", pen means "you
    are editing". One click flips the mode.-->
    <button
      type="button"
      class="admin-gear__btn"
      :class="{ 'admin-gear__btn--active': editMode }"
      :aria-label="editMode ? 'Editing — switch to read mode' : 'Reading — switch to edit mode'"
      :data-tooltip="editMode ? 'Editing — click to read' : 'Reading — click to edit'"
      @click="toggleEdit()"
    >
      <component :is="editMode ? Pencil : BookOpen" :size="18" />
    </button>

    <button
      type="button"
      class="admin-gear__btn"
      :aria-expanded="open"
      aria-label="Admin menu"
      @click="open = !open"
    >
      <Gear :size="18" />
    </button>

    <Transition name="admin-gear">
      <div v-if="open" class="admin-gear__menu" role="menu">
        <button class="admin-gear__item" role="menuitem" @click="openCssPanel">
          <Paintbrush :size="14" />
          <span>Customize CSS</span>
        </button>
        <button class="admin-gear__item" role="menuitem" @click="goSettings">
          <SlidersHorizontal :size="14" />
          <span>Settings</span>
        </button>
        <div class="admin-gear__divider"></div>
        <button class="admin-gear__item admin-gear__item--danger" role="menuitem" @click="handleSignOut">
          <LogOut :size="14" />
          <span>Sign out</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.admin-gear {
  position: fixed;
  top:   var(--spacing-md);
  right: calc(var(--spacing-md) + var(--spacing-5xl));
  z-index: 200;
  display: flex;
  gap: var(--spacing-xxs);
}

.admin-gear__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-2xl);
  height: var(--spacing-2xl);
  color: var(--color-text);
  border: var(--border-width-sm) solid var(--color-border-muted);
  background-color: var(--semi-transparent-dark);
  backdrop-filter: blur(var(--filter-blur));
  cursor: pointer;
  transition: color var(--transition-fast) ease, border-color var(--transition-fast) ease;
}

.admin-gear__btn:hover:not(:disabled) { color: var(--color-text-hover); }
.admin-gear__btn:disabled { opacity: 0.4; cursor: not-allowed; }

.admin-gear__btn--active {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

/*Tooltip under the toggle so the icon meaning is discoverable.*/
.admin-gear__btn[data-tooltip] { position: relative; }
.admin-gear__btn[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  top: calc(100% + var(--spacing-xs));
  right: 0;
  padding: var(--spacing-xxs) var(--spacing-sm);
  background-color: var(--color-background-secondary);
  color: var(--color-text);
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-tight);
  white-space: nowrap;
  pointer-events: none;
  z-index: 100;
}

/*DROPDOWN*/
.admin-gear__menu {
  position: absolute;
  top:   calc(100% + var(--spacing-sm));
  right: 0;
  min-width: 180px;
  background-color: var(--color-background-secondary);
  border: var(--border-width-sm) solid var(--color-border-muted);
  padding: var(--spacing-xxs);
  backdrop-filter: blur(var(--filter-blur));
  display: flex;
  flex-direction: column;
}

.admin-gear__item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-xs);
  text-align: left;
  letter-spacing: var(--letter-spacing-tight);
  color: var(--color-text);
  cursor: pointer;
  transition: background-color var(--transition-fast) ease, color var(--transition-fast) ease;
}

.admin-gear__item:hover {
  background-color: var(--color-background-gray-100);
  color: var(--color-text-hover);
}

.admin-gear__item--danger:hover { color: hsl(var(--destructive)); }

.admin-gear__divider {
  height: var(--border-width-sm);
  background-color: var(--color-gray-medium);
  margin: var(--spacing-xxs) 0;
}

/*TRANSITION*/
.admin-gear-enter-active,
.admin-gear-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.admin-gear-enter-from,
.admin-gear-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
