<script setup lang="ts">
import { computed, markRaw, onMounted, onBeforeUnmount, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useSettings } from "vue-shared-ui"
import { ArrowLeft, Box, ChevronDown, Circle, Crosshair, Eye, EyeOff, Grid, Home, Lightbulb, LightbulbOff, MapPin, Monitor, Save, Smartphone, Square, Sun, Upload } from "lucide-vue-next"
import {
  Box3,
  BufferGeometry,
  Color,
  type Material,
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  HalfFloatType,
  EdgesGeometry,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  OctahedronGeometry,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  PMREMGenerator,
  Raycaster,
  RGBAFormat,
  Scene,
  ShadowMaterial,
  Sphere,
  Texture,
  UnsignedByteType,
  Vector2,
  Matrix4,
  Quaternion,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three"
import { OrbitControls }     from "three/examples/jsm/controls/OrbitControls.js"
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js"
import { GLTFLoader }        from "three/examples/jsm/loaders/GLTFLoader.js"
import { HDRLoader }         from "three/examples/jsm/loaders/HDRLoader.js"
import { EXRLoader }         from "three/examples/jsm/loaders/EXRLoader.js"
import { EffectComposer }    from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass }        from "three/examples/jsm/postprocessing/RenderPass.js"
import { OutputPass }        from "three/examples/jsm/postprocessing/OutputPass.js"
import { SMAAPass }          from "three/examples/jsm/postprocessing/SMAAPass.js"
import { ViewHelper }        from "three/examples/jsm/helpers/ViewHelper.js"

//MODEL EDITOR - 4-tab side panel design:
//  - Materials  : per-material accordion. Click a mesh in scene to open it
//  - HDR        : library of uploaded HDRs (drop / list / thumbnails)
//  - Lights     : NORMAL mode rig (lights + HDR picker)
//  - Wireframe  : WIREFRAME mode rig (lights + HDR picker + shared mat + emissive picks)
//
//Wireframe mode is bound to the tab: selecting Wireframe enables it,
//leaving disables. The two modes have separate light lists and HDR
//selections, sharing only the same UI patterns.

//===========================================================================
//PANEL STATE
//===========================================================================
const canvas      = ref<HTMLCanvasElement | null>(null)
const viewportBox = ref<HTMLDivElement | null>(null)
const status      = ref("Loading...")

//Route + project being edited
const route  = useRoute()
const router = useRouter()
const projectId = computed(() => parseInt(String(route.params.id ?? ""), 10))
const projectTitle = ref<string>("")
const glbUrl       = ref<string | null>(null)
const isUploadingGlb = ref(false)
const glbUploadError = ref<string | null>(null)
const isSaving       = ref(false)
const saveError      = ref<string | null>(null)

type Tab = "materials" | "hdr" | "lights" | "wireframe"
const TABS: { key: Tab; label: string }[] = [
  { key: "materials", label: "Materials" },
  { key: "hdr",       label: "HDR"       },
  { key: "lights",    label: "Lights"    },
  { key: "wireframe", label: "Wireframe" },
]
const tab = ref<Tab>("materials")

//===========================================================================
//EDITOR CONSTANTS - centralized so the magic numbers don't drift across
//handlers. Tweak here, not in the call sites.
//===========================================================================
//Editor canvas aspect - must match MainProject's viewer aspect so the
//author frames the shot WYSIWYG. Production viewer renders at the same
//aspect (see main-project__stage style).
const TARGET_ASPECT = 16 / 9
//Camera animation timings (ms). axisSnap is short to keep view-change
//responsive; goToStart is medium for visible motion; selectGizmo is
//short so attaching to a light feels instant.
const AXIS_SNAP_DURATION_MS    = 500
const GO_TO_START_DURATION_MS  = 800
const GIZMO_SELECT_DURATION_MS = 500
//Light defaults
const POINT_LIGHT_INTENSITY        = 2
const DIRECTIONAL_LIGHT_INTENSITY  = 1.5
const POINT_LIGHT_DECAY            = 2
const POINT_LIGHT_RANGE_DEFAULT    = 0   //0 = infinite
const SHADOW_MAP_SIZE              = 1024
const SHADOW_BIAS                  = -0.0002
const SHADOW_NORMAL_BIAS           = 0.02
//Shadow camera default frustum (before tuneShadowCameras takes over with
//bounding-sphere sizing on glb load)
const SHADOW_DEFAULT_HALF_EXTENT   = 5
const SHADOW_DEFAULT_NEAR          = 0.1
const SHADOW_DEFAULT_FAR           = 25
//Gizmo helper visuals
const LIGHT_GIZMO_RADIUS           = 0.14
const WIREFRAME_LINE_OPACITY       = 0.9
const WIREFRAME_OVERLAY_RENDER_ORDER = 998
const LIGHT_GIZMO_RENDER_ORDER     = 999
//Wireframe overlay threshold - edges between adjacent faces below this
//angle (deg) are filtered. Keeps mesh "hard" edges only.
const WIREFRAME_EDGE_THRESHOLD_DEG = 1
//Wireframe material polygonOffset - matches ThreeViewer so editor and
//production render lines at the same z-depth (no z-fighting / no x-ray).
const POLYGON_OFFSET_FACTOR        = 1
const POLYGON_OFFSET_UNITS         = 1
//Ground plane (shadow catcher) - same setup as ThreeViewer.
const GROUND_SIZE                  = 40
const GROUND_OPACITY               = 0.35
//Camera defaults
const CAMERA_FOV                   = 35
const CAMERA_NEAR                  = 0.01
const CAMERA_FAR                   = 1000
//Renderer
const MAX_PIXEL_RATIO              = 1.5
//OrbitControls range. Generous so a saved start view at any radius is fine.
const ORBIT_MIN_DISTANCE           = 0.5
const ORBIT_MAX_DISTANCE           = 20
//Directional-link line opacity
const DIRECTIONAL_LINK_OPACITY     = 0.4
//PointerUp click vs drag (px)
const POINTER_DRAG_THRESHOLD = 5
//Auto-deactivate render after this many ms of idle, to save battery.
const RENDER_KEEPALIVE_MS_DEFAULT = 300
//Per-light hover swatch tint (mesh pick color too)
const PICK_COLOR = 0xff7a00

//===========================================================================
//MATERIALS - one entry per unique material in the loaded glb
//===========================================================================
type MaterialEntry = {
  displayName:       string
  material:          MeshPhysicalMaterial
  color:             string
  emissive:          string
  metalness:         number
  roughness:         number
  envMapIntensity:   number
  specularIntensity: number
  emissiveIntensity: number
  expanded:          boolean
  thumbnail:         string | null
  emissiveEnabled:   boolean
}
const materials = ref<MaterialEntry[]>([])

function openMaterialFor(mesh: Mesh) {
  const mat = mesh.material as MeshPhysicalMaterial
  if (!mat) return
  for (const m of materials.value) m.expanded = (m.material.uuid === mat.uuid)
}

//===========================================================================
//SCENE MESH INVENTORY + EMISSIVE PICKER
//===========================================================================
type SceneMesh = { mesh: Mesh; name: string }
const sceneMeshes = ref<SceneMesh[]>([])

const pickedMeshIdx = ref<number | null>(null)

//Confirmed emissive picks - per-mesh intensity, so each mesh gets its
//own MeshPhysicalMaterial cloned from wfBaseMat plus its own emission.
type EmissiveEntry = { uuid: string; intensity: number; material: MeshPhysicalMaterial }
const emissiveList = ref<EmissiveEntry[]>([])

function isEmissiveMesh(uuid: string): boolean {
  return emissiveList.value.some((e) => e.uuid === uuid)
}
function findEmissive(uuid: string): EmissiveEntry | undefined {
  return emissiveList.value.find((e) => e.uuid === uuid)
}

const emissiveEntries = computed(() =>
  emissiveList.value
    .map((e) => {
      const sm = sceneMeshes.value.find((s) => s.mesh.uuid === e.uuid)
      return sm ? { entry: e, name: sm.name } : null
    })
    .filter((x): x is { entry: EmissiveEntry; name: string } => Boolean(x)),
)

const pickedMeshName = computed(() => {
  if (pickedMeshIdx.value === null) return null
  return sceneMeshes.value[pickedMeshIdx.value]?.name ?? null
})

//===========================================================================
//HDR LIBRARY (HDR tab) + per-mode active selection
//===========================================================================
type HdrEntry = {
  id:        string
  url:       string
  name:      string
  thumbnail: string | null
}
const hdris        = ref<HdrEntry[]>([])
const hdrUploading = ref(false)
const hdrError     = ref<string | null>(null)
const hdrDragOver  = ref(false)
const showSkybox   = ref(false)
const proceduralThumbnail = ref<string | null>(null)

//"" = procedural sky default, "<id>" = an HdrEntry id
const normalHdrId    = ref<string>("")
const normalHdrIntensity = ref(1)
const wfHdrId        = ref<string>("")
const wfHdrIntensity = ref(1)

let currentEnvSource: Texture | null = null

//===========================================================================
//LIGHT SYSTEM - shared API for both normal and wireframe mode lists
//===========================================================================
type LightType = "point" | "directional"
type LightMode = "normal" | "wireframe"

//SHARED LIGHT - position + range + type are common to both modes; only
//intensity + color differ per mode. The author places a light once and
//tunes how each mode renders it independently. The live three.js light
//object's intensity / color are swapped in/out by applyLightsForMode()
//whenever we enter or leave wireframe mode.
type LightEntry = {
  id:        string
  type:      LightType
  light:     PointLight | DirectionalLight
  sourceGiz: Mesh   //small sphere at the source position (gizmo target)
  target?:   Mesh   //small sphere at the target position (directional only)
  link?:     Line   //thin line between source and target (directional only)
  x: number; y: number; z: number          //source position
  tx?: number; ty?: number; tz?: number    //target position (directional only)
  range?:    number                        //point-light only (three.js "distance", 0 = infinite)
  normalIntensity: number
  normalColor:     string
  wfIntensity:     number
  wfColor:         string
  //per-light toggles - enabled flips light.visible, castShadow drives
  //three.js shadow rendering on this individual lamp
  enabled:    boolean
  castShadow: boolean
}

const lights = ref<LightEntry[]>([])

const selectedLightId = ref<string | null>(null)

//===========================================================================
//WIREFRAME MODE
//===========================================================================
const wireframeMode      = ref(false)
const wireframeEmissive  = ref(2)
const wireframeOverlayOn    = ref(true)
//SWEEP - per-project knobs for the diagonal reveal animation. The axis
//is a free vec3 (normalized at runtime), the start/end offsets are in %
//of the bbox projected on that axis so 0% = "first vertex hit" and 100%
//= "last vertex hit". Defaults reproduce the auto-bbox X sweep.
const sweepAxis  = ref<[number, number, number]>([1, 0, 0])
const sweepStart = ref(0)
const sweepEnd   = ref(100)

//SETTINGS-TABLE backed editor preferences. The settings table is the
//canonical store (project rule #5: if a value lives in the DB, it does
//NOT live in localStorage). Keys live under the editor3d_ namespace so
//they show up grouped on the /settings page if the admin wants to see
//them. update() is self-seeding, so first write also creates the row.
const { getString, update: updateSetting, loaded: settingsLoaded } = useSettings()

//Mode color tints emissive picks + is the default for new wf lights.
//Global like the line color + material params: lives in the settings
//table so a tweak in one project follows the author into every other.
const wireframeColor = ref(getString("editor3d_wireframe_mode_color", "#14b8a6"))
const WF_LINE_COLOR_KEY  = "editor3d_wireframe_line_color"
const WF_MAT_PARAMS_KEY  = "editor3d_wireframe_material"
const WF_MODE_COLOR_KEY  = "editor3d_wireframe_mode_color"
//Edge-threshold degrees: EdgesGeometry drops every edge between faces
//whose normals differ by LESS than this. Low values keep almost every
//edge (so flat triangulation diagonals show through); high values keep
//only sharp corners. Global pref so it applies to every project.
const WF_EDGE_THRESHOLD_KEY = "editor3d_wireframe_edge_threshold"

const wireframeOverlayColor = ref(getString(WF_LINE_COLOR_KEY, "#000000"))
const wireframeEdgeThreshold = ref(parseFloat(getString(WF_EDGE_THRESHOLD_KEY, "1")) || 1)
const showLightGizmos       = ref(true)        //sphere/diamond helpers visibility
const showCenterCrosshair   = ref(false)       //semi-transparent + sign on screen center for framing

//START VIEW - persisted camera pose used by the production viewer for the
//intro fly-in. Set from the editor via "Save start view" - captures the
//current cameraRef.position + controls.target so the public viewer can
//land precisely where the author framed the shot. Null = no preference,
//the viewer falls back to its bounding-box framing.
const startView       = ref<{ pos: [number, number, number]; target: [number, number, number] } | null>(null)
//Mobile variant - production viewer uses this when the visitor is on a
//phone-width device. Author can frame a tighter / different shot for
//mobile so the model reads well at the narrower aspect.
const startViewMobile = ref<{ pos: [number, number, number]; target: [number, number, number] } | null>(null)

//ACCORDION expanded state for the panel sub-sections (Lights + Wireframe tabs)
const sectionOpen = ref({
  lightsHdr:    false,
  lightsList:   false,
  wfMode:       false,
  wfHdr:        false,
  wfMaterial:   false,
  //Wireframe tab also shows the Lights list as a read-only-tweak section
  //(add/remove are Lights-tab only); this controls its accordion state.
  wfLights:     false,
  wfEmissive:   false,
})

//Wireframe shared materials. Mesh.material is REPLACED (ref swap) on
//entering wireframe mode and restored from a snapshot on exit. Three
//instances cover all cases:
//   wfBaseMat     : plain gray, edited from the Wireframe tab
//   wfEmissiveMat : same base but with emissive = mode color
//   wfPickMat     : same base but with emissive = orange (selection)
//
//WF MATERIAL PARAMS are GLOBAL across every project - persisted in the
//settings table (key WF_MAT_PARAMS_KEY, JSON-encoded). Per-project
//hydration intentionally ignores s.wireframeMode.material; the global
//setting wins. The current save still emits material into the project
//payload for back-compat with viewers that read it directly.
type WfMaterialParams = {
  color:             string
  metalness:         number
  roughness:         number
  envMapIntensity:   number
  specularIntensity: number
}
const WF_MAT_PARAMS_DEFAULT: WfMaterialParams = {
  color:             "#808080",
  metalness:         0,
  roughness:         0.5,
  envMapIntensity:   1,
  specularIntensity: 1,
}
function parseWfMatParams(raw: string): WfMaterialParams {
  if (!raw) return { ...WF_MAT_PARAMS_DEFAULT }
  try {
    const parsed = JSON.parse(raw) as Partial<WfMaterialParams>
    return { ...WF_MAT_PARAMS_DEFAULT, ...parsed }
  } catch { return { ...WF_MAT_PARAMS_DEFAULT } }
}
const wfMatParams = ref<WfMaterialParams>(parseWfMatParams(getString(WF_MAT_PARAMS_KEY, "")))

let wfBaseMat: MeshPhysicalMaterial | null = null
let wfPickMat: MeshPhysicalMaterial | null = null

//=== SWEEP machinery - mirror of ThreeViewer's so the editor can preview
//the animation when the wireframe toggle fires. Same shader injection
//(uWfProgress, uWfTint, uWfAxis, uWfMin, uWfRange) and same world-bbox
//projection routine.
const WF_SWEEP_DURATION_MS = 1500
const wfPatchedMaterials = new Set<string>()
const wfShaders: { mat: Material; shader: { uniforms: Record<string, { value: unknown }> } }[] = []
let   wfBox: Box3 | null = null
let   wfMin   = 0
let   wfRange = 1
let   wfAxis  = new Vector3(1, 0, 0)
let   wfTransition: { startTime: number; from: number; to: number; duration: number; phase: "enter" | "leave" } | null = null

function patchMaterialForSweep(material: Material) {
  if (wfPatchedMaterials.has(material.uuid)) return
  wfPatchedMaterials.add(material.uuid)
  const prev = material.onBeforeCompile?.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer)
    shader.uniforms.uWfProgress = { value: wireframeMode.value ? 1 : 0 }
    shader.uniforms.uWfTint     = { value: new Color(wfMatParams.value.color) }
    shader.uniforms.uWfAxis     = { value: wfAxis.clone() }
    shader.uniforms.uWfMin      = { value: wfMin }
    shader.uniforms.uWfRange    = { value: wfRange }

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWfWorldPos;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvWfWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWfWorldPos;\nuniform float uWfProgress;\nuniform vec3 uWfTint;\nuniform vec3 uWfAxis;\nuniform float uWfMin;\nuniform float uWfRange;",
      )
      //Inject BEFORE PBR lighting: replace diffuseColor with the tint so
      //the full lighting pipeline runs on the wireframe color. This way
      //the swept portion of the surface looks identical to wfBaseMat
      //instead of being a sRGB blend on top of the lit original color.
      .replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n" +
        "float wfT = (dot(vWfWorldPos, uWfAxis) - uWfMin) / max(uWfRange, 0.0001);\n" +
        "float wfP = uWfProgress * 1.04 - 0.02;\n" +
        "float wfMask = 1.0 - smoothstep(wfP - 0.02, wfP + 0.02, wfT);\n" +
        "diffuseColor.rgb = mix(diffuseColor.rgb, uWfTint, wfMask);\n",
      )

    wfShaders.push({ mat: material, shader: shader as unknown as { uniforms: Record<string, { value: unknown }> } })
  }
  material.needsUpdate = true
}

function recomputeSweepRange() {
  if (!wfBox) return
  const ax = new Vector3(sweepAxis.value[0], sweepAxis.value[1], sweepAxis.value[2])
  if (ax.lengthSq() < 0.0001) ax.set(1, 0, 0)
  ax.normalize()
  wfAxis = ax
  const corners = [
    new Vector3(wfBox.min.x, wfBox.min.y, wfBox.min.z),
    new Vector3(wfBox.min.x, wfBox.min.y, wfBox.max.z),
    new Vector3(wfBox.min.x, wfBox.max.y, wfBox.min.z),
    new Vector3(wfBox.min.x, wfBox.max.y, wfBox.max.z),
    new Vector3(wfBox.max.x, wfBox.min.y, wfBox.min.z),
    new Vector3(wfBox.max.x, wfBox.min.y, wfBox.max.z),
    new Vector3(wfBox.max.x, wfBox.max.y, wfBox.min.z),
    new Vector3(wfBox.max.x, wfBox.max.y, wfBox.max.z),
  ]
  let pmin = Infinity, pmax = -Infinity
  for (const c of corners) {
    const p = c.dot(ax)
    if (p < pmin) pmin = p
    if (p > pmax) pmax = p
  }
  const span = Math.max(0.0001, pmax - pmin)
  wfMin   = pmin + span * (sweepStart.value / 100)
  wfRange = Math.max(0.0001, span * ((sweepEnd.value - sweepStart.value) / 100))
  for (const e of wfShaders) {
    ;(e.shader.uniforms.uWfAxis  as { value: Vector3 }).value.copy(wfAxis)
    ;(e.shader.uniforms.uWfMin   as { value: number  }).value = wfMin
    ;(e.shader.uniforms.uWfRange as { value: number  }).value = wfRange
  }
}

function setUWfProgressOnAll(v: number) {
  for (const e of wfShaders) (e.shader.uniforms.uWfProgress as { value: number }).value = v
}

function refreshSweepTint() {
  const tint = new Color(wfMatParams.value.color)
  for (const e of wfShaders) (e.shader.uniforms.uWfTint as { value: Color }).value.copy(tint)
}

//Pre-build EdgesGeometry per mesh so the wireframe-overlay sync at
//toggle time just attaches pre-computed lines instead of recomputing
//them. Keyed by mesh uuid; entries match the threshold the user has
//configured. Rebuilt when the threshold changes via the slider.
const precomputedEdges = new Map<string, EdgesGeometry>()
let   precomputedEdgesThreshold = WIREFRAME_EDGE_THRESHOLD_DEG

function buildPrecomputedEdges() {
  for (const g of precomputedEdges.values()) g.dispose()
  precomputedEdges.clear()
  precomputedEdgesThreshold = wireframeEdgeThreshold.value
  for (const sm of sceneMeshes.value) {
    precomputedEdges.set(sm.mesh.uuid, new EdgesGeometry(sm.mesh.geometry, precomputedEdgesThreshold))
  }
}

//Pre-build the wireframe edge geometries at load time. Material swaps
//are gone (single material with sweep shader handles both states), so
//the only meaningful warmup left is the EdgesGeometry cache.
function precompileWireframeAssets() {
  buildPrecomputedEdges()
}

function advanceWfTransition() {
  if (!wfTransition) return
  const now = performance.now()
  const t   = Math.min(1, (now - wfTransition.startTime) / wfTransition.duration)
  //easeInOutCubic gives a uniform-feeling march across the model: slow
  //start, steady middle, soft landing. easeOutCubic was rushing the
  //first frames so the user saw the line "appear" already mid-way.
  const eased = t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
  const v = wfTransition.from + (wfTransition.to - wfTransition.from) * eased
  setUWfProgressOnAll(v)
  if (t >= 1) {
    if (wfTransition.phase === "enter") finalizeEnterWireframe()
    wfTransition = null
  }
  requestRender()
}

//Sweep sliders + wireframe-tint colour rewrite the uniforms live so the
//user sees the change instantly without a save/reload round-trip.
watch(sweepAxis,  recomputeSweepRange, { deep: true })
watch(sweepStart, recomputeSweepRange)
watch(sweepEnd,   recomputeSweepRange)
watch(() => wfMatParams.value.color, refreshSweepTint)

//Wireframe overlays are LineSegments (one per scene mesh) drawn from
//EdgesGeometry, which keeps only edges where the angle between adjacent
//faces is greater than the threshold - so the triangulation diagonals
//of flat faces are excluded.
const wfOverlays = new Map<string, LineSegments>()
const meshMatSnapshots = new Map<string, MeshPhysicalMaterial>()

//===========================================================================
//SCENE REFS
//===========================================================================
//Glb loader exposed as a module-level callback so the project load and
//the upload-glb handler can both trigger a re-load. Set by onMounted.
let loadGlbFn: ((url: string) => void) | null = null

let scene:          Scene | null = null
let pmrem:          PMREMGenerator | null = null
let renderer:       WebGLRenderer | null = null
let composer:       EffectComposer | null = null
let controls:       OrbitControls | null = null
//Active editor camera. Points at either the perspective OR the ortho
//camera depending on cameraMode - swap via switchCamera(). The two
//cameras share position+target so the toggle is visually continuous.
let cameraRef:      PerspectiveCamera | OrthographicCamera | null = null
let perspectiveCamera: PerspectiveCamera  | null = null
let orthoCamera:       OrthographicCamera | null = null
let renderPass:        RenderPass         | null = null
let sceneRadius        = 1                         //updated on glb load, drives ortho frustum
//Center of the glb's bounding sphere in WORLD coords AFTER the scene has
//been recentered (gltf.scene.position adjustments). Used as the focus
//point for axis view snaps so the model sits dead-center in the snapped
//view (instead of below it, which was happening because controls.target
//was at sphere.radius * 0.8 - 20% below the actual middle).
let sceneCenter = new Vector3(0, 1, 0)
let transformCtrls: TransformControls | null = null
let viewHelper:     ViewHelper | null = null
let rafId:          number | null = null
let resizeObs:      ResizeObserver | null = null
let lastTickAt      = 0
let renderUntil     = 0
const cameraMode = ref<"persp" | "ortho">("persp")

//Camera animation - lerps position + target, SLERPS the camera
//quaternion directly. Quaternion slerp avoids the "top view roll" we
//had with up-vector lerp + lookAt: lerping up through (0, 0.5, -0.5)
//made the camera roll around its forward axis while it traveled. The
//quat goes from current orientation to the target orientation along
//the shortest arc, which reads as a smooth pan + tilt with no roll.
//camera.up is still snapped to the target up at animation END so
//OrbitControls' subsequent spherical math uses the correct "up axis".
type CameraAnim = {
  fromPos:    Vector3
  toPos:      Vector3
  fromTarget: Vector3
  toTarget:   Vector3
  fromQuat:   Quaternion
  toQuat:     Quaternion
  endUp:      Vector3
  startTime:  number
  duration:   number
}
let cameraAnim: CameraAnim | null = null

//Build a cameraAnim from a target pose. To derive the camera's final
//quaternion we use Matrix4.lookAt(eye, target, up) + setFromRotationMatrix
//- this is the same approach the production library three-viewport-gizmo
//uses, and it's more reliable than PerspectiveCamera.lookAt(...) because
//Matrix4.lookAt's degenerate-case fallback is deterministic (it gives a
//well-defined matrix that we can either keep or post-correct).
const _animMatrix = new Matrix4()
function makeCameraAnim(opts: {
  toPos: Vector3
  toTarget: Vector3
  toUp?: Vector3
  duration?: number
}): CameraAnim {
  const from = cameraRef!
  const toUp = opts.toUp ?? from.up.clone()
  //IMPORTANT: Matrix4.lookAt's signature in three.js is (eye, target, up)
  //but it builds a rotation matrix for an object AT `eye` looking TOWARD
  //`target` along its -Z axis. That's exactly the camera convention.
  _animMatrix.lookAt(opts.toPos, opts.toTarget, toUp)
  const toQuat = new Quaternion().setFromRotationMatrix(_animMatrix)
  return {
    fromPos:    from.position.clone(),
    toPos:      opts.toPos.clone(),
    fromTarget: controls!.target.clone(),
    toTarget:   opts.toTarget.clone(),
    fromQuat:   from.quaternion.clone(),
    toQuat,
    endUp:      toUp.clone(),
    startTime:  performance.now(),
    duration:   opts.duration ?? 500,
  }
}

//Click vs drag discrimination - see POINTER_DRAG_THRESHOLD up top.
let pointerDownX = 0
let pointerDownY = 0
let pointerDownAt = 0

//OPTIMIZATION
let canvasVisible = true
let tabVisible    = true

function requestRender(ms = RENDER_KEEPALIVE_MS_DEFAULT) {
  renderUntil = performance.now() + ms
}

//===========================================================================
//ONMOUNTED
//===========================================================================
//Editor canvas is constrained to the SAME aspect as the production viewer
//(see TARGET_ASPECT constant at the top) so the author frames the shot
//WYSIWYG. Returns the size as an aspect-locked box that fits inside the
//container.
function fitCanvasSize(containerW: number, containerH: number): { w: number; h: number } {
  if (containerW / containerH > TARGET_ASPECT) {
    return { w: Math.floor(containerH * TARGET_ASPECT), h: containerH }
  }
  return { w: containerW, h: Math.floor(containerW / TARGET_ASPECT) }
}

//useSettings loads asynchronously - on first paint getString() returns
//the row default. Once the table arrives we re-read both global editor
//prefs so the panel reflects whatever was persisted from a previous
//session / a different project.
watch(settingsLoaded, (loaded) => {
  if (!loaded) return
  wireframeOverlayColor.value = getString(WF_LINE_COLOR_KEY, "#000000")
  wireframeColor.value        = getString(WF_MODE_COLOR_KEY, "#14b8a6")
  wfMatParams.value = parseWfMatParams(getString(WF_MAT_PARAMS_KEY, ""))
  //push the freshly-loaded values onto the live materials / overlays
  if (wfBaseMat || wfPickMat) syncWfMaterialsParams()
  for (const overlay of wfOverlays.values()) {
    if (overlay.material instanceof LineBasicMaterial) {
      overlay.material.color.set(wireframeOverlayColor.value)
      overlay.material.needsUpdate = true
    }
  }
  requestRender()
})

onMounted(() => {
  if (!canvas.value || !viewportBox.value) return
  const c     = canvas.value
  const box   = viewportBox.value
  const stage = box.parentElement!
  //Size the 16/9 viewport box first so the canvas inherits its dims.
  const { w, h } = fitCanvasSize(stage.clientWidth, stage.clientHeight)
  box.style.width  = `${w}px`
  box.style.height = `${h}px`

  scene = new Scene()
  scene.background = null

  const camera = new PerspectiveCamera(CAMERA_FOV, w / h, CAMERA_NEAR, CAMERA_FAR)
  camera.position.set(2, 1.5, 3)
  perspectiveCamera = camera
  cameraRef = camera

  //Ortho twin - shares position/target with the perspective camera but
  //gives clean parallel-projection axis views (top / left / right) with
  //no perspective distortion. Frustum is sized from the scene bounding
  //sphere after glb load (tuneOrthoFrustum) - default for now is unit.
  orthoCamera = new OrthographicCamera(-1, 1, 1 / TARGET_ASPECT, -1 / TARGET_ASPECT, 0.01, 1000)
  orthoCamera.position.copy(camera.position)
  orthoCamera.up.copy(camera.up)

  renderer = new WebGLRenderer({
    canvas: c,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  renderer.setSize(w, h, false)
  renderer.toneMapping            = NeutralToneMapping
  renderer.toneMappingExposure    = 1
  renderer.shadowMap.enabled      = true
  renderer.shadowMap.type         = PCFSoftShadowMap
  renderer.setClearColor(new Color(0x000000), 0)

  pmrem = new PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  applyProceduralSky()
  scene.environmentIntensity = normalHdrIntensity.value

  //GROUND PLANE (shadow catcher)
  const ground = new Mesh(new PlaneGeometry(GROUND_SIZE, GROUND_SIZE), new ShadowMaterial({ opacity: GROUND_OPACITY }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  //CONTROLS
  controls = new OrbitControls(camera, c)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = ORBIT_MIN_DISTANCE
  controls.maxDistance = ORBIT_MAX_DISTANCE
  controls.addEventListener("change", () => requestRender(500))

  //TRANSFORM CONTROLS (single instance, switchable target)
  transformCtrls = new TransformControls(camera, c)
  transformCtrls.setSize(0.8)
  scene.add(transformCtrls.getHelper())
  transformCtrls.addEventListener("dragging-changed", (e) => {
    if (controls) controls.enabled = !e.value
  })
  transformCtrls.addEventListener("change", () => {
    syncGizmoTargetToData()
    requestRender()
  })

  //VIEW HELPER (axis cube bottom-right) - custom click handler so the
  //animation uses our smooth lerp instead of the built-in snap.
  viewHelper = new ViewHelper(camera, c)

  c.addEventListener("pointerdown", onCanvasPointerDown)
  c.addEventListener("pointerup",   onCanvasPointerUp)

  //ESCAPE deselects whatever is selected (picked mesh or gizmo-attached light)
  document.addEventListener("keydown", onKeyDown)

  //COMPOSER
  const renderTarget = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 })
  composer = new EffectComposer(renderer, renderTarget)
  //Keep the RenderPass reference so switchCamera() can swap its camera
  //instead of rebuilding the composer chain.
  renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)
  composer.addPass(new SMAAPass(w, h))
  composer.addPass(new OutputPass())

  //LOAD project metadata first, then the .glb (or wait for one to be uploaded)
  loadGlbFn = (url: string) => {
    if (!scene) return
    status.value = "Loading model..."
    const loader = new GLTFLoader()
    loader.load(
      url,
      (gltf) => {
      gltf.scene.traverse((obj) => {
        const m = obj as Mesh
        if (m.isMesh) {
          m.castShadow    = true
          m.receiveShadow = true
        }
      })

      //IMPORTANT: when GLTFLoader gives us MeshStandardMaterial, we upgrade
      //to MeshPhysicalMaterial so the editor's specular slider works.
      //Multiple meshes that share the same glTF material reference must
      //continue to share ONE upgraded instance, otherwise an edit only
      //touches the first mesh that loaded it. stdToPhysical tracks the
      //conversion keyed on the original material uuid.
      const stdToPhysical = new Map<string, MeshPhysicalMaterial>()
      const seen = new Map<string, MaterialEntry>()
      gltf.scene.traverse((obj) => {
        const m = obj as Mesh
        if (!m.isMesh) return
        const mat = m.material as MeshStandardMaterial
        if (!mat || (mat as any).isMeshBasicMaterial) return

        let physical: MeshPhysicalMaterial
        if ((mat as any).isMeshPhysicalMaterial) {
          physical = mat as unknown as MeshPhysicalMaterial
        } else if (stdToPhysical.has(mat.uuid)) {
          physical = stdToPhysical.get(mat.uuid)!
          m.material = physical
        } else {
          physical = new MeshPhysicalMaterial({
            color: mat.color, map: mat.map,
            metalness: mat.metalness, roughness: mat.roughness,
            emissive: mat.emissive, emissiveIntensity: mat.emissiveIntensity, emissiveMap: mat.emissiveMap,
            normalMap: mat.normalMap, roughnessMap: mat.roughnessMap, metalnessMap: mat.metalnessMap,
            aoMap: mat.aoMap, aoMapIntensity: mat.aoMapIntensity, envMapIntensity: mat.envMapIntensity,
            transparent: mat.transparent, opacity: mat.opacity, alphaTest: mat.alphaTest,
            side: mat.side, depthTest: mat.depthTest, depthWrite: mat.depthWrite, flatShading: mat.flatShading,
          })
          if (mat.normalScale) physical.normalScale.copy(mat.normalScale)
          physical.name = mat.name
          physical.uuid = mat.uuid
          stdToPhysical.set(mat.uuid, physical)
          m.material = physical
        }

        if (!seen.has(physical.uuid)) {
          seen.set(physical.uuid, {
            displayName:       physical.name || m.name || `Material ${seen.size + 1}`,
            material:          markRaw(physical),
            color:             "#" + physical.color.getHexString(),
            emissive:          "#" + (physical.emissive?.getHexString() ?? "000000"),
            metalness:         physical.metalness,
            roughness:         physical.roughness,
            envMapIntensity:   physical.envMapIntensity,
            specularIntensity: physical.specularIntensity,
            emissiveIntensity: physical.emissiveIntensity,
            expanded:          false,
            thumbnail:         previewFromTexture(physical.map),
            emissiveEnabled:   physical.emissiveIntensity > 0,
          })
        }
      })
      materials.value = [...seen.values()]

      const meshes: SceneMesh[] = []
      let meshIndex = 0
      gltf.scene.traverse((obj) => {
        const m = obj as Mesh
        if (!m.isMesh) return
        meshes.push({ mesh: markRaw(m), name: m.name || `Mesh ${meshIndex}` })
        meshIndex++
      })
      sceneMeshes.value = meshes

      //SWEEP shader prep - patches each original material once so the
      //shared uWfProgress uniform drives the wipe later.
      for (const sm of meshes) {
        const mat = sm.mesh.material as Material | Material[]
        if (Array.isArray(mat)) for (const sub of mat) patchMaterialForSweep(sub)
        else                    patchMaterialForSweep(mat)
      }
      gltf.scene.updateMatrixWorld(true)
      wfBox = new Box3().setFromObject(gltf.scene)
      recomputeSweepRange()

      scene!.add(gltf.scene)
      //WIREFRAME WARMUP - precompiles the wireframe materials AND the
      //edges geometry now, while the model is settling, instead of on
      //the first wireframe toggle (where the GLSL compile + EdgesGeom
      //computation produced a visible stall). Two heavy ops:
      //  1) renderer.compile(scene, camera) with wfBaseMat temporarily
      //     swapped onto every mesh forces its program into the cache.
      //  2) EdgesGeometry is rebuilt + cached per mesh so syncWireframe-
      //     Overlays can just attach pre-built geometry instead of
      //     computing on the click frame.
      precompileWireframeAssets()

      const tempBox = new Box3().setFromObject(gltf.scene)
      const center  = tempBox.getCenter(new Vector3())
      const sphere  = tempBox.getBoundingSphere(new Sphere())

      gltf.scene.position.x -= center.x
      gltf.scene.position.z -= center.z
      gltf.scene.position.y -= tempBox.min.y

      //Recompute the bounding sphere AFTER the position adjustment so
      //sceneCenter is in WORLD coords (not the glTF's local frame). The
      //axis snap below uses this as the focus point so the model sits
      //dead-center in every axis view.
      const worldBox    = new Box3().setFromObject(gltf.scene)
      const worldSphere = worldBox.getBoundingSphere(new Sphere())
      sceneRadius = worldSphere.radius
      sceneCenter.copy(worldSphere.center)

      const fov = camera.fov * (Math.PI / 180)
      const distance = sphere.radius / Math.sin(fov / 2) * 1.3
      camera.position.set(distance * 0.6, distance * 0.55 + sphere.radius, distance * 0.8)
      camera.near = sphere.radius / 100
      camera.far  = sphere.radius * 100
      camera.updateProjectionMatrix()
      controls!.target.copy(sceneCenter)
      controls!.update()

      //replay any saved settings - applies material overrides, spawns
      //lights, restores emissive picks
      applyPendingHydration()

      //size shadow camera frustums to fit the loaded model; without this
      //a default 5x5 ortho shadow camera only covers tiny scenes
      tuneShadowCameras(sphere.radius)

      requestRender(500)
      status.value = `Triangles: ${countTriangles(gltf.scene)} • Materials: ${materials.value.length}`
    },
    (xhr) => {
      if (xhr.lengthComputable) status.value = `Loading ${Math.round((xhr.loaded / xhr.total) * 100)}%`
    },
    (err) => {
      console.error("[model-editor] GLTF load failed:", err)
      status.value = `Load failed: ${err instanceof Error ? err.message : String(err)}`
    },
    )
  }
  //kick off the project fetch which will trigger loadGlbFn if a .glb is set
  void loadProjectAndModel()

  //RENDER LOOP
  const tick = () => {
    const now = performance.now()
    const delta = lastTickAt > 0 ? (now - lastTickAt) / 1000 : 0
    lastTickAt = now

    if (cameraAnim && cameraRef && controls) {
      const t = Math.min(1, (now - cameraAnim.startTime) / cameraAnim.duration)
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2  //easeInOutQuad
      cameraRef.position.lerpVectors(cameraAnim.fromPos, cameraAnim.toPos, ease)
      controls.target.lerpVectors(cameraAnim.fromTarget, cameraAnim.toTarget, ease)
      cameraRef.quaternion.slerpQuaternions(cameraAnim.fromQuat, cameraAnim.toQuat, ease)
      if (t >= 1) {
        //Force the EXACT final state (lerp at alpha=1 returns toX algebraically
        //but with no rounding tail, and quaternion slerp doesn't normalize.)
        cameraRef.position.copy(cameraAnim.toPos)
        cameraRef.quaternion.copy(cameraAnim.toQuat)
        controls.target.copy(cameraAnim.toTarget)
        cameraRef.up.copy(cameraAnim.endUp)
        //Kill any leftover orbit / pan momentum from BEFORE the snap, then
        //let OrbitControls re-sync against the exact pose. Without the
        //clear, decayed sphericalDelta from prior input was being applied
        //on top of our pose at the end of the animation - that was the
        //"contre-plonge" residual the user reported.
        const c = controls as unknown as {
          sphericalDelta?: { set: (a: number, b: number, c: number) => void }
          panOffset?:      { set: (a: number, b: number, c: number) => void }
        }
        c.sphericalDelta?.set(0, 0, 0)
        c.panOffset?.set(0, 0, 0)
        cameraAnim = null
        controls.enabled = true
        controls.update()
      }
      requestRender()
    }

    //ViewHelper.update only matters when ViewHelper is driving its own
    //animation. We took over the axis-click animation (see snapToView)
    //so this just keeps the gizmo's own visual state in sync.
    if (viewHelper && (viewHelper as unknown as { animating: boolean }).animating) {
      viewHelper.update(delta)
      requestRender()
    }

    if (canvasVisible && tabVisible && now < renderUntil) {
      //Skip OrbitControls.update during our cameraAnim - OrbitControls
      //holds its own spherical state and would otherwise OVERRIDE the
      //position we just lerped (it re-derives camera.position from its
      //internal spherical every update). That's what made the top-view
      //snap at the end of the animation: OrbitControls re-clamped phi
      //away from 0, shifting the camera off the axis.
      if (!cameraAnim) controls!.update()
      //Wireframe sweep tick - mutates uniforms on the patched materials
      //and calls requestRender so the composer keeps painting until done.
      if (wfTransition) advanceWfTransition()
      composer!.render()
      if (viewHelper && renderer) {
        renderer.autoClear = false
        viewHelper.render(renderer)
        renderer.autoClear = true
      }
    }
    rafId = requestAnimationFrame(tick)
  }
  tick()

  resizeObs = new ResizeObserver(() => {
    if (!viewportBox.value || !stage) return
    const { clientWidth: pw, clientHeight: ph } = stage
    if (pw === 0 || ph === 0) return
    const { w: nw, h: nh } = fitCanvasSize(pw, ph)
    viewportBox.value.style.width  = `${nw}px`
    viewportBox.value.style.height = `${nh}px`
    renderer!.setSize(nw, nh, false)
    composer!.setSize(nw, nh)
    camera.aspect = TARGET_ASPECT
    camera.updateProjectionMatrix()
    //ortho frustum rebuilt from the active perspective camera so both
    //projections continue to frame the model identically when the
    //window resizes during an ortho session.
    tuneOrthoFrustum()
    requestRender(200)
  })
  resizeObs.observe(stage)

  document.addEventListener("visibilitychange", onTabVisibility)
  void loadExistingHdris()
})

function onTabVisibility() {
  tabVisible = !document.hidden
  if (tabVisible) requestRender(500)
}

//===========================================================================
//PROJECT LOAD + SAVE + UPLOAD GLB
//===========================================================================
//After a glb load, point every directional shadow camera at a box that
//covers the bounding sphere of the scene. Without this the shadow map
//either misses the model (frustum too small) or wastes resolution.
function tuneShadowCameras(sphereRadius: number) {
  const size = Math.max(sphereRadius * 3, 1)
  for (const e of lights.value) {
    if (e.type !== "directional") continue
    const dl = e.light as DirectionalLight
    dl.shadow.camera.left   = -size
    dl.shadow.camera.right  =  size
    dl.shadow.camera.top    =  size
    dl.shadow.camera.bottom = -size
    dl.shadow.camera.near   = 0.1
    dl.shadow.camera.far    = size * 5
    dl.shadow.camera.updateProjectionMatrix()
  }
}

async function loadProjectAndModel() {
  if (!Number.isFinite(projectId.value)) {
    status.value = "Missing project id"
    return
  }
  try {
    const res = await fetch(`/api/main-project/${projectId.value}`, { credentials: "include" })
    if (!res.ok) throw new Error(`fetch project ${res.status}`)
    const row = await res.json() as {
      id: number
      title: { en: string; fr: string }
      glbUrl: string | null
      viewerSettings: unknown
    }
    projectTitle.value = row.title?.en ?? `Project ${row.id}`
    glbUrl.value = row.glbUrl
    if (row.viewerSettings) hydrateFromSavedSettings(row.viewerSettings)
    if (row.glbUrl) loadGlbFn?.(row.glbUrl)
    else status.value = "No .glb yet — use Upload .glb above to start editing"
  } catch (e) {
    console.error("[edit-3d] project load failed:", e)
    status.value = `Project load failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

//Saved settings shape - lights / materials reference the glb so they can
//only be applied AFTER GLTFLoader has populated materials.value and
//sceneMeshes.value. Simple knobs (HDR id, wireframe color, etc) are
//applied immediately on project load; the rest is queued for later.
type SavedSettings = {
  startView?:       { pos: [number, number, number]; target: [number, number, number] }
  startViewMobile?: { pos: [number, number, number]; target: [number, number, number] }
  materials?: Array<{
    uuid?: string
    name?: string
    color?: string
    emissive?: string
    emissiveEnabled?: boolean
    emissiveIntensity?: number
    metalness?: number
    roughness?: number
    envMapIntensity?: number
    specularIntensity?: number
  }>
  //NEW shape - one shared list with per-mode intensity + color
  lights?: Array<{
    id?: string
    type: "point" | "directional"
    x: number; y: number; z: number
    tx?: number; ty?: number; tz?: number
    range?: number
    normalIntensity: number
    normalColor:     string
    wfIntensity:     number
    wfColor:         string
    enabled?:    boolean
    castShadow?: boolean
  }>
  normalMode?: {
    hdrId?: string
    hdrIntensity?: number
    //LEGACY - kept on read to migrate old saves; new saves write the
    //top-level `lights` array instead.
    lights?: Array<{ id?: string; type: "point" | "directional"; intensity: number; color: string; range?: number; x: number; y: number; z: number; tx?: number; ty?: number; tz?: number }>
  }
  wireframeMode?: {
    hdrId?: string
    hdrIntensity?: number
    color?: string
    overlayOn?: boolean
    overlayColor?: string
    material?: WfMaterialParams
    emissiveMeshes?: Array<{ name?: string; uuid?: string; intensity: number }>
    lights?: Array<{ id?: string; type: "point" | "directional"; intensity: number; color?: string; range?: number; x: number; y: number; z: number; tx?: number; ty?: number; tz?: number }>
    //per-project sweep axis + range (% of bbox along that axis)
    sweepAxis?: [number, number, number]
    sweepStart?: number
    sweepEnd?:   number
  }
}

let pendingHydration: SavedSettings | null = null

function hydrateFromSavedSettings(payload: unknown) {
  const s = payload as SavedSettings | null
  if (!s) return
  //simple knobs - applied immediately (no glb dependency)
  if (s.normalMode?.hdrId !== undefined)            normalHdrId.value         = s.normalMode.hdrId
  if (s.normalMode?.hdrIntensity !== undefined)     normalHdrIntensity.value  = s.normalMode.hdrIntensity
  if (s.wireframeMode?.hdrId !== undefined)         wfHdrId.value             = s.wireframeMode.hdrId
  if (s.wireframeMode?.hdrIntensity !== undefined)  wfHdrIntensity.value      = s.wireframeMode.hdrIntensity
  if (s.wireframeMode?.overlayOn !== undefined)     wireframeOverlayOn.value  = s.wireframeMode.overlayOn
  if (Array.isArray(s.wireframeMode?.sweepAxis) && s.wireframeMode.sweepAxis.length === 3) {
    sweepAxis.value = [s.wireframeMode.sweepAxis[0], s.wireframeMode.sweepAxis[1], s.wireframeMode.sweepAxis[2]] as [number, number, number]
  }
  if (typeof s.wireframeMode?.sweepStart === "number") sweepStart.value = s.wireframeMode.sweepStart
  if (typeof s.wireframeMode?.sweepEnd   === "number") sweepEnd.value   = s.wireframeMode.sweepEnd
  //s.wireframeMode.color (mode color) + .overlayColor (line color) +
  //.material are GLOBAL editor prefs (settings table). Ignore the
  //per-project values during hydration so the DB-backed global wins.
  //start view (camera pose) is the bridge between the editor and the
  //production viewer's intro animation. Just a 6-number snapshot.
  if (s.startView)                                  startView.value       = s.startView
  if (s.startViewMobile)                            startViewMobile.value = s.startViewMobile
  //everything else (materials, lights, emissive picks) needs the glb -
  //queue and apply in applyPendingHydration() after GLTFLoader is done
  pendingHydration = s
}

//Apply per-material overrides + spawn saved lights + restore emissive
//picks. Called from the GLTFLoader onLoad callback AFTER materials.value
//and sceneMeshes.value have been populated.
function applyPendingHydration() {
  if (!pendingHydration) return
  const s = pendingHydration
  pendingHydration = null

  //MATERIALS - find by name first, fallback to uuid
  if (s.materials) {
    for (const saved of s.materials) {
      const target = materials.value.find((m) =>
        (saved.name && m.material.name === saved.name) ||
        (saved.uuid && m.material.uuid === saved.uuid),
      )
      if (!target) continue
      if (saved.color)             { target.color = saved.color;   target.material.color.set(saved.color) }
      if (saved.emissive)          { target.emissive = saved.emissive; target.material.emissive.set(saved.emissive) }
      if (saved.metalness !== undefined)         { target.metalness = saved.metalness; target.material.metalness = saved.metalness }
      if (saved.roughness !== undefined)         { target.roughness = saved.roughness; target.material.roughness = saved.roughness }
      if (saved.envMapIntensity !== undefined)   { target.envMapIntensity = saved.envMapIntensity; target.material.envMapIntensity = saved.envMapIntensity }
      if (saved.specularIntensity !== undefined) { target.specularIntensity = saved.specularIntensity; target.material.specularIntensity = saved.specularIntensity }
      if (saved.emissiveEnabled !== undefined && saved.emissiveIntensity !== undefined) {
        target.emissiveEnabled = saved.emissiveEnabled
        target.emissiveIntensity = saved.emissiveIntensity
        target.material.emissiveIntensity = saved.emissiveEnabled ? saved.emissiveIntensity : 0
      }
      target.material.needsUpdate = true
    }
  }

  //LIGHTS - spawn each saved entry. Supports both the new shared shape
  //(top-level `lights` array with per-mode intensity+color) and the
  //legacy normalMode.lights + wireframeMode.lights pair, which we merge
  //by id. addLight's auto-select is bypassed during hydration.
  hydratingLights = true
  try {
    if (s.lights && s.lights.length > 0) {
      for (const spec of s.lights) hydrateSharedLight(spec)
    } else {
      //LEGACY MIGRATION: zip the two old arrays by id (or by index when
      //ids are missing) into the new shared shape.
      const normalSpecs = s.normalMode?.lights ?? []
      const wfSpecs     = s.wireframeMode?.lights ?? []
      const byId = new Map<string, { normal?: typeof normalSpecs[number]; wf?: typeof wfSpecs[number] }>()
      normalSpecs.forEach((n, i) => byId.set(n.id ?? `_n${i}`, { normal: n }))
      wfSpecs.forEach((w, i) => {
        const key = w.id ?? `_w${i}`
        const merged = byId.get(key) ?? {}
        merged.wf = w
        byId.set(key, merged)
      })
      for (const { normal, wf } of byId.values()) {
        const seed = normal ?? wf
        if (!seed) continue
        hydrateSharedLight({
          id:    seed.id,
          type:  seed.type,
          x:     seed.x, y: seed.y, z: seed.z,
          tx:    seed.tx, ty: seed.ty, tz: seed.tz,
          range: seed.range,
          normalIntensity: normal?.intensity ?? wf?.intensity ?? 1,
          normalColor:     normal?.color ?? "#ffffff",
          wfIntensity:     wf?.intensity ?? normal?.intensity ?? 1,
          wfColor:         wf?.color ?? wireframeColor.value,
        })
      }
    }
  } finally {
    hydratingLights = false
  }

  //EMISSIVE picks - find each saved mesh by name, add to the emissive list
  if (s.wireframeMode?.emissiveMeshes) {
    for (const saved of s.wireframeMode.emissiveMeshes) {
      const sm = sceneMeshes.value.find((m) =>
        (saved.name && m.name === saved.name) ||
        (saved.uuid && m.mesh.uuid === saved.uuid),
      )
      if (!sm) continue
      if (!emissiveList.value.find((e) => e.uuid === sm.mesh.uuid)) {
        const material = makeEmissiveMaterial(saved.intensity)
        emissiveList.value = [...emissiveList.value, { uuid: sm.mesh.uuid, intensity: saved.intensity, material }]
      }
    }
  }

  requestRender(800)
}

//Shared-light hydration. Spawns the entry, copies the saved position +
//range + per-mode intensity/color, then applies whichever pair matches
//the current mode so the scene re-renders correctly on load.
let hydratingLights = false

function hydrateSharedLight(spec: {
  id?: string
  type: "point" | "directional"
  x: number; y: number; z: number
  tx?: number; ty?: number; tz?: number
  range?: number
  normalIntensity: number
  normalColor:     string
  wfIntensity:     number
  wfColor:         string
  enabled?:    boolean
  castShadow?: boolean
}) {
  addLight(spec.type)
  const entry = lights.value[lights.value.length - 1]
  if (!entry) return
  entry.x = spec.x; entry.y = spec.y; entry.z = spec.z
  entry.light.position.set(spec.x, spec.y, spec.z)
  entry.sourceGiz.position.copy(entry.light.position)
  if (entry.type === "point" && spec.range !== undefined) {
    entry.range = spec.range
    ;(entry.light as PointLight).distance = spec.range
  }
  entry.normalIntensity = spec.normalIntensity
  entry.normalColor     = spec.normalColor
  entry.wfIntensity     = spec.wfIntensity
  entry.wfColor         = spec.wfColor
  //per-light toggles - if absent on hydration (older saves) keep the
  //defaults assigned by addLight()
  if (spec.enabled    !== undefined) onLightEnabledChange(lights.value.length - 1, spec.enabled)
  if (spec.castShadow !== undefined) onLightShadowChange (lights.value.length - 1, spec.castShadow)
  if (entry.type === "directional" && entry.target) {
    entry.tx = spec.tx ?? 0; entry.ty = spec.ty ?? 0; entry.tz = spec.tz ?? 0
    entry.target.position.set(entry.tx, entry.ty, entry.tz)
    ;(entry.light as DirectionalLight).target.updateMatrixWorld()
    updateLinkGeometry(entry)
  }
  //apply mode-appropriate intensity+color now that the entry is live
  const mode = activeMode()
  const col = new Color(lightColor(entry, mode))
  entry.light.intensity = lightIntensity(entry, mode)
  entry.light.color.copy(col)
  ;(entry.sourceGiz.material as MeshBasicMaterial).color.copy(col)
  if (entry.target) (entry.target.material as MeshBasicMaterial).color.copy(col)
  if (entry.link)   (entry.link.material   as LineBasicMaterial).color.copy(col)
}

async function uploadGlb() {
  if (!Number.isFinite(projectId.value)) return
  const input = document.createElement("input")
  input.type = "file"
  input.accept = ".glb,.gltf"
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    isUploadingGlb.value = true
    glbUploadError.value = null
    try {
      const fd = new FormData(); fd.append("file", file)
      const res = await fetch("/api/files", { method: "POST", credentials: "include", body: fd })
      if (!res.ok) throw new Error(`upload ${res.status} ${await res.text().catch(() => "")}`)
      const row = await res.json() as { id: string; url: string }
      //attach the file to the project
      const patch = await fetch(`/api/main-project/${projectId.value}`, {
        method:      "PUT",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ glbFileId: row.id }),
      })
      if (!patch.ok) throw new Error(`patch ${patch.status}`)
      glbUrl.value = row.url
      loadGlbFn?.(row.url)
    } catch (e) {
      glbUploadError.value = e instanceof Error ? e.message : String(e)
      console.error("[edit-3d] glb upload failed:", e)
    } finally {
      isUploadingGlb.value = false
    }
  }
  input.click()
}

async function saveViewerSettings(payload: unknown) {
  if (!Number.isFinite(projectId.value)) return
  isSaving.value = true; saveError.value = null
  try {
    const res = await fetch(`/api/main-project/${projectId.value}/viewer-settings`, {
      method:      "PUT",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
      body:        JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`save ${res.status}`)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e)
    console.error("[edit-3d] save failed:", e)
  } finally {
    isSaving.value = false
  }
}

function goBack() { router.push("/") }

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  if (canvas.value) {
    canvas.value.removeEventListener("pointerdown", onCanvasPointerDown)
    canvas.value.removeEventListener("pointerup",   onCanvasPointerUp)
  }
  document.removeEventListener("keydown", onKeyDown)
  document.removeEventListener("visibilitychange", onTabVisibility)
  transformCtrls?.detach()
  transformCtrls?.dispose()
  controls?.dispose()
  composer?.dispose()
  renderer?.dispose()
  resizeObs?.disconnect()
})

//===========================================================================
//HELPERS
//===========================================================================
function countTriangles(root: import("three").Object3D): number {
  let count = 0
  root.traverse((obj) => {
    const mesh = obj as import("three").Mesh
    if (mesh.isMesh && mesh.geometry) {
      const geo = mesh.geometry
      const index = geo.index
      const pos   = geo.attributes.position
      count += index ? index.count / 3 : (pos ? pos.count / 3 : 0)
    }
  })
  return Math.round(count)
}

function previewFromTexture(map: import("three").Texture | null | undefined, size = 40): string | null {
  if (!map || !map.image) return null
  try {
    const c = document.createElement("canvas")
    c.width = size; c.height = size
    const ctx = c.getContext("2d"); if (!ctx) return null
    ctx.drawImage(map.image as CanvasImageSource, 0, 0, size, size)
    return c.toDataURL("image/png")
  } catch (e) {
    console.warn("[model-editor] texture preview failed:", e)
    return null
  }
}

function makeSkyGradient(): DataTexture {
  const w = 4, h = 128
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const t = 1 - y / (h - 1)
    const v = Math.round(Math.pow(t, 0.85) * 255)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.mapping = EquirectangularReflectionMapping
  tex.needsUpdate = true
  return tex
}

function renderEnvThumbnail(source: Texture, size = 64): string | null {
  if (!renderer) return null
  const rt = new WebGLRenderTarget(size, size, { type: UnsignedByteType, format: RGBAFormat })
  const tmpScene  = new Scene()
  const tmpCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mat = new MeshBasicMaterial({ map: source, toneMapped: true })
  const mesh = new Mesh(new PlaneGeometry(2, 2), mat)
  tmpScene.add(mesh)

  const prevTarget = renderer.getRenderTarget()
  renderer.setRenderTarget(rt)
  renderer.render(tmpScene, tmpCamera)
  const buf = new Uint8Array(size * size * 4)
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf)
  renderer.setRenderTarget(prevTarget)

  const canvas = document.createElement("canvas")
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext("2d"); if (!ctx) return null
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * size * 4
    const dstRow = y * size * 4
    for (let x = 0; x < size * 4; x++) img.data[dstRow + x] = buf[srcRow + x]!
  }
  ctx.putImageData(img, 0, 0)

  mesh.geometry.dispose(); mat.dispose(); rt.dispose()
  return canvas.toDataURL("image/png")
}

//===========================================================================
//MATERIAL HANDLERS (Materials tab)
//===========================================================================
function onColorChange(entry: MaterialEntry, hex: string) {
  entry.color = hex
  entry.material.color.set(hex)
  requestRender()
}
function onEmissiveColorChange(entry: MaterialEntry, hex: string) {
  entry.emissive = hex
  entry.material.emissive.set(hex)
  requestRender()
}
type SlidableProp = "metalness" | "roughness" | "envMapIntensity" | "specularIntensity" | "emissiveIntensity"
function onSliderChange(entry: MaterialEntry, prop: SlidableProp, value: number) {
  entry[prop] = value
  entry.material[prop] = value
  requestRender()
}
function onEmissiveToggle(entry: MaterialEntry, enabled: boolean) {
  entry.emissiveEnabled = enabled
  if (enabled) {
    const target = entry.emissiveIntensity > 0 ? entry.emissiveIntensity : 1
    entry.emissiveIntensity = target
    entry.material.emissiveIntensity = target
  } else {
    entry.material.emissiveIntensity = 0
  }
  requestRender()
}

//===========================================================================
//ENV / HDR
//===========================================================================
function applyEnvFromSource(source: Texture, intensity: number) {
  if (!scene || !pmrem) return
  source.mapping = EquirectangularReflectionMapping
  const probe = pmrem.fromEquirectangular(source).texture
  probe.mapping = EquirectangularReflectionMapping
  const old = scene.environment as { dispose?: () => void } | null
  scene.environment = probe
  scene.environmentIntensity = intensity
  const oldSource = currentEnvSource
  currentEnvSource = source
  if (oldSource && oldSource !== source) oldSource.dispose?.()
  if (old && typeof old.dispose === "function") old.dispose()
  syncSkybox()
}

function applyProceduralSky(intensity = 1) {
  if (!scene) return
  applyEnvFromSource(makeSkyGradient(), intensity)
  if (!proceduralThumbnail.value && renderer && currentEnvSource) {
    proceduralThumbnail.value = renderEnvThumbnail(currentEnvSource)
  }
}

function applyHdrFromEntry(entry: HdrEntry, intensity: number) {
  if (!scene || !pmrem) return
  hdrError.value = null
  const isExr = /\.exr$/i.test(entry.name)
  const loader = isExr ? new EXRLoader() : new HDRLoader()
  loader.load(
    entry.url,
    (source) => {
      applyEnvFromSource(source, intensity)
      if (!entry.thumbnail && renderer) entry.thumbnail = renderEnvThumbnail(source)
      requestRender(800)
    },
    undefined,
    (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      hdrError.value = `${entry.name}: ${msg}`
      console.error("[model-editor] HDR load failed:", entry.name, err)
    },
  )
}

//Re-applies the env appropriate for the current mode + selected HDR id
function syncEnvForCurrentMode() {
  const id = wireframeMode.value ? wfHdrId.value    : normalHdrId.value
  const it = wireframeMode.value ? wfHdrIntensity.value : normalHdrIntensity.value
  if (id === "") applyProceduralSky(it)
  else {
    const entry = hdris.value.find((h) => h.id === id)
    if (entry) applyHdrFromEntry(entry, it)
    else applyProceduralSky(it)
  }
}

function syncSkybox() {
  if (!scene) return
  scene.background = (showSkybox.value && currentEnvSource) ? currentEnvSource : null
  requestRender()
}
function onSkyboxToggle(v: boolean) { showSkybox.value = v; syncSkybox() }

async function uploadHdrFile(file: File) {
  if (!/\.(hdr|exr|hdri)$/i.test(file.name)) {
    hdrError.value = `${file.name} is not an .hdr / .exr file`
    return
  }
  hdrUploading.value = true; hdrError.value = null
  try {
    const fd = new FormData(); fd.append("file", file)
    const res = await fetch("/api/files", { method: "POST", credentials: "include", body: fd })
    if (!res.ok) throw new Error(`upload ${res.status} ${await res.text().catch(() => "")}`)
    const row = await res.json() as { id: string; url: string; originalFilename: string }
    const entry: HdrEntry = { id: row.id, url: row.url, name: row.originalFilename ?? file.name, thumbnail: null }
    hdris.value = [...hdris.value, entry]
    ensureHdrThumbnail(entry)
  } catch (e) {
    hdrError.value = e instanceof Error ? e.message : String(e)
  } finally {
    hdrUploading.value = false
  }
}

//Loads an HDR/EXR JUST enough to render its 64px preview, then disposes
//the source texture. Called eagerly when an entry lands in the list so
//the panel never shows a blank slot. Failures stay silent (the user can
//still try to select the entry; if it's broken they'll see the real
//error in the per-mode picker).
function ensureHdrThumbnail(entry: HdrEntry) {
  if (entry.thumbnail || !renderer) return
  const isExr = /\.exr$/i.test(entry.name)
  const loader = isExr ? new EXRLoader() : new HDRLoader()
  loader.load(
    entry.url,
    (source) => {
      entry.thumbnail = renderEnvThumbnail(source)
      source.dispose()
      requestRender()
    },
    undefined,
    (err) => { console.warn("[model-editor] HDR thumbnail failed:", entry.name, err) },
  )
}
function onHdrPick() {
  const input = document.createElement("input")
  input.type = "file"; input.accept = ".hdr,.exr,.hdri"
  input.onchange = () => { const f = input.files?.[0]; if (f) uploadHdrFile(f) }
  input.click()
}
function onHdrDrop(e: DragEvent) {
  e.preventDefault(); hdrDragOver.value = false
  for (const f of Array.from(e.dataTransfer?.files ?? [])) uploadHdrFile(f)
}
function onHdrDragOver(e: DragEvent) { e.preventDefault(); hdrDragOver.value = true }
function onHdrDragLeave() { hdrDragOver.value = false }

//Delete an uploaded HDR from prod storage + drop it from the local list.
//If it was the active selection in either mode we fall back to procedural
//sky so the live env doesn't keep pointing at a missing /media URL.
async function deleteHdr(entry: HdrEntry) {
  if (!window.confirm(`Delete ${entry.name}?`)) return
  try {
    const res = await fetch(`/api/files/${entry.id}`, { method: "DELETE", credentials: "include" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      hdrError.value = body.error ?? `delete returned ${res.status}`
      return
    }
    hdris.value = hdris.value.filter((h) => h.id !== entry.id)
    if (normalHdrId.value === entry.id) {
      normalHdrId.value = ""
      if (!wireframeMode.value) syncEnvForCurrentMode()
    }
    if (wfHdrId.value === entry.id) {
      wfHdrId.value = ""
      if (wireframeMode.value) syncEnvForCurrentMode()
    }
  } catch (e) {
    hdrError.value = e instanceof Error ? e.message : String(e)
    console.error("[edit-3d] hdr delete failed:", e)
  }
}

async function loadExistingHdris() {
  try {
    const res = await fetch("/api/files", { credentials: "include" })
    if (!res.ok) return
    const all = await res.json() as Array<{ id: string; url: string; originalFilename: string }>
    hdris.value = all
      .filter((f) => /\.(hdr|exr|hdri)$/i.test(f.originalFilename))
      .map((f) => ({ id: f.id, url: f.url, name: f.originalFilename, thumbnail: null }))
    //kick off thumbnail generation for every entry so the list shows
    //previews even before any of them is selected
    for (const entry of hdris.value) ensureHdrThumbnail(entry)
  } catch (e) {
    console.warn("[model-editor] could not list existing HDRs:", e)
  }
}

//Per-mode HDR selection
function onNormalHdrPick(id: string) {
  normalHdrId.value = id
  if (!wireframeMode.value) syncEnvForCurrentMode()
}
function onNormalHdrIntensity(v: number) {
  normalHdrIntensity.value = v
  if (!wireframeMode.value && scene) scene.environmentIntensity = v
  requestRender()
}
function onWfHdrPick(id: string) {
  wfHdrId.value = id
  if (wireframeMode.value) syncEnvForCurrentMode()
}
function onWfHdrIntensity(v: number) {
  wfHdrIntensity.value = v
  if (wireframeMode.value && scene) scene.environmentIntensity = v
  requestRender()
}

//===========================================================================
//LIGHT SYSTEM
//===========================================================================
function uniqueId(): string {
  return Math.random().toString(36).slice(2, 10)
}

//Mode-aware accessors so handlers + template can read/write the right
//pair (intensity / color) without branching at every call site.
function lightIntensity(e: LightEntry, mode: LightMode): number {
  return mode === "normal" ? e.normalIntensity : e.wfIntensity
}
function lightColor(e: LightEntry, mode: LightMode): string {
  return mode === "normal" ? e.normalColor : e.wfColor
}
function activeMode(): LightMode {
  return wireframeMode.value ? "wireframe" : "normal"
}

//Push the current mode's intensity + color from each LightEntry onto the
//actual three.js Light object + the gizmo materials. Called on mode
//switch (enter/leave wireframe) and after live edits.
function applyLightsForMode() {
  const mode = activeMode()
  for (const e of lights.value) {
    const intensity = lightIntensity(e, mode)
    const colorHex  = lightColor(e, mode)
    e.light.intensity = intensity
    const col = new Color(colorHex)
    e.light.color.copy(col)
    ;(e.sourceGiz.material as MeshBasicMaterial).color.copy(col)
    if (e.target) (e.target.material as MeshBasicMaterial).color.copy(col)
    if (e.link)   (e.link.material   as LineBasicMaterial).color.copy(col)
  }
  requestRender()
}

function addLight(type: LightType) {
  if (!scene) return
  const id = uniqueId()
  //Defaults: normal mode = white, wireframe mode = the global mode color
  const normalColor = "#ffffff"
  const wfColor     = wireframeColor.value
  const startMode   = activeMode()
  const startColor  = startMode === "normal" ? normalColor : wfColor
  const startIntensity = type === "point" ? POINT_LIGHT_INTENSITY : DIRECTIONAL_LIGHT_INTENSITY
  const colorObj    = new Color(startColor)

  let light: PointLight | DirectionalLight
  if (type === "point") {
    //distance = 0 means infinite range. The user can dial it down via
    //the per-light Range slider, which maps to PointLight.distance.
    light = new PointLight(colorObj, startIntensity, POINT_LIGHT_RANGE_DEFAULT, POINT_LIGHT_DECAY)
  } else {
    light = new DirectionalLight(colorObj, startIntensity)
    light.castShadow = true
    light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    light.shadow.bias       = SHADOW_BIAS
    light.shadow.normalBias = SHADOW_NORMAL_BIAS
    //frustum is tuned later from the bounding sphere via tuneShadowCameras()
    light.shadow.camera.left   = -SHADOW_DEFAULT_HALF_EXTENT
    light.shadow.camera.right  =  SHADOW_DEFAULT_HALF_EXTENT
    light.shadow.camera.top    =  SHADOW_DEFAULT_HALF_EXTENT
    light.shadow.camera.bottom = -SHADOW_DEFAULT_HALF_EXTENT
    light.shadow.camera.near   = SHADOW_DEFAULT_NEAR
    light.shadow.camera.far    = SHADOW_DEFAULT_FAR
    light.shadow.camera.updateProjectionMatrix()
  }
  light.position.set(2, 2, 2)
  scene.add(light)

  const sourceGiz = makeGizmoDiamond(startColor)
  sourceGiz.position.copy(light.position)
  scene.add(sourceGiz)

  const entry: LightEntry = {
    id, type,
    light:     markRaw(light),
    sourceGiz: markRaw(sourceGiz),
    x: 2, y: 2, z: 2,
    range: type === "point" ? POINT_LIGHT_RANGE_DEFAULT : undefined,
    normalIntensity: startIntensity,
    normalColor,
    wfIntensity:     startIntensity,
    wfColor,
    enabled:    true,
    castShadow: type === "directional",   //point lights default OFF (expensive)
  }

  if (type === "directional") {
    const dl = light as DirectionalLight
    const target = makeGizmoDiamond(startColor, true)
    target.position.set(0, 0, 0)
    scene.add(target)
    dl.target = target
    dl.target.updateMatrixWorld()
    entry.target = markRaw(target)
    entry.tx = 0; entry.ty = 0; entry.tz = 0

    //segment between source and target so you see the direction
    const lineGeo = new BufferGeometry().setFromPoints([
      light.position.clone(),
      target.position.clone(),
    ])
    const lineMat = new LineBasicMaterial({ color: colorObj, transparent: true, opacity: DIRECTIONAL_LINK_OPACITY })
    const link = new Line(lineGeo, lineMat)
    scene.add(link)
    entry.link = markRaw(link)
  }

  lights.value = [...lights.value, entry]

  //Always-on lights now (no per-mode visibility, the SHARED light just
  //changes intensity+color between modes). The actual on/off of helpers
  //follows showLightGizmos like before.
  setLightVisibility(entry, true)

  //auto-pick the new light's source gizmo - the user spawns a light to
  //place it, so we drop straight into manipulate mode (camera flies in,
  //transform handles appear). Skip during hydration (we're spawning
  //many at once and don't want a gizmo popping for each).
  if (!hydratingLights) {
    const newIdx = lights.value.length - 1
    queueMicrotask(() => selectGizmo(newIdx, "source"))
  }

  requestRender()
}

//Diamond-shaped marker - octahedron at detail 0 = 8-faced diamond. Drawn
//in wireframe with depth-test off so it's always visible regardless of
//camera angle or what's behind it.
function makeGizmoDiamond(colorHex: string, isTarget = false): Mesh {
  const geo = new OctahedronGeometry(LIGHT_GIZMO_RADIUS, 0)
  const mat = new MeshBasicMaterial({
    color:       new Color(colorHex),
    wireframe:   true,
    transparent: true,
    opacity:     isTarget ? 0.5 : 0.85,
    depthTest:   false,
    depthWrite:  false,
  })
  const diamond = new Mesh(geo, mat)
  diamond.renderOrder = LIGHT_GIZMO_RENDER_ORDER
  return diamond
}

//Light is always on (shared between modes); gizmo helpers follow the
//showLightGizmos toggle so the user can hide visual clutter for a clean
//render without losing the actual lighting.
function setLightVisibility(entry: LightEntry, on: boolean) {
  //Per-light enabled flag is a hard mute - even when `on` is true the
  //light stays off if the author disabled it.
  entry.light.visible     = on && entry.enabled
  const helpers = on && showLightGizmos.value
  entry.sourceGiz.visible = helpers
  if (entry.target) entry.target.visible = helpers
  if (entry.link)   entry.link.visible   = helpers
}

function onLightEnabledChange(idx: number, enabled: boolean) {
  const entry = lights.value[idx]; if (!entry) return
  entry.enabled = enabled
  entry.light.visible = enabled
  requestRender()
}

function ensurePointShadowConfig(light: PointLight) {
  light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
  light.shadow.bias       = SHADOW_BIAS
  light.shadow.normalBias = SHADOW_NORMAL_BIAS
}

function onLightShadowChange(idx: number, castShadow: boolean) {
  const entry = lights.value[idx]; if (!entry) return
  entry.castShadow = castShadow
  if (castShadow && entry.type === "point") ensurePointShadowConfig(entry.light as PointLight)
  entry.light.castShadow = castShadow
  requestRender()
}

function onShowGizmosToggle(v: boolean) {
  showLightGizmos.value = v
  for (const e of lights.value) setLightVisibility(e, true)
  //detach the transform gizmo too when hiding everything
  if (!v && selectedLightId.value) detachLightGizmo()
  requestRender()
}

function removeLight(idx: number) {
  const entry = lights.value[idx]; if (!entry) return
  detachLightGizmoIf(entry.id)
  if (entry.light.parent)     entry.light.parent.remove(entry.light)
  if (entry.sourceGiz.parent) entry.sourceGiz.parent.remove(entry.sourceGiz)
  if (entry.target?.parent)   entry.target.parent.remove(entry.target)
  if (entry.link?.parent)     entry.link.parent.remove(entry.link)
  entry.light.dispose?.()
  if (entry.sourceGiz.material instanceof MeshBasicMaterial) entry.sourceGiz.material.dispose()
  entry.sourceGiz.geometry.dispose()
  if (entry.target?.material instanceof MeshBasicMaterial) entry.target.material.dispose()
  entry.target?.geometry.dispose()
  entry.link?.geometry.dispose()
  if (entry.link?.material instanceof LineBasicMaterial) entry.link.material.dispose()
  lights.value = lights.value.filter((_, i) => i !== idx)
  requestRender()
}

function onLightIntensity(mode: LightMode, idx: number, v: number) {
  const e = lights.value[idx]; if (!e) return
  if (mode === "normal") e.normalIntensity = v
  else                   e.wfIntensity     = v
  if (mode === activeMode()) e.light.intensity = v
  requestRender()
}

//Point-light range: maps directly to PointLight.distance. 0 = infinite,
//otherwise the light falls off to 0 at that radius. UI slider goes up
//to 30 (covers typical scene sizes). Shared between modes.
function onLightRange(idx: number, v: number) {
  const e = lights.value[idx]; if (!e || e.type !== "point") return
  e.range = v
  ;(e.light as PointLight).distance = v
  requestRender()
}

//Hover on a light row in the panel tints its gizmo orange so the user
//can locate the light in the scene without attaching the transform
//handles. Restores the active-mode color on leave.
function onLightHover(idx: number, on: boolean) {
  const e = lights.value[idx]; if (!e) return
  const col = on ? new Color(PICK_COLOR) : new Color(lightColor(e, activeMode()))
  ;(e.sourceGiz.material as MeshBasicMaterial).color.copy(col)
  if (e.target) (e.target.material as MeshBasicMaterial).color.copy(col)
  if (e.link)   (e.link.material   as LineBasicMaterial).color.copy(col)
  requestRender()
}

function onLightPosition(idx: number, axis: "x" | "y" | "z", v: number) {
  const e = lights.value[idx]; if (!e) return
  e[axis] = v
  e.light.position.set(e.x, e.y, e.z)
  e.sourceGiz.position.copy(e.light.position)
  if (e.link) updateLinkGeometry(e)
  requestRender()
}

function onLightTargetPosition(idx: number, axis: "x" | "y" | "z", v: number) {
  const e = lights.value[idx]; if (!e || !e.target) return
  const key = (axis === "x" ? "tx" : axis === "y" ? "ty" : "tz") as "tx" | "ty" | "tz"
  e[key] = v
  e.target.position.set(e.tx!, e.ty!, e.tz!)
  ;(e.light as DirectionalLight).target.updateMatrixWorld()
  if (e.link) updateLinkGeometry(e)
  requestRender()
}

function onLightColorChange(mode: LightMode, idx: number, hex: string) {
  const e = lights.value[idx]; if (!e) return
  if (mode === "normal") e.normalColor = hex
  else                   e.wfColor     = hex
  if (mode === activeMode()) {
    const col = new Color(hex)
    e.light.color.copy(col)
    ;(e.sourceGiz.material as MeshBasicMaterial).color.copy(col)
    if (e.target) (e.target.material as MeshBasicMaterial).color.copy(col)
    if (e.link)   (e.link.material   as LineBasicMaterial).color.copy(col)
  }
  requestRender()
}

function updateLinkGeometry(e: LightEntry) {
  if (!e.link || !e.target) return
  e.link.geometry.setFromPoints([e.light.position.clone(), e.target.position.clone()])
}

//(reTintWfLightsAfterColorChange removed - wf lights now keep their
//own per-light color, the mode color is just the default for new ones)

//===========================================================================
//GIZMO SELECT / DESELECT
//===========================================================================
//Encoded as `${kind}:${entryId}` - kind is `src` for the light source
//or `tgt` for the target gizmo (directional only). Mode is no longer in
//the id because lights are shared between modes now.
function entryAndGizmoFor(id: string): { entry: LightEntry; target: "source" | "target" } | null {
  const [kind, uuid] = id.split(":")
  if (!kind || !uuid) return null
  const entry = lights.value.find((l) => l.id === uuid); if (!entry) return null
  return { entry, target: kind === "tgt" ? "target" : "source" }
}

function selectGizmo(idx: number, which: "source" | "target") {
  if (!transformCtrls) return
  const entry = lights.value[idx]; if (!entry) return

  const id = `${which === "target" ? "tgt" : "src"}:${entry.id}`
  if (selectedLightId.value === id) { detachLightGizmo(); return }

  selectedLightId.value = id

  if (which === "target" && entry.target) transformCtrls.attach(entry.target)
  else                                    transformCtrls.attach(entry.light)

  //Surface the matching panel section: in wireframe mode flip to the
  //Wireframe tab + open its Lights accordion; in normal mode flip to
  //the Lights tab + open the Lights accordion. Both also slide to the
  //selected row via scrollIntoView once the panel rerenders.
  if (wireframeMode.value) {
    tab.value = "wireframe"
    sectionOpen.value.wfLights = true
  } else {
    tab.value = "lights"
    sectionOpen.value.lightsList = true
  }
  queueMicrotask(() => {
    const el = document.querySelector(`.editor__mat--selected`)
    if (el instanceof HTMLElement) el.scrollIntoView({ behavior: "smooth", block: "center" })
  })

  //smoothly move the camera so the gizmo is in frame
  if (cameraRef && controls) {
    const focus = which === "target" ? entry.target!.position.clone() : entry.light.position.clone()
    const distance = cameraRef.position.distanceTo(controls.target)
    const offset = cameraRef.position.clone().sub(controls.target).normalize().multiplyScalar(distance)
    cameraAnim = makeCameraAnim({
      toPos:    focus.clone().add(offset),
      toTarget: focus,
      duration: GIZMO_SELECT_DURATION_MS,
    })
    requestRender(GIZMO_SELECT_DURATION_MS + 300)
  }
  requestRender()
}

function detachLightGizmo() {
  if (transformCtrls) transformCtrls.detach()
  selectedLightId.value = null
  requestRender()
}

function detachLightGizmoIf(uuid: string) {
  if (!selectedLightId.value) return
  if (selectedLightId.value.includes(`:${uuid}`)) detachLightGizmo()
}

function syncGizmoTargetToData() {
  const id = selectedLightId.value; if (!id) return
  const info = entryAndGizmoFor(id); if (!info) return
  const e = info.entry
  if (info.target === "source") {
    e.x = e.light.position.x; e.y = e.light.position.y; e.z = e.light.position.z
    e.sourceGiz.position.copy(e.light.position)
  } else if (e.target) {
    e.tx = e.target.position.x; e.ty = e.target.position.y; e.tz = e.target.position.z
    ;(e.light as DirectionalLight).target.updateMatrixWorld()
  }
  if (e.link) updateLinkGeometry(e)
}

//===========================================================================
//WIREFRAME MODE
//===========================================================================
//Wireframe is now toggled explicitly via the Grid button in the viewport
//toolbar. Switching to the Wireframe tab no longer enables the preview -
//the author was clobbering the live render every time they opened the
//section to tune a slider.

function ensureWfMaterials() {
  if (wfBaseMat && wfPickMat) return
  //polygonOffset pushes the surface BACK in z so the wireframe line
  //overlay (sharing the same geometry) lands in front without z-fighting
  //and without needing depthTest:false on lines (which would make them
  //bleed through every other mesh - the bug the user reported).
  wfBaseMat = new MeshPhysicalMaterial({
    color:             new Color(wfMatParams.value.color),
    metalness:         wfMatParams.value.metalness,
    roughness:         wfMatParams.value.roughness,
    envMapIntensity:   wfMatParams.value.envMapIntensity,
    specularIntensity: wfMatParams.value.specularIntensity,
    polygonOffset:       true,
    polygonOffsetFactor: POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits:  POLYGON_OFFSET_UNITS,
  })
  wfPickMat = new MeshPhysicalMaterial({
    color:             new Color(wfMatParams.value.color),
    metalness:         wfMatParams.value.metalness,
    roughness:         wfMatParams.value.roughness,
    envMapIntensity:   wfMatParams.value.envMapIntensity,
    specularIntensity: wfMatParams.value.specularIntensity,
    emissive:          new Color(PICK_COLOR),
    emissiveIntensity: 1.5,
    polygonOffset:       true,
    polygonOffsetFactor: POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits:  POLYGON_OFFSET_UNITS,
  })
}

function syncWfMaterialsParams() {
  if (!wfBaseMat || !wfPickMat) return
  const p = wfMatParams.value
  for (const m of [wfBaseMat, wfPickMat]) {
    m.color.set(p.color)
    m.metalness         = p.metalness
    m.roughness         = p.roughness
    m.envMapIntensity   = p.envMapIntensity
    m.specularIntensity = p.specularIntensity
    m.needsUpdate       = true
  }
  //per-emissive materials track the wf base params too (color/metal/etc),
  //they keep their own emissive intensity
  for (const e of emissiveList.value) {
    e.material.color.set(p.color)
    e.material.metalness         = p.metalness
    e.material.roughness         = p.roughness
    e.material.envMapIntensity   = p.envMapIntensity
    e.material.specularIntensity = p.specularIntensity
    e.material.needsUpdate       = true
  }
}

function makeEmissiveMaterial(intensity: number): MeshPhysicalMaterial {
  const p = wfMatParams.value
  return new MeshPhysicalMaterial({
    color:             new Color(p.color),
    metalness:         p.metalness,
    roughness:         p.roughness,
    envMapIntensity:   p.envMapIntensity,
    specularIntensity: p.specularIntensity,
    emissive:          new Color(wireframeColor.value),
    emissiveIntensity: intensity,
  })
}

function setMaterialFor(mesh: Mesh) {
  if (!wfBaseMat || !wfPickMat) return
  if (pickedMeshIdx.value !== null && sceneMeshes.value[pickedMeshIdx.value]?.mesh.uuid === mesh.uuid) {
    mesh.material = wfPickMat
  } else {
    const ent = findEmissive(mesh.uuid)
    if (ent) mesh.material = ent.material
    else     mesh.material = wfBaseMat
  }
}

//ONE material - the original, patched with the sweep shader. The final
//"wireframe-on" state is just uWfProgress=1 plus the lights + HDR +
//overlays for the wireframe mode. Fragments past sweepEnd stay
//un-tinted because the shader's smoothstep clip naturally drops them.
//No material swap means a too-short sweepEnd produces a permanent
//partial-blend, exactly what the user is dialing for.
function finalizeEnterWireframe() {
  if (!scene) return
  syncWireframeOverlays()
  applyLightsForMode()
  syncEnvForCurrentMode()
}

function enableWireframeMode() {
  if (!scene) return
  wireframeMode.value = true
  //Refresh sweep uniforms - axis, start, end, tint - so the preview
  //reflects unsaved edits.
  refreshSweepTint()
  recomputeSweepRange()
  //Tint reveal runs on the originals. finalizeEnterWireframe() at the
  //end attaches the edge overlays and snaps lights + HDR over.
  wfTransition = { startTime: performance.now(), from: 0, to: 1, duration: WF_SWEEP_DURATION_MS, phase: "enter" }
  requestRender(WF_SWEEP_DURATION_MS + 200)
}

function disableWireframeMode() {
  wireframeMode.value = false
  //No material swap to undo - we only ever ran the shader on the
  //originals. Just remove the overlays + flip lights + HDR back, then
  //drive uWfProgress back to 0.
  removeWireframeOverlays()
  applyLightsForMode()
  syncEnvForCurrentMode()
  pickedMeshIdx.value = null
  wfTransition = { startTime: performance.now(), from: 1, to: 0, duration: WF_SWEEP_DURATION_MS, phase: "leave" }
  requestRender(WF_SWEEP_DURATION_MS + 200)
}

function ensureOverlayForMesh(mesh: Mesh) {
  if (!scene) return
  if (wfOverlays.has(mesh.uuid)) return
  if (emissiveList.value.some((e) => e.uuid === mesh.uuid)) return   //emissive picks stay clean, no wireframe
  //Currently picked (orange-highlight) mesh also stays clean - the
  //overlay would compete visually with the pick highlight.
  if (pickedMeshIdx.value !== null && sceneMeshes.value[pickedMeshIdx.value]?.mesh.uuid === mesh.uuid) return
  //Reuse the precomputed EdgesGeometry when the threshold hasn't
  //changed since the warmup pass. Otherwise we'd pay the geometry
  //computation again on the first toggle frame - that's the actual
  //wireframe-toggle stall on complex models.
  let edgesGeo: EdgesGeometry
  if (precomputedEdges.has(mesh.uuid) && precomputedEdgesThreshold === wireframeEdgeThreshold.value) {
    edgesGeo = precomputedEdges.get(mesh.uuid)!
  } else {
    edgesGeo = new EdgesGeometry(mesh.geometry, wireframeEdgeThreshold.value)
  }
  //depthTest stays ON so the lines respect occlusion (no X-ray bleed
  //across other meshes). The wf base / pick materials carry a
  //polygonOffset that pushes the surface back, so the overlay lines
  //land just in front of it without z-fighting.
  const overlayMat = new LineBasicMaterial({
    color:       new Color(wireframeOverlayColor.value),
    transparent: true,
    opacity:     WIREFRAME_LINE_OPACITY,
    depthWrite:  false,
  })
  const overlay = new LineSegments(edgesGeo, overlayMat)
  overlay.renderOrder = WIREFRAME_OVERLAY_RENDER_ORDER
  mesh.add(overlay)
  wfOverlays.set(mesh.uuid, overlay)
}

function removeOverlayForMesh(uuid: string) {
  const overlay = wfOverlays.get(uuid); if (!overlay) return
  if (overlay.parent) overlay.parent.remove(overlay)
  if (overlay.material instanceof LineBasicMaterial) overlay.material.dispose()
  //Only dispose the geometry if it isn't the cached pre-computed one
  //(the cache survives toggles; the warmup is re-run on threshold change).
  if (precomputedEdges.get(uuid) !== overlay.geometry) overlay.geometry.dispose()
  wfOverlays.delete(uuid)
}

function syncWireframeOverlays() {
  if (!scene) return
  if (wireframeOverlayOn.value) {
    for (const sm of sceneMeshes.value) ensureOverlayForMesh(sm.mesh)
  } else {
    removeWireframeOverlays()
  }
}

function onWireframeOverlayColor(hex: string) {
  wireframeOverlayColor.value = hex
  saveGlobalPref(WF_LINE_COLOR_KEY, hex, "Wireframe line color (shared across every project in the editor).")
  for (const overlay of wfOverlays.values()) {
    if (overlay.material instanceof LineBasicMaterial) {
      overlay.material.color.set(hex)
      overlay.material.needsUpdate = true
    }
  }
  requestRender()
}

//Sweep handlers - per-project values saved with the main viewer
//settings when the user clicks Save. Refs are mutated in place;
//ThreeViewer reads them after a reload to drive the wipe.
function onSweepAxis(idx: 0 | 1 | 2, v: number) {
  const a = [...sweepAxis.value] as [number, number, number]
  a[idx] = v
  sweepAxis.value = a
}
function onSweepStart(v: number) { sweepStart.value = v }
function onSweepEnd(v: number)   { sweepEnd.value   = v }

//Edge-threshold slider - the EdgesGeometry per overlay was baked at
//mount-time with the OLD threshold; we need to nuke + rebuild so the
//new angle takes effect on the next paint.
function onWireframeEdgeThreshold(deg: number) {
  if (!Number.isFinite(deg)) return
  wireframeEdgeThreshold.value = deg
  saveGlobalPref(WF_EDGE_THRESHOLD_KEY, String(deg), "Wireframe edge-threshold in degrees (shared across every project in the editor).")
  removeWireframeOverlays()
  //Rebuild the precomputed edges cache against the new threshold so
  //subsequent toggles stay free of the recompute stall.
  buildPrecomputedEdges()
  syncWireframeOverlays()
  requestRender()
}

function removeWireframeOverlays() {
  for (const [uuid, overlay] of wfOverlays.entries()) {
    if (overlay.parent) overlay.parent.remove(overlay)
    if (overlay.material instanceof LineBasicMaterial) overlay.material.dispose()
    //preserve the pre-computed edges (re-used on next toggle).
    if (precomputedEdges.get(uuid) !== overlay.geometry) overlay.geometry.dispose()
  }
  wfOverlays.clear()
}

function onWireframeOverlayToggle(v: boolean) {
  wireframeOverlayOn.value = v
  if (wireframeMode.value) syncWireframeOverlays()
  requestRender()
}

function onWireframeColorChange(hex: string) {
  //Mode color is the DEFAULT for newly-added wf lights and the tint
  //applied to emissive picks. Existing wf lights keep their own color
  //so the user can color-pick each independently. Persisted globally.
  wireframeColor.value = hex
  saveGlobalPref(WF_MODE_COLOR_KEY, hex, "Wireframe mode color (shared across every project in the editor).")
  for (const e of emissiveList.value) {
    e.material.emissive.set(hex)
    e.material.needsUpdate = true
  }
  requestRender()
}

function onEmissiveItemIntensity(uuid: string, v: number) {
  const e = findEmissive(uuid); if (!e) return
  e.intensity = v
  e.material.emissiveIntensity = v
  requestRender()
}

function onWfMatParam<K extends keyof WfMaterialParams>(key: K, value: WfMaterialParams[K]) {
  wfMatParams.value[key] = value
  saveGlobalPref(WF_MAT_PARAMS_KEY, JSON.stringify(wfMatParams.value),
    "Wireframe shared material params (color, metalness, roughness, env, specular).")
  syncWfMaterialsParams()
  requestRender()
}

//Shared global-pref save with LOUD failure: silent .catch was hiding 401s
//in dev:client and the user thought the value had persisted (locally it
//had) but the DB had nothing. Logs success too so the network trace is
//easy to verify.
function saveGlobalPref(key: string, value: string, description: string) {
  updateSetting(key, value, { type: "string", group: "editor3d", description })
    .then(() => console.log(`[model-editor] saved ${key} = ${value}`))
    .catch((err: unknown) => {
      console.error(`[model-editor] FAILED to save ${key}:`, err)
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("editor3d:save-failed", { detail: { key, err: String(err) } }))
    })
}

//===========================================================================
//CLICK PICKER (with click vs drag discrimination + Escape support)
//===========================================================================
const raycaster = new Raycaster()
const pickerNdc = new Vector2()

function onCanvasPointerDown(e: PointerEvent) {
  pointerDownX  = e.clientX
  pointerDownY  = e.clientY
  pointerDownAt = performance.now()
}

//Custom click against ViewHelper's interactive axis meshes. We reach into
//its internals (interactiveObjects + orthoCamera) instead of calling
//handleClick directly because Three's built-in animation slerps the camera
//quaternion through a degenerate orientation when going to top/bottom
//views, producing a final snap. Doing our own per-axis snapToView with an
//explicit up vector avoids that.
function checkViewHelperClick(e: PointerEvent): boolean {
  if (!viewHelper || !canvas.value || !cameraRef) return false

  const dom = canvas.value
  const rect = dom.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  //ViewHelper renders to a 128x128 viewport in the bottom-right corner
  const dim = 128
  const gx = dom.clientWidth  - dim
  const gy = dom.clientHeight - dim
  if (x < gx || x > gx + dim || y < gy || y > gy + dim) return false

  //NDC within the gizmo viewport
  const nx =  ((x - gx) / dim) * 2 - 1
  const ny = -(((y - gy) / dim) * 2 - 1)

  //ViewHelper's internal ortho camera (not exposed on the instance, but
  //its setup is fixed and matches the source). The viewHelper.quaternion
  //is mirrored from the scene camera each render, so we sync it before
  //the raycast so the world positions of the axis sprites match what's
  //actually drawn on screen.
  const orthoCam = new OrthographicCamera(-2, 2, 2, -2, 0, 4)
  orthoCam.position.set(0, 0, 2)
  viewHelper.quaternion.copy(cameraRef.quaternion).invert()
  viewHelper.updateMatrixWorld(true)

  //Axis sprites live as children of viewHelper with userData.type
  //("posX", "negY", etc).
  const interactive: import("three").Object3D[] = []
  viewHelper.traverse((o) => { if ((o.userData as { type?: string })?.type) interactive.push(o) })

  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(nx, ny), orthoCam)
  const hits = ray.intersectObjects(interactive, false)
  if (hits.length === 0) return false

  const axis = (hits[0]!.object.userData as { type?: string }).type
  if (!axis) return false
  snapToView(axis)
  return true
}

//Save / restore the start view (camera pose used by the production
//viewer's intro fly-in). Capturing the live camera + orbit target lets
//the author frame a shot in the editor and have the public viewer land
//on the exact same composition. Persists immediately so the button is
//still wired up after a reload - relying on the bottom Save was too
//easy to forget and led to "the start view button doesn't work" reports.
function capturePose() {
  if (!cameraRef || !controls) return null
  return {
    pos:    [cameraRef.position.x, cameraRef.position.y, cameraRef.position.z] as [number, number, number],
    target: [controls.target.x,    controls.target.y,    controls.target.z]    as [number, number, number],
  }
}

async function persistStartView(field: "startView" | "startViewMobile", sv: { pos: [number, number, number]; target: [number, number, number] }) {
  if (!Number.isFinite(projectId.value)) return
  status.value = `${field === "startView" ? "Desktop" : "Phone"} start captured (saving...)`
  isSaving.value = true; saveError.value = null
  try {
    const res = await fetch(`/api/main-project/${projectId.value}/viewer-settings/start-view`, {
      method:      "PUT",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
      body:        JSON.stringify({ [field]: sv }),
    })
    if (!res.ok) throw new Error(`save ${res.status}`)
    status.value = `${field === "startView" ? "Desktop" : "Phone"} start saved`
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e)
    status.value    = `Save failed: ${saveError.value}`
    console.error("[edit-3d] start-view save failed:", e)
  } finally {
    isSaving.value = false
    setTimeout(() => { status.value = `Materials: ${materials.value.length}` }, 2000)
  }
}

async function saveStartView() {
  const sv = capturePose(); if (!sv) return
  startView.value = sv
  await persistStartView("startView", sv)
}

async function saveStartViewMobile() {
  const sv = capturePose(); if (!sv) return
  startViewMobile.value = sv
  await persistStartView("startViewMobile", sv)
}

function goToStartViewMobile() {
  if (!cameraRef || !controls || !startViewMobile.value) return
  cameraAnim = makeCameraAnim({
    toPos:    new Vector3(...startViewMobile.value.pos),
    toTarget: new Vector3(...startViewMobile.value.target),
    toUp:     new Vector3(0, 1, 0),
    duration: GO_TO_START_DURATION_MS,
  })
  requestRender(GO_TO_START_DURATION_MS + 400)
}

//Animate the editor camera to the saved start view so the author can
//verify what visitors will see on first paint.
function goToStartView() {
  if (!cameraRef || !controls || !startView.value) return
  cameraAnim = makeCameraAnim({
    toPos:    new Vector3(...startView.value.pos),
    toTarget: new Vector3(...startView.value.target),
    toUp:     new Vector3(0, 1, 0),
    duration: GO_TO_START_DURATION_MS,
  })
  requestRender(GO_TO_START_DURATION_MS + 400)
}

//CAMERA TOGGLE - swap between perspective and orthographic projections.
//The two cameras share position + target + up so the visible angle of
//the model stays the same; only the projection math changes. Ortho is
//useful for clean axis views (top / front / side) because parallel
//projection has no foreshortening - parallel edges stay parallel and
//the top view doesn't have any perspective skew at the poles.
function tuneOrthoFrustum() {
  if (!orthoCamera || !perspectiveCamera || !controls) return
  //Vertical world-height visible at the ACTIVE camera's distance under
  //the perspective FOV. Use cameraRef (not perspectiveCamera) so the
  //frustum tracks ortho-mode dollying too - otherwise resizing during
  //ortho would scale the model based on a stale perspective distance.
  const activePos = (cameraRef ?? perspectiveCamera).position
  const distance = activePos.distanceTo(controls.target)
  const vfov = perspectiveCamera.fov * (Math.PI / 180)
  const halfH = Math.tan(vfov / 2) * distance
  const halfW = halfH * TARGET_ASPECT
  orthoCamera.left   = -halfW
  orthoCamera.right  =  halfW
  orthoCamera.top    =  halfH
  orthoCamera.bottom = -halfH
  orthoCamera.near   = perspectiveCamera.near
  orthoCamera.far    = perspectiveCamera.far
  orthoCamera.updateProjectionMatrix()
}

function switchCamera(mode: "persp" | "ortho") {
  if (!perspectiveCamera || !orthoCamera || !controls || !renderPass) return
  if (cameraMode.value === mode) return
  cameraMode.value = mode

  //Sync pose between cameras so the swap is seamless. Both cameras share
  //position + target + up; only the projection differs.
  const from = (mode === "ortho" ? perspectiveCamera : orthoCamera) as PerspectiveCamera | OrthographicCamera
  const to   = (mode === "ortho" ? orthoCamera       : perspectiveCamera) as PerspectiveCamera | OrthographicCamera
  to.position.copy(from.position)
  to.up.copy(from.up)
  to.lookAt(controls.target)
  if (mode === "ortho") tuneOrthoFrustum()

  cameraRef = to
  renderPass.camera = to
  controls.object   = to
  controls.update()
  //TransformControls' drag math (hit-test against the colored arrows /
  //rings) reads from its bound camera every frame, so a stale camera
  //reference makes the gizmo unusable - cursor offsets get wrong, the
  //axis hover state lags, etc. Re-bind it explicitly on every swap.
  if (transformCtrls) {
    transformCtrls.camera = to as PerspectiveCamera
  }
  //ViewHelper exposes no public camera setter; recreate it so its axis
  //quaternion mirror tracks the active camera.
  if (renderer && canvas.value && viewHelper) {
    viewHelper.dispose()
    viewHelper = new ViewHelper(to, canvas.value)
  }
  requestRender(500)
}

//===========================================================================
//AXIS VIEW SNAP - compute target pose at click time, then slerp the
//camera quaternion + lerp the camera position. Same easing the gizmo
//selection uses. Done.
//
//Per-axis target pose:
//  - dir: unit vector from focus toward target camera position (so
//    target pos = focus + dir * radius)
//  - toUp: camera.up at the END of the animation (matters for what
//    OrbitControls treats as "north" when the user starts orbiting
//    afterwards; for top/bottom we tilt up to (0,0,∓1) to avoid the
//    Spherical.makeSafe clamp pulling the camera off the pole)
//  - targetQuat: orientation derived by placing a probe camera at the
//    target position with the chosen up and pointing it at focus
//===========================================================================
function snapToView(axis: string) {
  if (!cameraRef || !controls) return
  switchCamera("ortho")
  //Disable OrbitControls for the duration of the animation so input
  //handling + damping decay can't fight the lerp. Re-enabled at the
  //end of cameraAnim (in the tick handler).
  controls.enabled = false

  //ALWAYS snap to the model's actual center (sceneCenter) - not the
  //current controls.target. The target can drift away from the model
  //center via panning or via the initial-framing offset (which puts
  //the target at sphere.radius * 0.8 ~= 20% below center). Without
  //this, axis snaps put the camera at the WRONG height and the user
  //sees the model offset in the view ("je suis un peu en dessous").
  const focus  = sceneCenter.clone()
  //Keep the same distance the user was already at so zooming feels
  //preserved across snaps.
  const radius = Math.max(cameraRef.position.distanceTo(focus), sceneRadius * 1.2)

  const dir  = new Vector3()
  const toUp = new Vector3(0, 1, 0)
  switch (axis) {
    case "posX": dir.set( 1, 0, 0); break
    case "negX": dir.set(-1, 0, 0); break
    case "posY": dir.set( 0, 1, 0); toUp.set(0, 0, -1); break
    case "negY": dir.set( 0,-1, 0); toUp.set(0, 0,  1); break
    case "posZ": dir.set( 0, 0, 1); break
    case "negZ": dir.set( 0, 0,-1); break
    default: return
  }
  const toPos = focus.clone().add(dir.multiplyScalar(radius))

  cameraAnim = makeCameraAnim({
    toPos,
    toTarget: focus,
    toUp,
    duration: AXIS_SNAP_DURATION_MS,
  })
  requestRender(AXIS_SNAP_DURATION_MS + 200)
}

function onCanvasPointerUp(e: PointerEvent) {
  //ViewHelper axis click. Use our OWN raycast + snapToView animation so
  //we can pre-tilt camera.up to (0,0,-1) for top / (0,0,+1) for bottom
  //BEFORE the lerp begins - that's what kills the lookAt degeneracy that
  //causes the camera to roll-snap at the end of the top-view animation.
  //handleClick is the safety fallback if our raycast misses (it picks
  //up the same axis sprites with the helper's own internal ortho cam).
  if (checkViewHelperClick(e)) return
  if (viewHelper && viewHelper.handleClick(e)) { requestRender(1000); return }
  const dx = e.clientX - pointerDownX
  const dy = e.clientY - pointerDownY
  const dist = Math.hypot(dx, dy)
  if (dist > POINTER_DRAG_THRESHOLD) return  //it was a drag, not a click
  if (!cameraRef || !canvas.value) return

  const rect = canvas.value.getBoundingClientRect()
  pickerNdc.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1
  pickerNdc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
  raycaster.setFromCamera(pickerNdc, cameraRef)

  //GIZMO PICK - clicking on a light's source/target diamond in the scene
  //attaches the TransformControls directly (same effect as clicking the
  //S / T button in the panel). Only the active mode's lights count.
  if (tryPickLightGizmo()) return

  const meshList = sceneMeshes.value.map((sm) => sm.mesh)
  const hits = raycaster.intersectObjects(meshList, false)
  if (hits.length === 0) return
  const hit = hits[0]!.object as Mesh
  const idx = sceneMeshes.value.findIndex((sm) => sm.mesh.uuid === hit.uuid)
  if (idx < 0) return

  if (tab.value === "materials") openMaterialFor(sceneMeshes.value[idx]!.mesh)
  else if (tab.value === "wireframe" && wireframeMode.value) pickMeshForEmissive(idx)
}

//Raycast against every visible light gizmo (source diamond + optional
//target diamond). On a hit we route through selectGizmo so the camera
//animation + selection state behave exactly like the panel button.
function tryPickLightGizmo(): boolean {
  if (!showLightGizmos.value) return false
  if (lights.value.length === 0) return false

  const gizmos: { mesh: Mesh; idx: number; which: "source" | "target" }[] = []
  for (let i = 0; i < lights.value.length; i++) {
    const e = lights.value[i]!
    gizmos.push({ mesh: e.sourceGiz, idx: i, which: "source" })
    if (e.target) gizmos.push({ mesh: e.target, idx: i, which: "target" })
  }
  const hits = raycaster.intersectObjects(gizmos.map((g) => g.mesh), false)
  if (hits.length === 0) return false
  const picked = gizmos.find((g) => g.mesh.uuid === hits[0]!.object.uuid)
  if (!picked) return false
  selectGizmo(picked.idx, picked.which)
  return true
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Enter" && pickedMeshIdx.value !== null) {
    addPickedToEmissive()
    e.preventDefault()
    return
  }
  //Delete / Backspace removes the currently selected light. Only fires
  //when the focus is somewhere we don't want to swallow typing in (i.e.
  //not on an input / textarea / contenteditable).
  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedLightId.value && !isTypingTarget(e.target)) {
      const info = entryAndGizmoFor(selectedLightId.value)
      if (info) {
        const idx = lights.value.findIndex((l) => l.id === info.entry.id)
        if (idx >= 0) {
          removeLight(idx)
          e.preventDefault()
          return
        }
      }
    }
  }
  if (e.key === "Escape") {
    if (pickedMeshIdx.value !== null) {
      const sm = sceneMeshes.value[pickedMeshIdx.value]
      if (sm) setMaterialFor(sm.mesh)
      pickedMeshIdx.value = null
      requestRender()
    }
    if (selectedLightId.value !== null) detachLightGizmo()
  }
}

//Skip the global delete shortcut when the user is editing text - the
//range / color / number inputs in the panel use Backspace to clear digits.
function isTypingTarget(t: EventTarget | null): boolean {
  if (!t) return false
  const el = t as HTMLElement
  const tag = el.tagName?.toLowerCase()
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  if (el.isContentEditable) return true
  return false
}

function pickMeshForEmissive(idx: number) {
  const sm = sceneMeshes.value[idx]; if (!sm) return
  //release previous orange + put its wireframe overlay back
  if (pickedMeshIdx.value !== null) {
    const prev = sceneMeshes.value[pickedMeshIdx.value]
    if (prev) {
      const prevIdx = pickedMeshIdx.value
      pickedMeshIdx.value = null
      if (prevIdx !== idx) {
        setMaterialFor(prev.mesh)
        if (wireframeMode.value && wireframeOverlayOn.value) ensureOverlayForMesh(prev.mesh)
      }
    }
  }
  if (pickedMeshIdx.value === idx) {
    pickedMeshIdx.value = null
    setMaterialFor(sm.mesh)
    if (wireframeMode.value && wireframeOverlayOn.value) ensureOverlayForMesh(sm.mesh)
    requestRender(); return
  }
  pickedMeshIdx.value = idx
  setMaterialFor(sm.mesh)
  //Picked mesh's overlay is removed so the orange highlight reads clean.
  removeOverlayForMesh(sm.mesh.uuid)
  requestRender()
}

function addPickedToEmissive() {
  if (pickedMeshIdx.value === null) return
  const sm = sceneMeshes.value[pickedMeshIdx.value]; if (!sm) return
  if (!isEmissiveMesh(sm.mesh.uuid)) {
    const material = makeEmissiveMaterial(wireframeEmissive.value)
    emissiveList.value = [...emissiveList.value, {
      uuid: sm.mesh.uuid, intensity: wireframeEmissive.value, material,
    }]
  }
  pickedMeshIdx.value = null
  setMaterialFor(sm.mesh)
  //emissive picks render clean (no wireframe overlay), drop it now
  removeOverlayForMesh(sm.mesh.uuid)
  requestRender()
}

function removeFromEmissive(uuid: string) {
  const ent = findEmissive(uuid)
  emissiveList.value = emissiveList.value.filter((e) => e.uuid !== uuid)
  if (ent) ent.material.dispose()
  const sm = sceneMeshes.value.find((s) => s.mesh.uuid === uuid)
  if (sm) {
    setMaterialFor(sm.mesh)
    //back to a regular wireframe-mode mesh - put the overlay back
    if (wireframeMode.value && wireframeOverlayOn.value) ensureOverlayForMesh(sm.mesh)
  }
  requestRender()
}

//===========================================================================
//SAVE (stub)
//===========================================================================
const dirty = computed(() => true)
async function onSave() {
  const payload = {
    //null when no start view captured - production viewer falls back to
    //the bounding-box auto-frame in that case.
    startView:       startView.value,
    startViewMobile: startViewMobile.value,
    materials: materials.value.map((e) => ({
      uuid: e.material.uuid, name: e.material.name,
      color: e.color, emissive: e.emissive, emissiveEnabled: e.emissiveEnabled,
      emissiveIntensity: e.emissiveIntensity,
      metalness: e.metalness, roughness: e.roughness,
      envMapIntensity: e.envMapIntensity, specularIntensity: e.specularIntensity,
    })),
    //SHARED LIGHTS - one entry per light with both modes' intensity+color
    lights: lights.value.map((l) => ({
      id:    l.id,
      type:  l.type,
      x: l.x, y: l.y, z: l.z, tx: l.tx, ty: l.ty, tz: l.tz,
      range: l.range,
      normalIntensity: l.normalIntensity,
      normalColor:     l.normalColor,
      wfIntensity:     l.wfIntensity,
      wfColor:         l.wfColor,
      enabled:         l.enabled,
      castShadow:      l.castShadow,
    })),
    normalMode: {
      //hdrId is kept for debug / re-hydration in the editor; hdrUrl is
      //the resolved /media/<storedFilename> path embedded so ThreeViewer
      //can apply the env without needing the file library at runtime.
      hdrId:  normalHdrId.value,
      hdrUrl: normalHdrId.value ? (hdris.value.find((h) => h.id === normalHdrId.value)?.url ?? null) : null,
      hdrIntensity: normalHdrIntensity.value,
    },
    wireframeMode: {
      hdrId:  wfHdrId.value,
      hdrUrl: wfHdrId.value ? (hdris.value.find((h) => h.id === wfHdrId.value)?.url ?? null) : null,
      hdrIntensity: wfHdrIntensity.value,
      color: wireframeColor.value,
      overlayOn: wireframeOverlayOn.value, overlayColor: wireframeOverlayColor.value,
      material: wfMatParams.value,
      sweepAxis:  sweepAxis.value,
      sweepStart: sweepStart.value,
      sweepEnd:   sweepEnd.value,
      //emissive picks are stored by mesh NAME because mesh.uuid is
      //regenerated by GLTFLoader on every reload, so uuid can't survive
      //a page refresh. Names come from the original glTF and are stable.
      emissiveMeshes: emissiveList.value.map((e) => {
        const sm = sceneMeshes.value.find((s) => s.mesh.uuid === e.uuid)
        return { name: sm?.name ?? "", intensity: e.intensity }
      }),
    },
  }
  await saveViewerSettings(payload)
  status.value = saveError.value ? `Save failed: ${saveError.value}` : "Saved"
  setTimeout(() => { status.value = `Materials: ${materials.value.length}` }, 2000)
}
</script>

<template>
  <div class="editor">
    <!--Film-grain layer matching the main project page look. Sits below
    the canvas (z:1) but above the solid editor bg, so the texture is
    visible through the canvas's transparent clear color.-->
    <div class="editor__grain"></div>
    <div class="editor__stage">
      <!--TOP BAR sits at the stage level (not inside the 16/9 viewport
      box) so the back / title / upload row spans the FULL editor width
      regardless of how the canvas is letterboxed underneath it.-->
      <div class="editor__top-bar">
        <button type="button" class="editor__back" @click="goBack">
          <ArrowLeft :size="14" />
          <span>Back</span>
        </button>
        <span class="editor__top-title">{{ projectTitle }}</span>
        <button v-if="!glbUrl" type="button" class="editor__upload-glb" :disabled="isUploadingGlb" @click="uploadGlb">
          <Upload :size="14" />
          <span>{{ isUploadingGlb ? "Uploading…" : "Upload .glb" }}</span>
        </button>
        <button v-else type="button" class="editor__upload-glb editor__upload-glb--replace" :disabled="isUploadingGlb" @click="uploadGlb">
          <Upload :size="14" />
          <span>{{ isUploadingGlb ? "Uploading…" : "Replace .glb" }}</span>
        </button>
      </div>

      <p v-if="glbUploadError" class="editor__top-err">{{ glbUploadError }}</p>

      <div class="editor__hud">{{ status }}</div>

     <div ref="viewportBox" class="editor__viewport-box">
      <canvas ref="canvas" class="editor__canvas"></canvas>

      <!--SCREEN CENTER crosshair - semi-transparent + sign at the dead
      centre of the viewport so the author can frame compositions on
      that axis. Pointer-events: none so it never blocks orbit.-->
      <div v-if="showCenterCrosshair" class="editor__viewport-crosshair" aria-hidden="true"></div>

      <!--Viewport-corner toolbar: clusters in the bottom-right above the
      ViewHelper viewport so axis-snap + scene-debug controls live in the
      same spot. Stacked vertically, each row owns one feature.-->
      <div class="editor__viewport-tools">
        <!--VIEWPORT TOGGLES - light-gizmos visibility, camera projection,
        center crosshair, and wireframe preview. 2x2 grid so the toolbar
        stays compact instead of stretching as a single row.-->
        <div class="editor__viewport-cluster-grid">
          <button
            type="button"
            class="editor__viewport-tool"
            :class="{ 'editor__viewport-tool--off': !showLightGizmos }"
            :data-tooltip="showLightGizmos ? 'Hide light gizmos' : 'Show light gizmos'"
            @click="onShowGizmosToggle(!showLightGizmos)"
          >
            <component :is="showLightGizmos ? Eye : EyeOff" :size="14" />
          </button>
          <button
            type="button"
            class="editor__viewport-tool"
            :data-tooltip="cameraMode === 'persp' ? 'Switch to orthographic' : 'Switch to perspective'"
            @click="switchCamera(cameraMode === 'persp' ? 'ortho' : 'persp')"
          >
            <component :is="cameraMode === 'persp' ? Box : Square" :size="14" />
          </button>
          <button
            type="button"
            class="editor__viewport-tool"
            :class="{ 'editor__viewport-tool--off': !showCenterCrosshair }"
            :data-tooltip="showCenterCrosshair ? 'Hide center crosshair' : 'Show center crosshair'"
            @click="showCenterCrosshair = !showCenterCrosshair"
          >
            <Crosshair :size="14" />
          </button>
          <button
            type="button"
            class="editor__viewport-tool"
            :class="{ 'editor__viewport-tool--off': !wireframeMode }"
            :data-tooltip="wireframeMode ? 'Disable wireframe preview' : 'Enable wireframe preview'"
            @click="wireframeMode ? disableWireframeMode() : enableWireframeMode()"
          >
            <Grid :size="14" />
          </button>
        </div>

        <!--START POSE grid - two columns (desktop / phone) with a greyed
        device icon as a column "label", then the two action buttons below
        (save + go). Space between the columns separates the two devices.-->
        <div class="editor__viewport-poses">
          <div class="editor__viewport-pose-col">
            <span class="editor__viewport-pose-label" aria-label="Desktop">
              <Monitor :size="14" />
            </span>
            <button
              type="button"
              class="editor__viewport-tool"
              data-tooltip="Save current view as desktop start"
              @click="saveStartView"
            >
              <MapPin :size="14" />
            </button>
            <button
              type="button"
              class="editor__viewport-tool"
              :disabled="!startView"
              data-tooltip="Go to desktop start"
              @click="goToStartView"
            >
              <Home :size="14" />
            </button>
          </div>

          <div class="editor__viewport-pose-col">
            <span class="editor__viewport-pose-label" aria-label="Phone">
              <Smartphone :size="14" />
            </span>
            <button
              type="button"
              class="editor__viewport-tool"
              data-tooltip="Save current view as phone start"
              @click="saveStartViewMobile"
            >
              <MapPin :size="14" />
            </button>
            <button
              type="button"
              class="editor__viewport-tool"
              :disabled="!startViewMobile"
              data-tooltip="Go to phone start"
              @click="goToStartViewMobile"
            >
              <Home :size="14" />
            </button>
          </div>
        </div>

      </div>
     </div>
    </div>

    <aside class="editor__panel">
      <header class="editor__panel-header">
        <h2 class="editor__panel-title">Model editor</h2>
      </header>

      <nav class="editor__tabs" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          role="tab"
          class="editor__tab"
          :class="{ 'editor__tab--active': tab === t.key }"
          :aria-selected="tab === t.key"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </nav>

      <div class="editor__panel-body">
        <!--====================================================================
        MATERIALS
        ====================================================================-->
        <div v-show="tab === 'materials'" class="editor__group">
          <p v-if="!materials.length" class="editor__empty">Waiting for model…</p>

          <article
            v-for="entry in materials"
            :key="entry.material.uuid"
            class="editor__mat"
            :class="{ 'editor__mat--open': entry.expanded }"
          >
            <button
              type="button"
              class="editor__mat-head"
              :aria-expanded="entry.expanded"
              @click="entry.expanded = !entry.expanded"
            >
              <img
                v-if="entry.thumbnail"
                :src="entry.thumbnail"
                :alt="entry.displayName"
                class="editor__mat-swatch editor__mat-swatch--thumb"
              />
              <span
                v-else
                class="editor__mat-swatch"
                :style="{ backgroundColor: entry.color }"
                aria-hidden="true"
              ></span>
              <span class="editor__mat-title">{{ entry.displayName }}</span>
              <ChevronDown :size="14" class="editor__mat-chevron" />
            </button>

            <div v-show="entry.expanded" class="editor__mat-body">
              <div class="editor__row">
                <label class="editor__row-label">Color</label>
                <div class="editor__row-control">
                  <input type="color" class="editor__color" :value="entry.color" @input="(e) => onColorChange(entry, (e.target as HTMLInputElement).value)" />
                  <span class="editor__readout">{{ entry.color }}</span>
                </div>
              </div>

              <div class="editor__row">
                <label class="editor__row-label">Metalness</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="1" step="0.01" :value="entry.metalness" @input="(e) => onSliderChange(entry, 'metalness', parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ entry.metalness.toFixed(2) }}</span>
                </div>
              </div>

              <div class="editor__row">
                <label class="editor__row-label">Reflection</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="1" step="0.01" :value="1 - entry.roughness" @input="(e) => onSliderChange(entry, 'roughness', 1 - parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ (1 - entry.roughness).toFixed(2) }}</span>
                </div>
              </div>

              <div class="editor__row">
                <label class="editor__row-label">Specular</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="1" step="0.01" :value="entry.specularIntensity" @input="(e) => onSliderChange(entry, 'specularIntensity', parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ entry.specularIntensity.toFixed(2) }}</span>
                </div>
              </div>

              <div class="editor__row editor__row--inline">
                <input type="checkbox" class="editor__check" :id="`emi-${entry.material.uuid}`" :checked="entry.emissiveEnabled" @change="(e) => onEmissiveToggle(entry, (e.target as HTMLInputElement).checked)" />
                <label class="editor__row-label" :for="`emi-${entry.material.uuid}`">Emission</label>
              </div>

              <template v-if="entry.emissiveEnabled">
                <div class="editor__row">
                  <label class="editor__row-label">Emission color</label>
                  <div class="editor__row-control">
                    <input type="color" class="editor__color" :value="entry.emissive" @input="(e) => onEmissiveColorChange(entry, (e.target as HTMLInputElement).value)" />
                    <span class="editor__readout">{{ entry.emissive }}</span>
                  </div>
                </div>
                <div class="editor__row">
                  <label class="editor__row-label">Emission intensity</label>
                  <div class="editor__row-control">
                    <input type="range" class="editor__slider" min="0" max="5" step="0.05" :value="entry.emissiveIntensity" @input="(e) => onSliderChange(entry, 'emissiveIntensity', parseFloat((e.target as HTMLInputElement).value))" />
                    <span class="editor__readout">{{ entry.emissiveIntensity.toFixed(2) }}</span>
                  </div>
                </div>
              </template>
            </div>
          </article>
        </div>

        <!--====================================================================
        HDR LIBRARY
        ====================================================================-->
        <div v-show="tab === 'hdr'" class="editor__group">
          <div class="editor__row editor__row--inline">
            <input type="checkbox" class="editor__check" id="show-skybox" :checked="showSkybox" @change="(e) => onSkyboxToggle((e.target as HTMLInputElement).checked)" />
            <label class="editor__row-label" for="show-skybox">Show HDRI as skybox</label>
          </div>

          <div
            class="editor__drop"
            :class="{ 'editor__drop--over': hdrDragOver, 'editor__drop--busy': hdrUploading }"
            @click="onHdrPick"
            @dragover="onHdrDragOver"
            @dragleave="onHdrDragLeave"
            @drop="onHdrDrop"
          >
            <Upload :size="18" />
            <span v-if="hdrUploading">Uploading...</span>
            <span v-else>Drop a .hdr / .exr or click to browse</span>
          </div>

          <p v-if="hdrError" class="editor__error">{{ hdrError }}</p>

          <ul class="editor__hdr-list">
            <li v-for="entry in hdris" :key="entry.id" class="editor__hdr-item">
              <span class="editor__hdr-thumb"><img v-if="entry.thumbnail" :src="entry.thumbnail" alt="" /></span>
              <span class="editor__hdr-name">{{ entry.name }}</span>
              <button type="button" class="editor__sub-remove" :title="`Delete ${entry.name}`" @click="deleteHdr(entry)">×</button>
            </li>
          </ul>
        </div>

        <!--====================================================================
        LIGHTS - normal-mode rig
        ====================================================================-->
        <div v-show="tab === 'lights'" class="editor__group">
          <!--HDR accordion-->
          <section class="editor__section" :class="{ 'editor__section--open': sectionOpen.lightsHdr }">
            <button type="button" class="editor__section-head" @click="sectionOpen.lightsHdr = !sectionOpen.lightsHdr">
              <span class="editor__section-title">HDR</span>
              <ChevronDown :size="14" class="editor__section-chevron" />
            </button>
            <div v-show="sectionOpen.lightsHdr" class="editor__section-body">
              <div class="editor__row">
                <label class="editor__row-label">Source</label>
                <div class="editor__row-control">
                  <select class="editor__select" :value="normalHdrId" @change="(e) => onNormalHdrPick((e.target as HTMLSelectElement).value)">
                    <option value="">Procedural sky</option>
                    <option v-for="h in hdris" :key="h.id" :value="h.id">{{ h.name }}</option>
                  </select>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label">Intensity</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="3" step="0.05" :value="normalHdrIntensity" @input="(e) => onNormalHdrIntensity(parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ normalHdrIntensity.toFixed(2) }}</span>
                </div>
              </div>
            </div>
          </section>

          <!--Lights accordion - SHARED between normal + wireframe. Each
          light has one position + range, plus per-mode intensity + color.-->
          <section class="editor__section" :class="{ 'editor__section--open': sectionOpen.lightsList }">
            <button type="button" class="editor__section-head" @click="sectionOpen.lightsList = !sectionOpen.lightsList">
              <span class="editor__section-title">Lights</span>
              <ChevronDown :size="14" class="editor__section-chevron" />
            </button>
            <div v-show="sectionOpen.lightsList" class="editor__section-body">
              <div class="editor__sub-head">
                <span class="editor__group-title" style="padding: 0">Add light</span>
                <div class="editor__sub-add-group">
                  <button type="button" class="editor__sub-add" @click="addLight('point')">+ Point</button>
                  <button type="button" class="editor__sub-add" @click="addLight('directional')">+ Directional</button>
                </div>
              </div>
              <p v-if="!lights.length" class="editor__empty">No lights — add one above</p>
              <article
                v-for="(e, i) in lights"
                :key="e.id"
                class="editor__mat editor__light-row"
                :class="{ 'editor__mat--selected': selectedLightId?.endsWith(`:${e.id}`) }"
                @mouseenter="onLightHover(i, true)"
                @mouseleave="onLightHover(i, false)"
              >
                <div class="editor__mat-head editor__mat-head--static editor__light-head">
                  <span
                    class="editor__light-swatch-dot"
                    :style="{ backgroundColor: e.normalColor }"
                    aria-hidden="true"
                  ></span>
                  <span class="editor__mat-title editor__light-name">{{ e.type === 'point' ? 'Point' : 'Directional' }} {{ i + 1 }}</span>
                  <!--PER-LIGHT toggles: enabled (Lightbulb) + cast shadow (Sun).
                  Both are checkbox-style mini-buttons aligned with the rest
                  of the head row. State shown via --active.-->
                  <button
                    type="button"
                    class="editor__sub-select editor__sub-select--mini"
                    :class="{ 'editor__sub-select--active': e.enabled }"
                    :title="e.enabled ? 'Disable light' : 'Enable light'"
                    @click="onLightEnabledChange(i, !e.enabled)"
                  >
                    <component :is="e.enabled ? Lightbulb : LightbulbOff" :size="12" />
                  </button>
                  <button
                    type="button"
                    class="editor__sub-select editor__sub-select--mini"
                    :class="{ 'editor__sub-select--active': e.castShadow }"
                    :title="e.castShadow ? 'Shadow casting ON' : 'Shadow casting OFF'"
                    @click="onLightShadowChange(i, !e.castShadow)"
                  >
                    <component :is="e.castShadow ? Sun : Circle" :size="12" />
                  </button>
                  <button type="button" class="editor__sub-select editor__sub-select--mini" :class="{ 'editor__sub-select--active': selectedLightId === `src:${e.id}` }" @click="selectGizmo(i, 'source')" title="Source">S</button>
                  <button v-if="e.type === 'directional'" type="button" class="editor__sub-select editor__sub-select--mini" :class="{ 'editor__sub-select--active': selectedLightId === `tgt:${e.id}` }" @click="selectGizmo(i, 'target')" title="Target">T</button>
                  <button type="button" class="editor__sub-remove" @click="removeLight(i)" :title="`Remove`">×</button>
                </div>
                <div class="editor__mat-body">
                  <!--Shared range (point only)-->
                  <div v-if="e.type === 'point'" class="editor__row">
                    <label class="editor__row-label" :title="`0 = infinite`">Range</label>
                    <div class="editor__row-control">
                      <input type="range" class="editor__slider" min="0" max="30" step="0.1" :value="e.range ?? 0" @input="(ev) => onLightRange(i, parseFloat((ev.target as HTMLInputElement).value))" />
                      <span class="editor__readout">{{ (e.range ?? 0).toFixed(1) }}</span>
                    </div>
                  </div>

                  <!--NORMAL-mode pair only. The Wireframe-mode pair lives
                  in the Wireframe tab's dedicated "Lights (wireframe
                  values)" section so the two views stay focused.-->
                  <div class="editor__row">
                    <label class="editor__row-label">Intensity</label>
                    <div class="editor__row-control">
                      <input type="range" class="editor__slider" min="0" max="10" step="0.05" :value="e.normalIntensity" @input="(ev) => onLightIntensity('normal', i, parseFloat((ev.target as HTMLInputElement).value))" />
                      <span class="editor__readout">{{ e.normalIntensity.toFixed(2) }}</span>
                    </div>
                  </div>
                  <div class="editor__row">
                    <label class="editor__row-label">Color</label>
                    <div class="editor__row-control">
                      <input type="color" class="editor__color" :value="e.normalColor" @input="(ev) => onLightColorChange('normal', i, (ev.target as HTMLInputElement).value)" />
                      <span class="editor__readout">{{ e.normalColor }}</span>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>

        <!--====================================================================
        WIREFRAME - wireframe-mode rig + shared material + emissive picks
        ====================================================================-->
        <div v-show="tab === 'wireframe'" class="editor__group">
          <!--Show wireframe lines toggle - bare, outside any card so it
          matches the "Show HDRI as skybox" toggle on the HDR tab.-->
          <div class="editor__row editor__row--inline">
            <input type="checkbox" class="editor__check" id="wf-overlay" :checked="wireframeOverlayOn" @change="(e) => onWireframeOverlayToggle((e.target as HTMLInputElement).checked)" />
            <label class="editor__row-label" for="wf-overlay">Show wireframe lines</label>
          </div>

          <!--HDR section-->
          <section class="editor__section" :class="{ 'editor__section--open': sectionOpen.wfHdr }">
            <button type="button" class="editor__section-head" @click="sectionOpen.wfHdr = !sectionOpen.wfHdr">
              <span class="editor__section-title">HDR</span>
              <ChevronDown :size="14" class="editor__section-chevron" />
            </button>
            <div v-show="sectionOpen.wfHdr" class="editor__section-body">
              <div class="editor__row">
                <label class="editor__row-label">Source</label>
                <div class="editor__row-control">
                  <select class="editor__select" :value="wfHdrId" @change="(e) => onWfHdrPick((e.target as HTMLSelectElement).value)">
                    <option value="">Procedural sky</option>
                    <option v-for="h in hdris" :key="h.id" :value="h.id">{{ h.name }}</option>
                  </select>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label">Intensity</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="3" step="0.05" :value="wfHdrIntensity" @input="(e) => onWfHdrIntensity(parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ wfHdrIntensity.toFixed(2) }}</span>
                </div>
              </div>
            </div>
          </section>

          <!--Material section-->
          <section class="editor__section editor__section--global" :class="{ 'editor__section--open': sectionOpen.wfMaterial }">
            <button type="button" class="editor__section-head" @click="sectionOpen.wfMaterial = !sectionOpen.wfMaterial">
              <span class="editor__section-title">Material</span>
              <ChevronDown :size="14" class="editor__section-chevron" />
            </button>
            <div v-show="sectionOpen.wfMaterial" class="editor__section-body">
              <p class="editor__warning">⚠ Material, lines color and mode color are shared across the wireframe mode of every project — changes apply everywhere.</p>
              <div class="editor__row">
                <label class="editor__row-label">Lines color</label>
                <div class="editor__row-control">
                  <input type="color" class="editor__color" :value="wireframeOverlayColor" @input="(e) => onWireframeOverlayColor((e.target as HTMLInputElement).value)" />
                  <span class="editor__readout">{{ wireframeOverlayColor }}</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label" :title="'Edges between faces whose normals differ by less than this angle are HIDDEN. Low = show every triangle edge, high = show only sharp corners.'">Edge threshold</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="60" step="0.5" :value="wireframeEdgeThreshold" @input="(e) => onWireframeEdgeThreshold(parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ wireframeEdgeThreshold.toFixed(1) }}°</span>
                </div>
              </div>

              <!--SWEEP - per-project axis + range for the wireframe wipe
              animation. axis is a free vec3 (normalized at runtime),
              offsets are in % of the bbox projected on that axis.-->
              <p class="editor__warning editor__warning--neutral">⤿ Sweep direction is PER PROJECT (not shared) - tune per model.</p>
              <div class="editor__row">
                <label class="editor__row-label" title="X component of the sweep direction in world space.">Sweep X</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="-1" max="1" step="0.05" :value="sweepAxis[0]" @input="(e) => onSweepAxis(0, parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ sweepAxis[0].toFixed(2) }}</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label" title="Y component (up).">Sweep Y</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="-1" max="1" step="0.05" :value="sweepAxis[1]" @input="(e) => onSweepAxis(1, parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ sweepAxis[1].toFixed(2) }}</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label" title="Z component (depth).">Sweep Z</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="-1" max="1" step="0.05" :value="sweepAxis[2]" @input="(e) => onSweepAxis(2, parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ sweepAxis[2].toFixed(2) }}</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label" title="Where the sweep begins, in % of the bbox along the axis. 0 = first vertex hit. Negative values give a delay before any tint appears.">Sweep start</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="-50" max="150" step="1" :value="sweepStart" @input="(e) => onSweepStart(parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ sweepStart.toFixed(0) }}%</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label" title="Where the sweep ends, in % of the bbox along the axis. 100 = last vertex hit. >100 leaves the wipe finishing slightly off-model.">Sweep end</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="-50" max="150" step="1" :value="sweepEnd" @input="(e) => onSweepEnd(parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ sweepEnd.toFixed(0) }}%</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label">Mode color</label>
                <div class="editor__row-control">
                  <input type="color" class="editor__color" :value="wireframeColor" @input="(e) => onWireframeColorChange((e.target as HTMLInputElement).value)" />
                  <span class="editor__readout">{{ wireframeColor }}</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label">Color</label>
                <div class="editor__row-control">
                  <input type="color" class="editor__color" :value="wfMatParams.color" @input="(e) => onWfMatParam('color', (e.target as HTMLInputElement).value)" />
                  <span class="editor__readout">{{ wfMatParams.color }}</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label">Metalness</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="1" step="0.01" :value="wfMatParams.metalness" @input="(e) => onWfMatParam('metalness', parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ wfMatParams.metalness.toFixed(2) }}</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label">Reflection</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="1" step="0.01" :value="1 - wfMatParams.roughness" @input="(e) => onWfMatParam('roughness', 1 - parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ (1 - wfMatParams.roughness).toFixed(2) }}</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label">Env intensity</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="3" step="0.05" :value="wfMatParams.envMapIntensity" @input="(e) => onWfMatParam('envMapIntensity', parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ wfMatParams.envMapIntensity.toFixed(2) }}</span>
                </div>
              </div>
              <div class="editor__row">
                <label class="editor__row-label">Specular</label>
                <div class="editor__row-control">
                  <input type="range" class="editor__slider" min="0" max="1" step="0.01" :value="wfMatParams.specularIntensity" @input="(e) => onWfMatParam('specularIntensity', parseFloat((e.target as HTMLInputElement).value))" />
                  <span class="editor__readout">{{ wfMatParams.specularIntensity.toFixed(2) }}</span>
                </div>
              </div>
            </div>
          </section>

          <!--Lights are SHARED with normal mode but exposed here too so
          the author can tune the wireframe pair (intensity + color) for
          each existing light without leaving the tab. ADD/REMOVE happen
          in the Lights tab only; here we offer read-only tweak controls.-->
          <section class="editor__section" :class="{ 'editor__section--open': sectionOpen.wfLights }">
            <button type="button" class="editor__section-head" @click="sectionOpen.wfLights = !sectionOpen.wfLights">
              <span class="editor__section-title">Lights (wireframe values)</span>
              <ChevronDown :size="14" class="editor__section-chevron" />
            </button>
            <div v-show="sectionOpen.wfLights" class="editor__section-body">
              <p v-if="!lights.length" class="editor__empty">No lights — add one in the Lights tab</p>
              <article
                v-for="(e, i) in lights"
                :key="e.id"
                class="editor__mat editor__light-row"
                :class="{ 'editor__mat--selected': selectedLightId?.endsWith(`:${e.id}`) }"
                @mouseenter="onLightHover(i, true)"
                @mouseleave="onLightHover(i, false)"
              >
                <div class="editor__mat-head editor__mat-head--static editor__light-head">
                  <span
                    class="editor__light-swatch-dot"
                    :style="{ backgroundColor: e.wfColor }"
                    aria-hidden="true"
                  ></span>
                  <span class="editor__mat-title editor__light-name">{{ e.type === 'point' ? 'Point' : 'Directional' }} {{ i + 1 }}</span>
                  <button type="button" class="editor__sub-select editor__sub-select--mini" :class="{ 'editor__sub-select--active': selectedLightId === `src:${e.id}` }" @click="selectGizmo(i, 'source')" title="Source">S</button>
                  <button v-if="e.type === 'directional'" type="button" class="editor__sub-select editor__sub-select--mini" :class="{ 'editor__sub-select--active': selectedLightId === `tgt:${e.id}` }" @click="selectGizmo(i, 'target')" title="Target">T</button>
                </div>
                <div class="editor__mat-body">
                  <div class="editor__row">
                    <label class="editor__row-label">Intensity</label>
                    <div class="editor__row-control">
                      <input type="range" class="editor__slider" min="0" max="10" step="0.05" :value="e.wfIntensity" @input="(ev) => onLightIntensity('wireframe', i, parseFloat((ev.target as HTMLInputElement).value))" />
                      <span class="editor__readout">{{ e.wfIntensity.toFixed(2) }}</span>
                    </div>
                  </div>
                  <div class="editor__row">
                    <label class="editor__row-label">Color</label>
                    <div class="editor__row-control">
                      <input type="color" class="editor__color" :value="e.wfColor" @input="(ev) => onLightColorChange('wireframe', i, (ev.target as HTMLInputElement).value)" />
                      <span class="editor__readout">{{ e.wfColor }}</span>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <!--Emissive objects section-->
          <section class="editor__section" :class="{ 'editor__section--open': sectionOpen.wfEmissive }">
            <button type="button" class="editor__section-head" @click="sectionOpen.wfEmissive = !sectionOpen.wfEmissive">
              <span class="editor__section-title">Emissive objects</span>
              <ChevronDown :size="14" class="editor__section-chevron" />
            </button>
            <div v-show="sectionOpen.wfEmissive" class="editor__section-body">
              <button
                type="button"
                class="editor__sub-add"
                :disabled="pickedMeshIdx === null"
                @click="addPickedToEmissive"
              >+ Add {{ pickedMeshName ? `(${pickedMeshName})` : "to emissive" }}</button>
              <p v-if="!emissiveEntries.length && !pickedMeshName" class="editor__empty">
                Click a mesh in the scene to pick (orange), then "Add".
              </p>
              <ul class="editor__mesh-list">
                <li v-for="item in emissiveEntries" :key="item.entry.uuid" class="editor__mesh-row editor__mesh-row--col">
                  <div class="editor__mesh-row-head">
                    <span class="editor__mesh-name">{{ item.name }}</span>
                    <button type="button" class="editor__sub-remove" :title="`Remove ${item.name}`" @click="removeFromEmissive(item.entry.uuid)">×</button>
                  </div>
                  <div class="editor__row-control">
                    <input type="range" class="editor__slider" min="0" max="10" step="0.1" :value="item.entry.intensity" @input="(e) => onEmissiveItemIntensity(item.entry.uuid, parseFloat((e.target as HTMLInputElement).value))" />
                    <span class="editor__readout">{{ item.entry.intensity.toFixed(1) }}</span>
                  </div>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>

      <footer class="editor__panel-footer">
        <button type="button" class="editor__save" :disabled="!dirty" @click="onSave">
          <Save :size="14" />
          <span>Save</span>
        </button>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.editor {
  position: fixed; inset: 0;
  background-color: hsl(var(--background));
  display: flex; flex-direction: row;
  z-index: 10;
}

/*Stage holds the 16/9 viewport-box centered in whatever space is left
after the side panel. place-items:center keeps the box visually anchored
when the window leaves slack on either axis.*/
.editor__stage {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  place-items: center;
}

/*16/9 viewport-box owns the canvas + every overlay (top-bar, hud,
viewport-tools). Sizing is done in JS via fitCanvasSize so the canvas
inherits exact integer pixel dims (no fractional rounding through CSS
aspect-ratio). All overlays are positioned ABSOLUTE against this box so
they hug the canvas edges instead of the larger stage edges - keeps the
controls visually inside the active viewport regardless of window size.*/
.editor__viewport-box {
  position: relative;
  /*Frame around the 3D canvas so its edges read as a distinct surface
  against the editor background, not a transparent hole.*/
  border: var(--border-width-sm) solid var(--color-gray-medium);
}
.editor__canvas { display: block; width: 100%; height: 100%; position: relative; z-index: 2; }

/*Film grain layer - same texture used by the main portfolio page,
covers the whole editor area (canvas + side panel). Z:1 sits between
the editor's solid bg and the canvas.*/
.editor__grain {
  position: absolute;
  inset: 0;
  background-image: url('/textures/grain.png');
  background-size: var(--grain-size);
  opacity: var(--grain-opacity);
  pointer-events: none;
  z-index: 1;
}

.editor__top-bar {
  position: absolute;
  top:    var(--spacing-md);
  left:   var(--spacing-md);
  right:  var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  pointer-events: none;
  z-index: 5;
}
.editor__top-bar > * { pointer-events: auto; }

.editor__back, .editor__upload-glb {
  display: inline-flex; align-items: center; gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-text-secondary);
  color: var(--color-text-hover);
  font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: var(--letter-spacing-wide);
  cursor: pointer; backdrop-filter: blur(var(--filter-blur));
  transition: border-color 0.15s ease, color 0.15s ease;
}
.editor__back:hover, .editor__upload-glb:hover:not(:disabled) {
  border-color: var(--color-accent); color: var(--color-accent);
}
.editor__upload-glb:disabled { opacity: 0.4; cursor: not-allowed; }
.editor__upload-glb--replace { border-color: var(--color-gray-medium); color: var(--color-text-tertiary); }

.editor__top-title {
  flex: 1 1 auto; min-width: 0;
  text-align: center;
  color: var(--color-text-hover);
  font-size: var(--font-size-sm); font-weight: var(--font-weight-bold);
  text-transform: uppercase; letter-spacing: var(--letter-spacing-wide);
  background-color: hsl(0 0% 0% / 0.6);
  padding: var(--spacing-xs) var(--spacing-md);
  backdrop-filter: blur(var(--filter-blur));
}

.editor__top-err {
  position: absolute; top: 4rem; left: 50%; transform: translateX(-50%);
  background-color: hsl(var(--destructive) / 0.9);
  color: var(--color-text-hover);
  font-size: var(--font-size-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  z-index: 5;
}

/*Vertical stack of viewport-corner tools sitting above the bottom-right
ViewHelper viewport (helper draws at 128x128). Square icon buttons so
they pair visually with the ViewHelper cube.*/
.editor__viewport-tools {
  position: absolute;
  right: var(--spacing-md);
  bottom: calc(128px + var(--spacing-md));
  display: flex; flex-direction: column; gap: var(--spacing-xxs);
  z-index: 5;
}
/*2x2 grid of single-purpose toggles (light gizmos, projection mode,
center crosshair, wireframe preview). Compact instead of stretching the
toolbar in a single row; same gap as between the two pose columns so
the toolbar still reads as one rhythm.*/
.editor__viewport-cluster-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows:    1fr 1fr;
  gap: var(--spacing-sm);
}

/*SCREEN CENTER crosshair - two thin lines crossing in the middle of the
viewport, painted with the existing accent colour at low alpha so they
read as a soft guide rather than active content. position:absolute on
the viewport-box means they always cross at the canvas centre.*/
.editor__viewport-crosshair {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
}
.editor__viewport-crosshair::before,
.editor__viewport-crosshair::after {
  content: "";
  position: absolute;
  background-color: hsl(0 0% 100% / 0.35);
}
.editor__viewport-crosshair::before {
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-0.5px);
}
.editor__viewport-crosshair::after {
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  transform: translateY(-0.5px);
}

/*START POSE grid - two columns (desktop / phone) side by side. Each
column has a greyed device icon at the top acting as a label, then the
save + go buttons stacked below it. Gap between the two columns is what
separates the desktop column from the phone one.*/
.editor__viewport-poses {
  display: flex;
  flex-direction: row;
  gap: var(--spacing-sm);
}
.editor__viewport-pose-col {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xxs);
}
.editor__viewport-pose-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  2rem;
  height: 2rem;
  color: var(--color-text-tertiary);
  pointer-events: none;
}
.editor__viewport-tool {
  width: 2rem; height: 2rem;
  display: inline-flex; align-items: center; justify-content: center;
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-text-secondary);
  color: var(--color-text-hover);
  cursor: pointer;
  backdrop-filter: blur(var(--filter-blur));
  transition: color 0.15s ease, border-color 0.15s ease;
}
.editor__viewport-tool:hover:not(:disabled) { color: var(--color-accent); border-color: var(--color-accent); }
.editor__viewport-tool:disabled { opacity: 0.4; cursor: not-allowed; }
.editor__viewport-tool--off { color: var(--color-text-tertiary); }

/*Custom tooltip - reads from data-tooltip and floats to the LEFT of the
button (the toolbar is anchored on the right of the canvas, so left is
the only direction that always has room). Native title is unreliable
on dark overlays; this is consistent across browsers.*/
.editor__viewport-tool[data-tooltip] { position: relative; }
.editor__viewport-tool[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  right: calc(100% + var(--spacing-xs));
  top: 50%;
  transform: translateY(-50%);
  padding: var(--spacing-xxs) var(--spacing-sm);
  background-color: hsl(0 0% 0% / 0.9);
  color: var(--color-text-hover);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  white-space: nowrap;
  pointer-events: none;
  z-index: 100;
  border: var(--border-width-sm) solid var(--color-gray-medium);
}

.editor__hud {
  position: absolute; bottom: var(--spacing-md); left: 50%;
  transform: translateX(-50%);
  padding: var(--spacing-xs) var(--spacing-md);
  background-color: hsl(0 0% 0% / 0.6);
  color: var(--color-text-hover);
  font-size: var(--font-size-xs);
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  letter-spacing: var(--letter-spacing-wide);
  backdrop-filter: blur(var(--filter-blur));
  pointer-events: none;
}

.editor__panel {
  flex: 0 0 28rem;
  display: flex; flex-direction: column;
  background-color: hsl(0 0% 0%);
  border-left: 1px solid hsl(0 0% 20%);
  min-height: 0;
}

.editor__panel-header { padding: var(--spacing-md) var(--spacing-lg); border-bottom: var(--border-width-sm) solid var(--color-gray-medium); }
.editor__panel-title { font-size: var(--font-size-sm); font-weight: var(--font-weight-bold); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide); color: var(--color-text-hover); }

.editor__tabs { display: flex; border-bottom: var(--border-width-sm) solid var(--color-gray-medium); }
.editor__tab {
  flex: 1 1 auto; padding: var(--spacing-sm);
  background-color: transparent; border: none;
  border-bottom: var(--border-width-md) solid transparent;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide);
  cursor: pointer; transition: color 0.15s ease, border-color 0.15s ease;
  margin-bottom: calc(-1 * var(--border-width-sm));
}
.editor__tab:hover { color: var(--color-text-hover); }
.editor__tab--active { color: var(--color-accent); border-bottom-color: var(--color-accent); }

.editor__panel-body { flex: 1 1 auto; overflow-y: auto; padding: var(--spacing-md) var(--spacing-lg); }
.editor__group { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.editor__group-title { font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide); color: var(--color-text-tertiary); padding-bottom: var(--spacing-xxs); }

/*CARD - common look for every collapsible item in the panel (materials,
lights, accordion sections). Background fill does the delimiting work;
border is hairline-thin so adjacent cards don't look caged. Vertical
spacing between cards is tight (--spacing-xxs) so the panel feels dense.*/
.editor__mat {
  display: flex;
  flex-direction: column;
  background-color: hsl(0 0% 100% / 0.04);
  border: var(--border-width-sm) solid hsl(0 0% 100% / 0.06);
  margin-bottom: 1px;       /*just enough for the next card's border to read as a seam*/
  padding: 0 var(--spacing-sm);
  transition: background-color 0.15s ease;
}
.editor__mat:hover { background-color: hsl(0 0% 100% / 0.07); }
.editor__mat:last-child { margin-bottom: 0; }
.editor__mat-head { display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-xs) 0; background: transparent; border: none; color: inherit; cursor: pointer; text-align: left; width: 100%; }
.editor__mat-head--static { cursor: default; padding-top: var(--spacing-xs); }
.editor__mat-head--static:hover .editor__mat-chevron { color: var(--color-text-tertiary); }

.editor__mat-swatch { width: var(--spacing-lg); height: var(--spacing-lg); flex-shrink: 0; border: var(--border-width-sm) solid var(--color-gray-medium); }
.editor__mat-swatch--thumb { object-fit: cover; }
.editor__mat-title { flex: 1 1 auto; font-size: var(--font-size-sm); font-weight: var(--font-weight-bold); color: var(--color-text-hover); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor__mat-chevron { color: var(--color-text-tertiary); transition: transform 0.15s ease, color 0.15s ease; }
.editor__mat-head:hover .editor__mat-chevron { color: var(--color-text-hover); }
.editor__mat--open .editor__mat-chevron { transform: rotate(180deg); }
.editor__mat-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xxs);
  padding: var(--spacing-xs) 0;
  border-top: var(--border-width-sm) solid hsl(0 0% 100% / 0.06);
}
.editor__mat--selected {
  background-color: hsl(var(--primary) / 0.12);
  border-color: hsl(var(--primary) / 0.35);
}

.editor__sub { display: flex; flex-direction: column; gap: var(--spacing-xs); padding-top: var(--spacing-sm); border-top: var(--border-width-sm) solid hsl(0 0% 100% / 0.06); }

/*ACCORDION sections - SAME card treatment but a notch darker so when a
section contains item-cards inside, the two layers are visually distinct.*/
.editor__section {
  display: flex;
  flex-direction: column;
  background-color: hsl(0 0% 100% / 0.025);
  border: var(--border-width-sm) solid hsl(0 0% 100% / 0.06);
  margin-bottom: 1px;
  padding: 0 var(--spacing-sm);
}
.editor__section:last-child { margin-bottom: 0; }
.editor__section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); padding: var(--spacing-xs) 0; background: transparent; border: none; color: inherit; cursor: pointer; text-align: left; width: 100%; }
.editor__section-title { font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide); color: var(--color-text-hover); }
.editor__section-chevron { color: var(--color-text-tertiary); transition: transform 0.15s ease, color 0.15s ease; }
.editor__section-head:hover .editor__section-chevron { color: var(--color-text-hover); }
.editor__section--open .editor__section-chevron { transform: rotate(180deg); }
.editor__section-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) 0;
  border-top: var(--border-width-sm) solid hsl(0 0% 100% / 0.06);
}

/*GLOBAL-WARNING variant - applied to the Wireframe-tab Material section
to flag that edits ripple to every project. Red tint on the bg + border
so the author can't miss it.*/
.editor__section--global {
  background-color: hsl(0 70% 50% / 0.08);
  border-color: hsl(0 70% 50% / 0.35);
}
.editor__section--global .editor__section-title { color: hsl(0 80% 70%); }
.editor__section--global .editor__section-body { border-top-color: hsl(0 70% 50% / 0.25); }
.editor__sub-head { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); }
.editor__sub-add-group { display: inline-flex; gap: var(--spacing-xxs); }
.editor__sub-add { padding: var(--spacing-xxs) var(--spacing-sm); background-color: transparent; border: var(--border-width-sm) solid var(--color-gray-medium); color: var(--color-text-secondary); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide); cursor: pointer; transition: color 0.15s ease, border-color 0.15s ease; }
.editor__sub-add:hover:not(:disabled) { color: var(--color-accent); border-color: var(--color-accent); }
.editor__sub-add:disabled { opacity: 0.35; cursor: not-allowed; }

.editor__sub-remove { display: inline-flex; align-items: center; justify-content: center; width: var(--spacing-md); height: var(--spacing-md); background-color: transparent; border: none; color: var(--color-text-tertiary); font-size: var(--font-size-md); line-height: 1; cursor: pointer; }
.editor__sub-remove:hover { color: hsl(var(--destructive)); }

.editor__sub-select { padding: var(--spacing-xxs) var(--spacing-sm); background-color: transparent; border: var(--border-width-sm) solid var(--color-gray-medium); color: var(--color-text-tertiary); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide); cursor: pointer; transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease; }
.editor__sub-select:hover { color: var(--color-accent); border-color: var(--color-accent); }
.editor__sub-select--active { color: hsl(0 0% 0%); background-color: var(--color-accent); border-color: var(--color-accent); }
/*Mini S / T variant for the compact light-row header - square, single-char.
letter-spacing must be reset to 0 here: the base .editor__sub-select uses
--letter-spacing-wide which adds trailing space after every glyph and
visually shoves a single character off-center inside a square button.*/
.editor__sub-select--mini {
  padding: 0;
  width: 1.4rem;
  height: 1.4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0;
}

/*Compact light-row: color swatch + name + S / T + remove all on one line*/
.editor__light-head { display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs) 0; }
.editor__light-swatch { width: 1.2rem; height: 1.2rem; }
.editor__light-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/*Color dot indicates the ACTIVE mode's color on the shared light row.
Reads from wfColor when wireframe mode is on, normalColor otherwise.*/
.editor__light-swatch-dot {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  flex-shrink: 0;
}

/*Per-mode block on a shared light - groups intensity + color so the
author can see at a glance which set of values they're editing.*/
.editor__light-mode {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-left: var(--border-width-md) solid var(--color-gray-medium);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xxs);
  margin-top: var(--spacing-xs);
}
.editor__light-mode--wf { border-left-color: var(--color-accent); }
.editor__light-mode-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
}

/*Default row layout is now HORIZONTAL: label - slider/picker - readout
all on one line. Saves vertical space and matches the panel's density.
The inline variant is for checkbox + label pairs that don't need the
6.5rem label column.*/
.editor__row { display: flex; flex-direction: row; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-xxs) 0; }
.editor__row--inline .editor__row-label { flex: 0 0 auto; }
.editor__row--inline { flex-direction: row; align-items: center; gap: var(--spacing-sm); }
/*Fixed label column so sliders + readouts align vertically across rows
in the same body (no jagged left edge from variable-length labels).*/
.editor__row-label { flex: 0 0 6.5rem; font-size: var(--font-size-xs); color: var(--color-text); letter-spacing: var(--letter-spacing-tight); cursor: pointer; }
.editor__row-control { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: var(--spacing-sm); }

/*Color swatch - explicit border so it reads as a clickable picker, not
a flat fill. The native swatch is borderless inside (browsers vary), so
we draw our own around the input element.*/
.editor__color {
  width:  var(--spacing-lg);
  height: var(--spacing-lg);
  padding: 0;
  background: transparent;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.15s ease;
}
.editor__color:hover { border-color: var(--color-text-hover); }
.editor__color::-webkit-color-swatch-wrapper { padding: 0; }
.editor__color::-webkit-color-swatch { border: none; }
.editor__color::-moz-color-swatch { border: none; }

.editor__select { flex: 1 1 auto; padding: var(--spacing-xxs) var(--spacing-sm); background-color: hsl(var(--background) / 0.6); border: var(--border-width-sm) solid var(--color-gray-medium); color: var(--color-text-hover); font-size: var(--font-size-xs); cursor: pointer; }

.editor__slider { flex: 1 1 auto; min-width: 0; height: 2px; background: var(--color-gray-medium); appearance: none; -webkit-appearance: none; cursor: pointer; outline: none; }
.editor__slider:disabled { opacity: 0.4; cursor: not-allowed; }
.editor__slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; background: var(--color-accent); cursor: pointer; border: none; }
.editor__slider::-moz-range-thumb { width: 12px; height: 12px; background: var(--color-accent); cursor: pointer; border: none; }

.editor__readout { font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace; font-size: var(--font-size-xs); color: var(--color-text-secondary); min-width: 3rem; text-align: right; flex-shrink: 0; }
.editor__check { width: var(--spacing-md); height: var(--spacing-md); cursor: pointer; accent-color: var(--color-accent); }
.editor__empty { font-size: var(--font-size-sm); color: var(--color-text-tertiary); font-style: italic; text-align: center; padding: var(--spacing-lg) 0; }
.editor__error { font-size: var(--font-size-xs); color: hsl(var(--destructive)); padding: var(--spacing-xs) 0; }
.editor__warning { font-size: var(--font-size-xs); color: #ffae42; padding: var(--spacing-xs) 0; line-height: 1.4; }

.editor__drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--spacing-xs); padding: var(--spacing-xl) var(--spacing-md); background-color: hsl(var(--background) / 0.4); border: var(--border-width-sm) dashed var(--color-gray-medium); color: var(--color-text-secondary); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide); text-align: center; cursor: pointer; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease; }
.editor__drop:hover { border-color: var(--color-accent); color: var(--color-text-hover); }
.editor__drop--over { border-color: var(--color-accent); color: var(--color-accent); background-color: hsl(var(--primary) / 0.08); }
.editor__drop--busy { opacity: 0.5; pointer-events: none; }

/*HDR list - each row uses the same card visual + the same spacing as
material / light cards (1px margin-bottom seam + parent gap from the
group, matching the .editor__group gap used by materials / lights).*/
.editor__hdr-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: var(--spacing-xs); margin: 0; }
.editor__hdr-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: hsl(0 0% 100% / 0.04);
  border: var(--border-width-sm) solid hsl(0 0% 100% / 0.06);
  margin-bottom: 1px;       /*matches .editor__mat + .editor__section seam*/
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  transition: background-color 0.15s ease;
}
.editor__hdr-item:hover { background-color: hsl(0 0% 100% / 0.07); }
.editor__hdr-item:last-child { margin-bottom: 0; }
.editor__hdr-thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /*Match .editor__mat-swatch size so HDR rows and material rows align.*/
  width:  var(--spacing-lg);
  height: var(--spacing-lg);
  background-color: hsl(0 0% 0% / 0.4);
  border: var(--border-width-sm) solid var(--color-gray-medium);
  flex-shrink: 0;
  overflow: hidden;
}
.editor__hdr-thumb img { width: 100%; height: 100%; object-fit: cover; }
.editor__hdr-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace; }

.editor__mesh-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: var(--spacing-xxs); max-height: 16rem; overflow-y: auto; }
.editor__mesh-row { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); padding: var(--spacing-xxs) var(--spacing-sm); background-color: hsl(var(--primary) / 0.08); border: var(--border-width-sm) solid var(--color-gray-medium); }
.editor__mesh-row--col { flex-direction: column; align-items: stretch; gap: var(--spacing-xxs); padding: var(--spacing-xs) var(--spacing-sm); }
.editor__mesh-row-head { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); }
.editor__mesh-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-xs); color: var(--color-text-hover); }

.editor__panel-footer { padding: var(--spacing-md) var(--spacing-lg); border-top: var(--border-width-sm) solid var(--color-gray-medium); display: flex; justify-content: flex-end; }
.editor__save { display: inline-flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs) var(--spacing-lg); background-color: transparent; border: var(--border-width-sm) solid var(--color-accent); color: var(--color-accent); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide); cursor: pointer; transition: color 0.15s ease, background-color 0.15s ease; }
.editor__save:hover:not(:disabled) { background-color: var(--color-accent); color: hsl(0 0% 0%); }
.editor__save:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
