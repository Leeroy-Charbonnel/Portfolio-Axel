//DEFAULTS FOR THE 3D VIEWER, IN ONE PLACE.
//
//Each of these is the value used when a project carries no viewerSettings and
//the admin has never set the matching editor3d_* preference. They were written
//literally in five places across ThreeViewer.vue and ModelEditorPage.vue, so
//changing the wireframe tint meant finding all five and getting them to agree.
//
//The settings-table keys live here too: the editor writes them, the viewer reads
//them back through useEffectiveViewerSettings, and a typo in either half is a
//preference that silently stops applying.
export const VIEWER_DEFAULTS = {
  //tints the emissive picks and every new wireframe light
  wireframeModeColor: "#14b8a6",
  //the lines drawn over the model in wireframe mode
  wireframeLineColor: "#000000",
  //an unlit material with no colour of its own
  normalColor:        "#ffffff",
  wireframeOverlayOn: true,
  //ORBIT LIMITS, SHARED WITH THE EDITOR ON PURPOSE. They used to be declared in
  //both files and had drifted: the editor clamped to 0.5 / 20 while the viewer
  //allowed 0.05 / 200, so a view authored beyond 20 played in production and
  //could not be reached again in the editor.
  orbitMinDistance:   0.05,
  orbitMaxDistance:   200,
} as const

export const VIEWER_PREF_KEYS = {
  modeColor:      "editor3d_wireframe_mode_color",
  lineColor:      "editor3d_wireframe_line_color",
  materialParams: "editor3d_wireframe_material",
} as const
