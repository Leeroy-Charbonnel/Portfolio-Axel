import { ref } from "vue"

//Module-scoped open/close state for the global CSS variables side panel.
//Following the project rule of preferring module composables over
//provide/inject so the AdminGear (trigger) and the panel host in App.vue
//read the same ref by import rather than by injection key.

const open = ref(false)

export function useCssVarsPanel() {
  return {
    open,
    show:   () => { open.value = true  },
    hide:   () => { open.value = false },
    toggle: () => { open.value = !open.value },
  }
}
