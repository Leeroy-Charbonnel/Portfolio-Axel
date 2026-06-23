import { nextTick, ref, watch, type Ref } from "vue"

//SKETCHFAB iframe lifecycle - boots the API when the section scrolls into
//view, tears down + re-inits when the v-if'd iframe gets re-mounted (e.g.
//toggling edit mode), kills every UI overlay so only the canvas paints.
//
//Shared by MainProject and MainProjectPhone since both render a Sketchfab
//iframe fallback when the project has no .glb uploaded.

declare global {
  interface Window {
    Sketchfab: any
  }
}

interface UseSketchfabViewerOpts {
  iframeRef: Ref<HTMLIFrameElement | null>
  modelId:   Ref<string | null | undefined>
  isInView:  Ref<boolean>
  editMode:  Ref<boolean>
  logTag?:   string
}

export function useSketchfabViewer({ iframeRef, modelId, isInView, editMode, logTag = "Sketchfab" }: UseSketchfabViewerOpts) {
  const initialized = ref(false)
  const loaded      = ref(false)
  const error       = ref(false)
  const isLoading   = ref(false)

  //Sketchfab client - plain ref, not reactive. We hold on to it so the
  //v-if re-mount can null it before re-init; the API instance itself is
  //handed off to Sketchfab so we don't need to keep it here.
  let client: any = null

  function init() {
    if (!iframeRef.value || !isInView.value || initialized.value) return
    if (!modelId.value) return
    if (typeof window.Sketchfab !== "function") {
      console.warn(`[${logTag}] Sketchfab viewer script not loaded yet`)
      error.value = true
      return
    }

    isLoading.value   = true
    initialized.value = true

    try {
      client = new window.Sketchfab(iframeRef.value)
      client.init(modelId.value, {
        success: (a: any) => {
          a.start()
          loaded.value    = true
          isLoading.value = false
        },
        error: () => {
          console.error(`[${logTag}] Sketchfab API initialization failed`)
          error.value     = true
          isLoading.value = false
        },
        autostart:    1,
        preload:      1,
        //KILL every Sketchfab UI overlay - keep only the canvas. Cursor still
        //orbits/pans the model, but no toolbar, no help text, no watermark,
        //no fullscreen button, no settings, no annotations, no AR.
        ui_animations:       0,
        ui_controls:         0,
        ui_general_controls: 0,
        ui_help:             0,
        ui_hint:             0,
        ui_infos:            0,
        ui_inspector:        0,
        ui_settings:         0,
        ui_sound:            0,
        ui_start:            0,
        ui_stop:             0,
        ui_theatre:          0,
        ui_vr:               0,
        ui_watermark:        0,
        ui_fullscreen:       0,
        ui_annotations:      0,
        ui_ar:               0,
        ui_loading:          0,
        //transparent background so the 3D model floats on the page bg
        //instead of sitting in a visible iframe rectangle
        transparent: 1,
      })
    } catch (err) {
      console.error(`[${logTag}] Error initializing Sketchfab:`, err)
      error.value     = true
      isLoading.value = false
    }
  }

  //Boot once the parent IO sees us in-view, but only when not in edit
  //(edit mode v-ifs the iframe out so there'd be nothing to bind to).
  watch(isInView, (val) => {
    if (val && !initialized.value && !editMode.value) init()
  })

  //Switching between edit and view modes tears down + re-mounts the
  //iframe via v-if. The Sketchfab API was bound to the previous iframe
  //instance so it ends up dead after the toggle. Reset the state machine
  //when going back to view mode and re-init once the iframe is back.
  watch(editMode, async (newVal) => {
    if (newVal === false && modelId.value) {
      initialized.value = false
      loaded.value      = false
      error.value       = false
      isLoading.value   = false
      client            = null
      await nextTick()
      if (isInView.value) init()
    }
  })

  return { initialized, loaded, error, isLoading, init }
}
