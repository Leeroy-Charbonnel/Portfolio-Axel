import { shallowRef, type Ref } from "vue"

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

//shallowRef ON PURPOSE: a deep ref() would run the registered object
//through reactive(), which UNWRAPS the nested dirty / saving refs -
//AdminGear's `.dirty.value` reads would then hit undefined and the Save
//button would stay disabled forever. shallowRef keeps the inner refs
//intact; reading them in a template still tracks reactivity.
const saveAction = shallowRef<AdminSaveAction | null>(null)

export function useAdminActions() {
  function registerSave(action: AdminSaveAction) {
    saveAction.value = action
  }
  function unregisterSave() {
    saveAction.value = null
  }
  return { saveAction, registerSave, unregisterSave }
}
