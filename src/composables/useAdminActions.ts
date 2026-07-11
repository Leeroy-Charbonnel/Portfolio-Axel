import { ref, type Ref } from "vue"

//SHARED admin-actions state - module scoped (project rule #7). Pages
//that own a save round-trip (the detail-page editor today) register
//their action here; AdminGear renders a Save button LEFT of the
//read/edit toggle whenever an action is registered and edit mode is on.
//Pages must clear the registration on unmount.

export interface AdminSaveAction {
  dirty:  Ref<boolean>
  saving: Ref<boolean>
  run:    () => void
}

const saveAction = ref<AdminSaveAction | null>(null)

export function useAdminActions() {
  function registerSave(action: AdminSaveAction) {
    saveAction.value = action
  }
  function unregisterSave() {
    saveAction.value = null
  }
  return { saveAction, registerSave, unregisterSave }
}
