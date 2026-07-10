import { computed, type ComputedRef, type Ref } from "vue"
import type { EditorPrefsDto, MainProjectDto, PortfolioDto } from "../types/portfolio"

//EFFECTIVE viewer settings - merges the source's viewerSettings jsonb
//with the admin's GLOBAL editor3d_* prefs (line color, mode color,
//shared material). The globals ALWAYS win over what was
//frozen at save time so a tweak in the editor propagates to every model
//on the site instead of being stuck on whichever was last saved.
//
//SOURCE precedence: when the project has a model3dId, the attached
//model_3d row owns the viewerSettings + named views. Otherwise the
//legacy project.viewerSettings is used (pre-migration / projects
//that haven't been moved to the model_3d pipeline yet).
//
//VIEW pick: when sourcing from a model, project.model3dDesktopView /
//model3dMobileView name which entry of model.views to apply as
//startView. mobile=true uses model3dMobileView (falls back to desktop).
//Without a model: the legacy startViewMobile field on viewerSettings
//is honored.

//Layer the admin's GLOBAL editor3d_* prefs over a settings snapshot.
//Exported so every ThreeViewer consumer (MainProject via the composable
//below, Viewer3dBlock directly) applies the same "globals win" rule.
//raw/next are jsonb blobs with no stable schema - `any` is the honest
//type here, narrowing happens inside ThreeViewer at apply time.
export function applyEditorPrefs(raw: any, prefs: EditorPrefsDto | undefined): any {
  const next: any = raw
    ? { ...raw, wireframeMode: { ...(raw.wireframeMode ?? {}) } }
    : { wireframeMode: {} }
  if (prefs?.wireframeLineColor) next.wireframeMode.overlayColor = prefs.wireframeLineColor
  if (prefs?.wireframeModeColor) next.wireframeMode.color        = prefs.wireframeModeColor
  if (prefs?.wireframeMaterial) {
    try {
      next.wireframeMode.material = JSON.parse(prefs.wireframeMaterial)
    } catch (e) {
      //corrupt global pref: keep the per-model material but leave a trace
      console.warn("[applyEditorPrefs] malformed editor3d_wireframe_material pref, ignored:", e)
    }
  }
  return next
}

export function useEffectiveViewerSettings(
  project: Ref<MainProjectDto> | ComputedRef<MainProjectDto> | { value: MainProjectDto },
  portfolioData: Ref<PortfolioDto | null>,
  opts: { mobile?: boolean } = {},
) {
  return computed(() => {
    const proj   = project.value
    const models = portfolioData.value?.models ?? []
    const model  = proj.model3dId ? models.find((m) => m.id === proj.model3dId) ?? null : null
    const raw    = (model?.viewerSettings ?? proj.viewerSettings ?? null) as any
    const next   = applyEditorPrefs(raw, portfolioData.value?.editorPrefs)

    if (model) {
      const wantedName = opts.mobile
        ? (proj.model3dMobileView || proj.model3dDesktopView)
        : proj.model3dDesktopView
      const view = wantedName ? model.views.find((v) => v.name === wantedName) : null
      if (view) {
        next.startView = { pos: view.position, target: view.target }
      }
    } else if (opts.mobile && raw?.startViewMobile) {
      //LEGACY phone-specific start pose
      next.startView = raw.startViewMobile
    }
    return next
  })
}

//Resolve the .glb URL the same way useEffectiveViewerSettings resolves
//its source: model first (when attached), legacy project field as
//fallback. Returned as a computed so the template just binds it.
export function useResolvedGlbUrl(
  project: Ref<MainProjectDto> | ComputedRef<MainProjectDto> | { value: MainProjectDto },
  portfolioData: Ref<PortfolioDto | null>,
) {
  return computed(() => {
    const proj   = project.value
    const models = portfolioData.value?.models ?? []
    const model  = proj.model3dId ? models.find((m) => m.id === proj.model3dId) ?? null : null
    return model?.glbUrl ?? proj.glbUrl ?? null
  })
}
