import { computed, type ComputedRef, type Ref } from "vue"
import type { EditorPrefsDto, MainProjectDto, PortfolioDto } from "../types/portfolio"

//EFFECTIVE viewer settings - merges the per-project viewerSettings jsonb
//with the admin's GLOBAL editor3d_* prefs (line color, mode color, shared
//material, edge threshold). The globals ALWAYS win over what was frozen
//into the project at save time so a tweak in the editor propagates to
//every model on the site instead of being stuck on whichever project was
//last saved with it.
//
//mobile=true also swaps in startViewMobile over startView when the
//project has a phone-specific camera pose - keeps MainProjectPhone in
//sync with the editor's "Save phone start" button.

export function useEffectiveViewerSettings(
  project: Ref<MainProjectDto> | ComputedRef<MainProjectDto> | { value: MainProjectDto },
  portfolioData: Ref<PortfolioDto | null>,
  opts: { mobile?: boolean } = {},
) {
  return computed(() => {
    const raw   = (project.value.viewerSettings as any) ?? null
    const prefs: EditorPrefsDto | undefined = portfolioData.value?.editorPrefs
    const next: any = raw
      ? { ...raw, wireframeMode: { ...(raw.wireframeMode ?? {}) } }
      : { wireframeMode: {} }

    //phone-specific start pose wins when present and we're rendering on phone
    if (opts.mobile && raw?.startViewMobile) next.startView = raw.startViewMobile

    if (prefs?.wireframeLineColor) next.wireframeMode.overlayColor = prefs.wireframeLineColor
    if (prefs?.wireframeModeColor) next.wireframeMode.color        = prefs.wireframeModeColor
    if (prefs?.wireframeMaterial) {
      try { next.wireframeMode.material = JSON.parse(prefs.wireframeMaterial) } catch { /*malformed - ignore*/ }
    }
    if (prefs?.wireframeEdgeThreshold) {
      const n = parseFloat(prefs.wireframeEdgeThreshold)
      if (Number.isFinite(n)) next.wireframeMode.edgeThresholdDeg = n
    }
    return next
  })
}
