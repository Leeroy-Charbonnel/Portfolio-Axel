<script setup lang="ts">
import { useToast } from "../composables/useToast"
import { X } from "lucide-vue-next"

const { toasts, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="vsui-toast-host" role="region" aria-live="polite" aria-label="Notifications">
      <TransitionGroup name="vsui-toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['vsui-toast', `vsui-toast--${toast.type}`]"
          role="status"
        >
          <div class="vsui-toast__body">
            <p v-if="toast.title" class="vsui-toast__title">{{ toast.title }}</p>
            <p class="vsui-toast__message">{{ toast.message }}</p>
          </div>
          <button
            class="vsui-toast__close"
            type="button"
            aria-label="Dismiss"
            @click="dismiss(toast.id)"
          >
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style>
/*BASE LAYOUT - kept minimal; projects override colors/borders/sizes via the .vsui-toast* classes*/
.vsui-toast-host {
  position: fixed;
  top:      var(--vsui-space-lg);
  right:    var(--vsui-space-lg);
  z-index:  var(--vsui-z-toast);
  display:  flex;
  flex-direction: column;
  gap:      var(--vsui-space-sm);
  pointer-events: none;
  max-width: min(var(--vsui-panel-lg), calc(100vw - var(--vsui-space-xl)));
}

.vsui-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: var(--vsui-space-sm);
  padding: var(--vsui-space-md) var(--vsui-space-lg);
  border-radius: var(--vsui-radius);
  box-shadow: var(--vsui-shadow);
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  font-size: var(--vsui-text-sm);
  line-height: 1.4;
}

.vsui-toast__body {
  flex: 1;
  min-width: 0;
}

.vsui-toast__title {
  font-weight: 600;
  margin-bottom: var(--vsui-space-2xs);
}

.vsui-toast__message {
  word-break: break-word;
}

.vsui-toast__close {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.5;
  padding: var(--vsui-space-2xs);
  transition: opacity var(--vsui-transition-fast);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.vsui-toast__close:hover {
  opacity: 1;
}

/*MOBILE - dock at the bottom above the nav*/
@media (max-width: 720px) {
  .vsui-toast-host {
    top: auto;
    bottom: calc(var(--vsui-nav-height-mobile) + var(--vsui-space-lg));
    left:  var(--vsui-space-lg);
    right: var(--vsui-space-lg);
    max-width: none;
  }
}

/*TRANSITIONS*/
.vsui-toast-enter-active,
.vsui-toast-leave-active {
  transition: transform var(--vsui-transition), opacity var(--vsui-transition);
}

.vsui-toast-enter-from,
.vsui-toast-leave-to {
  opacity: 0;
  transform: translateX(var(--vsui-space-lg));
}

@media (max-width: 720px) {
  .vsui-toast-enter-from,
  .vsui-toast-leave-to {
    transform: translateY(var(--vsui-space-lg));
  }
}
</style>
