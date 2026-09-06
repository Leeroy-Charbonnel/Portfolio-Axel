import { ref } from "vue"

//CONFIRMATION - module-level state, like useLightbox: any component calls
//confirm() and the single <ConfirmDialog /> mounted in App.vue answers.
//
//It replaces three different behaviours for one use case: window.confirm in the
//file manager and the 3D editor, and nothing at all on the RemoveButtons that
//delete a project, a gallery card or an experience. A native confirm cannot be
//styled, blocks the whole tab, and is suppressed outright by some browsers when
//it fires outside a user gesture.

export interface ConfirmRequest {
  title:   string
  //optional line under the title, for naming what is about to go
  what?:   string
  //label of the confirming button
  action:  string
  //paints that button red, for something that destroys
  destructive?: boolean
}

const open    = ref(false)
const request = ref<ConfirmRequest | null>(null)

//the promise the caller is waiting on, settled by accept() or dismiss()
let settle: ((ok: boolean) => void) | null = null

//awaits the click and resolves true only if the confirming button was used.
//Escape, the backdrop and the cancel button all resolve false, so `if (!await
//confirm(...)) return` is the whole calling convention.
function confirm(req: ConfirmRequest): Promise<boolean> {
  //a second call while one is open answers the first with false rather than
  //leaving its caller waiting forever
  settle?.(false)
  request.value = req
  open.value    = true
  return new Promise<boolean>((resolve) => { settle = resolve })
}

function finish(ok: boolean) {
  open.value = false
  settle?.(ok)
  settle = null
}

export function useConfirm() {
  return {
    open,
    request,
    confirm,
    accept:  () => finish(true),
    dismiss: () => finish(false),
  }
}
