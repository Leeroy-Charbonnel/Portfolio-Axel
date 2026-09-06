<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useConfirm } from "../composables/useConfirm"

//THE ONE CONFIRMATION IN THE APP. Mounted once in App.vue; every caller goes
//through useConfirm().confirm(). Nothing else in the project should build a
//confirmation of its own.

const { open, request, accept, dismiss } = useConfirm()

const confirmButton = ref<HTMLButtonElement | null>(null)

//the confirming button takes focus, so Enter answers and Escape refuses without
//reaching for the mouse. Focus moves after the paint that mounts it.
watch(open, async (isOpen) => {
  if (!isOpen) return
  await new Promise(requestAnimationFrame)
  confirmButton.value?.focus()
})

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === "Escape") {
    e.preventDefault()
    dismiss()
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown))
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div
        v-if="open && request"
        class="confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        @click.self="dismiss"
      >
        <div class="confirm__box">
          <h2 id="confirm-title" class="confirm__title">{{ request.title }}</h2>
          <p v-if="request.what" class="confirm__what">{{ request.what }}</p>

          <div class="confirm__actions">
            <button type="button" class="confirm__cancel" @click="dismiss">Cancel</button>
            <button
              ref="confirmButton"
              type="button"
              class="confirm__accept"
              :class="{ 'confirm__accept--destructive': request.destructive }"
              @click="accept"
            >
              {{ request.action }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm {
  position: fixed;
  inset: 0;
  z-index: var(--z-confirm);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);
  background-color: var(--overlay-bg);
  backdrop-filter: blur(var(--filter-blur));
}

.confirm__box {
  width: 100%;
  max-width: var(--confirm-width);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  background-color: hsl(var(--card));
  border: var(--border-width-sm) solid hsl(var(--border-color));
  border-radius: var(--radius);
}

.confirm__title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: hsl(var(--foreground));
}

.confirm__what {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

.confirm__cancel,
.confirm__accept {
  padding: var(--spacing-xs) var(--spacing-md);
  border: var(--border-width-sm) solid hsl(var(--border-color));
  border-radius: var(--radius);
  background: transparent;
  color: hsl(var(--foreground));
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
}

/*only the colours move: a thicker border here would resize the button*/
.confirm__cancel:hover {
  border-color: hsl(var(--foreground));
}

.confirm__accept {
  border-color: hsl(var(--primary));
  background-color: hsl(var(--primary) / 0.15);
}

.confirm__accept:hover {
  background-color: hsl(var(--primary) / 0.3);
}

.confirm__accept--destructive {
  border-color: hsl(var(--destructive));
  background-color: hsl(var(--destructive) / 0.15);
  color: hsl(var(--destructive));
}

.confirm__accept--destructive:hover {
  background-color: hsl(var(--destructive) / 0.3);
}

.confirm__accept:focus-visible,
.confirm__cancel:focus-visible {
  outline: none;
  box-shadow: 0 0 0 var(--border-width-md) hsl(var(--primary));
}

.confirm-enter-active,
.confirm-leave-active {
  transition: opacity var(--transition-fast);
}

.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}
</style>
