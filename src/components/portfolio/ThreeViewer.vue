<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue"
import {
  Box3,
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  HalfFloatType,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  PMREMGenerator,
  RGBAFormat,
  Scene,
  ShadowMaterial,
  Sphere,
  Spherical,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineMaterial }  from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { GLTFLoader }    from "three/examples/jsm/loaders/GLTFLoader.js"
import { HDRLoader }     from "three/examples/jsm/loaders/HDRLoader.js"
import { EXRLoader }     from "three/examples/jsm/loaders/EXRLoader.js"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass }     from "three/examples/jsm/postprocessing/RenderPass.js"
import { OutputPass }     from "three/examples/jsm/postprocessing/OutputPass.js"
import { SMAAPass }       from "three/examples/jsm/postprocessing/SMAAPass.js"
import {
  buildWireframeWithoutDiagonals,
  CustomEmissiveMaterial,
  CustomNormalMaterial,
  pushSweepUniforms,
  type WfSweepPatch,
} from "../../composables/wfMaterials"
import { VIEWER_DEFAULTS } from "../../lib/viewer-defaults"

//VIEW-ONLY THREE.JS VIEWER - replaces the Sketchfab iframe on a main
//project when a .glb has been uploaded for it. Reads the viewerSettings
//jsonb saved by ModelEditPage and applies materials / lights / HDR.
//Wireframe toggle swaps to wireframe mode (using the saved wireframe
//settings) like Sketchfab's button used to do.

//SHARED LIGHT - new shape: position + range common to both modes, per-mode
//intensity + color. Editor saves this as `settings.lights[]`.
interface SharedLight {
  id:       string
  type:     "point" | "directional"
  x: number; y: number; z: number
  tx?: number; ty?: number; tz?: number
  range?:   number   //point-light only, three.js "distance" (0 = infinite)
  normalIntensity: number
  normalColor:     string
  wfIntensity:     number
  wfColor:         string
  enabled?:    boolean
  //If false, the light fades to 0 intensity as the sweep enters
  //wireframe mode (and fades back on leave). Default true.
  wfEnabled?:  boolean
}

//LEGACY shapes - kept on read for back-compat with saves from before the
//unification refactor. Migrated to SharedLight at load time.
interface LegacyNormalLight {
  id:       string
  type:     "point" | "directional"
  intensity: number
  color:    string
  range?:   number
  x: number; y: number; z: number
  tx?: number; ty?: number; tz?: number
}
interface LegacyWfLight {
  id:       string
  type:     "point" | "directional"
  intensity: number
  color?:    string
  range?:    number
  x: number; y: number; z: number
  tx?: number; ty?: number; tz?: number
}

interface EmissiveSpec {
  name?: string
  uuid?: string
  intensity: number
}

interface MaterialState {
  uuid?: string
  name?: string
  color: string
  emissive: string
  emissiveEnabled: boolean
  emissiveIntensity: number
  metalness: number
  roughness: number
  envMapIntensity: number
  specularIntensity: number
}

interface StartView {
  pos:    [number, number, number]
  target: [number, number, number]
}

export interface ViewerSettings {
  startView?: StartView | null
  materials?: MaterialState[]
  //NEW shape - one shared light list with per-mode intensity + color.
  lights?: SharedLight[]
  normalMode?: {
    hdrId?:        string
    hdrUrl?:       string | null
    hdrIntensity?: number
    //LEGACY - back-compat only; new saves write the top-level `lights`.
    lights?:       LegacyNormalLight[]
  }
  wireframeMode?: {
    hdrId?:           string
    hdrUrl?:          string | null
    hdrIntensity?:    number
    color?:           string
    overlayOn?:       boolean
    overlayColor?:    string
    //Line thickness in pixels for the wireframe overlay. Global pref
    //(shared across projects via the settings table).
    overlayLineWidth?: number
    //Per-project sweep axis (free vec3, normalized at runtime) + start
    ///end offsets (% of bbox projected on that axis) for the wireframe
    //wipe animation. Default = X axis 0%..100% reproduces the auto-bbox
    //behaviour when the project predates these fields.
    sweepAxis?:  [number, number, number]
    sweepStart?: number
    sweepEnd?:   number
    //Per-project sweep enter/leave animation duration (ms). Default 1500.
    sweepDurationMs?: number
    material?: {
      color:             string
      metalness:         number
      roughness:         number
      envMapIntensity:   number
      specularIntensity: number
    }
    emissiveMeshes?: EmissiveSpec[]
    lights?:         LegacyWfLight[]
  }
}

const props = withDefaults(defineProps<{
  glbUrl:         string
  settings:       ViewerSettings | null
  //wireframe is driven from outside (MainProject's wireframe button is
  //the single source of truth - it flips images AND the 3D mode together)
  wireframe?:     boolean
  //In-view gates the intro fly-in: we want the visitor to LAND on the
  //viewer (scroll it into view) before the animation plays, not on
  //page-load while the section is still off-screen. Defaults to true so
  //standalone embeds without an IntersectionObserver still animate.
  isInView?:      boolean
}>(), { wireframe: false, isInView: true })

//===========================================================================
//VIEWER CONSTANTS - centralised so the magic numbers stay in one place.
//===========================================================================
//Intro fly-in spherical offsets relative to the rest pose. radius x 2.5
//pulls the camera far back; azimuth +PI/4 adds an eighth-turn arc; polar
//-0.2 gives a subtle "above" hint. Duration is the full lerp time in ms.
const FLY_IN_RADIUS_MULTIPLIER     = 2.5
const FLY_IN_AZIMUTH_OFFSET_RAD    = Math.PI / 4
const FLY_IN_POLAR_OFFSET_RAD      = 0.2
const FLY_IN_MIN_POLAR_RAD         = 0.05
const FLY_IN_DURATION_MS           = 2800
//OrbitControls range - wide enough that a saved start view at any sane
//radius doesn't get clamped when controls re-sync at the end of the fly-in.
const ORBIT_MIN_DISTANCE           = 0.05
const ORBIT_MAX_DISTANCE           = 200
//Wireframe overlay - matches the editor's values so editor + production
//render identically (polygonOffset pushes surface back, lines land just
//in front without z-fighting).
const WIREFRAME_LINE_OPACITY       = 0.9
const WIREFRAME_OVERLAY_RENDER_ORDER = 998
//Shadow + ground
const SHADOW_MAP_SIZE              = 1024
const SHADOW_BIAS                  = -0.0002
const SHADOW_NORMAL_BIAS           = 0.02
const GROUND_SIZE                  = 40
const GROUND_OPACITY               = 0.35
//Renderer + camera defaults
const CAMERA_FOV                   = 35
const CAMERA_NEAR                  = 0.01
const CAMERA_FAR                   = 1000
const MAX_PIXEL_RATIO              = 1.5
const RENDER_KEEPALIVE_MS_DEFAULT  = 300

const canvas = ref<HTMLCanvasElement | null>(null)
const isWireframe = ref(false)
const isReady         = ref(false)
//Brutalist loading bar - 0..1 progress reported by GLTFLoader's
//onProgress; flipped invisible once the model is in the scene.
const loadingProgress = ref(0)
const isLoading       = ref(true)

let scene:    Scene | null = null
let camera:   PerspectiveCamera | null = null
let renderer: WebGLRenderer | null = null
let composer: EffectComposer | null = null
let controls: OrbitControls | null = null
let pmrem:    PMREMGenerator | null = null
let rafId:    number | null = null
let renderUntil = 0
function requestRender(ms = RENDER_KEEPALIVE_MS_DEFAULT) { renderUntil = performance.now() + ms }

//Set in onBeforeUnmount. Async callbacks (GLTF / HDR loads) check it and
//dispose their freshly-loaded resources instead of touching a dead scene.
let isDisposed = false

//Dispose every geometry, material and material-owned texture under a
//scene-graph root. Used on unmount for the whole scene AND for a GLB
//whose load callback fires after the viewer is already gone.
function disposeObjectTree(root: { traverse: (cb: (obj: unknown) => void) => void }) {
  root.traverse((obj) => {
    const m = obj as Mesh
    if (!m.isMesh) return
    m.geometry?.dispose()
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      if (!mat) continue
      //material.dispose() releases the program but not its textures -
      //scan the texture slots (map, normalMap, roughnessMap, ...) too.
      for (const value of Object.values(mat)) {
        if (value && typeof value === "object" && (value as Texture).isTexture) {
          (value as Texture).dispose()
        }
      }
      mat.dispose()
    }
  })
}

//Intro fly-in: Sketchfab-style orbital approach. We lerp in SPHERICAL
//coordinates around the orbit target (radius + azimuth + polar angle),
//so the camera arcs into place AND rotates instead of sliding straight.
//Start state is the rest pose with theta offset by +110 deg (sweeps in
//from the side) and radius scaled up. OrbitControls is disabled during
//the anim so a scroll during the entrance can't fight the lerp.
type FlyAnim = {
  fromSph:    Spherical   //radius + phi (polar) + theta (azimuth) at start
  toSph:      Spherical   //rest pose spherical
  target:     Vector3     //orbit target (fixed during anim)
  startTime:  number
  duration:   number
}
let flyAnim: FlyAnim | null = null

//Intro is QUEUED until the viewer scrolls into view. Without this gate,
//the animation would play while the section is still off-screen and the
//visitor would land on the rest pose with no entrance. Cleared after
//the intro plays so a re-scroll doesn't replay it.
let pendingIntro: Omit<FlyAnim, "startTime"> | null = null
let introPlayed = false

//Mesh inventory + per-mesh state needed for wireframe toggle
const sceneMeshes: { mesh: Mesh; name: string }[] = []
const wfOverlays = new Map<string, LineSegments>()

//Shared lights - one entry per spec, intensity + color are swapped per
//mode by applyLightsForMode() instead of having two parallel arrays.
type LiveLight = {
  spec:    SharedLight
  light:   PointLight | DirectionalLight
  target?: import("three").Object3D
}
const liveLights: LiveLight[] = []

//===========================================================================
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

function applyEnvFromSource(source: Texture, intensity: number) {
  if (!scene || !pmrem) return
  source.mapping = EquirectangularReflectionMapping
  const probe = pmrem.fromEquirectangular(source).texture
  probe.mapping = EquirectangularReflectionMapping
  //the equirect source is fully baked into the PMREM probe at this point;
  //keeping it around would leak one full-size DataTexture per env swap.
  source.dispose()
  const old = scene.environment as { dispose?: () => void } | null
  scene.environment = probe
  scene.environmentIntensity = intensity
  if (old && typeof old.dispose === "function") old.dispose()
  requestRender()
}

//HDR CACHE - the previous applyHdrFromUrl reloaded + reparsed + re-PMREM
//generated the same HDR every wireframe toggle, which is the actual
//cause of the perceptible lag (EXR parsing of a 5-6MB file is the
//culprit, not the material swap). We now cache the last URL + its
//rendered PMREM probe; same URL = just retint the existing probe with
//the new intensity (constant-time), no reload, no parse, no PMREM.
let currentHdrUrl:     string | null = null
let currentHdrProbe:   Texture | null = null
//ORDERING TOKEN - rapid wireframe toggles between two different HDR urls
//fire two async loads whose callbacks can resolve out of order (last
//LOADED would win instead of last REQUESTED). Every applyHdrFromUrl call
//bumps the sequence; a callback whose token is stale bails out.
let hdrRequestSeq = 0

//Apply env from a direct URL saved on the viewerSettings (file extension
//in the URL drives the loader choice). Falls back to procedural sky when
//the URL is missing OR the file fails to load.
function applyHdrFromUrl(url: string | null | undefined, intensity: number) {
  const token = ++hdrRequestSeq
  if (!url) {
    currentHdrUrl   = null
    currentHdrProbe = null
    applyEnvFromSource(makeSkyGradient(), intensity)
    return
  }
  //Same URL as last time - skip the load/parse/PMREM round-trip and
  //just rebind the cached probe at the new intensity. This is the hot
  //path on every wireframe toggle for projects whose normal-mode HDR
  //and wireframe-mode HDR are the same file.
  if (url === currentHdrUrl && currentHdrProbe && scene) {
    //dispose the outgoing env (e.g. a sky-gradient probe) unless it IS
    //the cached probe we're rebinding.
    const old = scene.environment
    scene.environment = currentHdrProbe
    scene.environmentIntensity = intensity
    if (old && old !== currentHdrProbe) old.dispose()
    requestRender()
    return
  }
  const isExr = /\.exr$/i.test(url)
  const loader = isExr ? new EXRLoader() : new HDRLoader()
  loader.load(
    url,
    (source) => {
      //stale response (a newer request started) or viewer unmounted -
      //free the decoded texture instead of applying it out of order.
      if (isDisposed || token !== hdrRequestSeq) {
        source.dispose()
        return
      }
      applyEnvFromSource(source, intensity)
      //pull the probe back out of the scene so we can rebind it on the
      //next toggle without re-running PMREM.
      currentHdrUrl   = url
      currentHdrProbe = scene?.environment ?? null
    },
    undefined,
    (err) => {
      console.error(`[ThreeViewer] HDR load failed for ${url}:`, err)
      if (isDisposed || token !== hdrRequestSeq) return
      currentHdrUrl   = null
      currentHdrProbe = null
      applyEnvFromSource(makeSkyGradient(), intensity)
    },
  )
}

//===========================================================================
//Spawn ONE three.js light per SharedLight spec. Initial intensity+color
//come from the active mode (normal at mount time, swapped by
//applyLightsForMode() when wireframe is toggled).
function spawnSharedLight(spec: SharedLight): LiveLight {
  const initialMode: "normal" | "wireframe" = props.wireframe ? "wireframe" : "normal"
  const colorHex   = initialMode === "wireframe" ? spec.wfColor : spec.normalColor
  const intensity  = initialMode === "wireframe" ? spec.wfIntensity : spec.normalIntensity
  const col = new Color(colorHex)
  let light: PointLight | DirectionalLight
  if (spec.type === "point") {
    const range = spec.range ?? 0
    //decay=2 matches three.js default (and the editor's)
    light = new PointLight(col, intensity, range, 2)
    light.position.set(spec.x, spec.y, spec.z)
    return { spec, light }
  }
  light = new DirectionalLight(col, intensity)
  light.castShadow = true
  light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
  light.shadow.bias       = SHADOW_BIAS
  light.shadow.normalBias = SHADOW_NORMAL_BIAS
  light.position.set(spec.x, spec.y, spec.z)
  const target = light.target
  target.position.set(spec.tx ?? 0, spec.ty ?? 0, spec.tz ?? 0)
  target.updateMatrixWorld()
  return { spec, light, target }
}

//applyLightsForMode (hard-snap) is gone - applyLightsLerp drives the
//mode swap via the same eased curve as the surface sweep.

//Lerp every shared light between its normal-mode spec and its
//wireframe-mode spec. t=0 fully normal, t=1 fully wireframe. Driven
//from advanceWfTransition so the lighting swap rides the same eased
//curve as the surface tint - no hard snap, smooth colour blend.
const _lerpColA = new Color()
const _lerpColB = new Color()
function applyLightsLerp(t: number) {
  for (const item of liveLights) {
    //Effective intensities honour enabled (overall) + wfEnabled (mode-
    //specific). Off-in-wireframe lights fade to 0 as t→1, then fade
    //back as t→0 on leave.
    const enabled   = item.spec.enabled   !== false
    const wfEnabled = item.spec.wfEnabled !== false
    const wfI = (enabled && wfEnabled) ? item.spec.wfIntensity : 0
    const nI  = enabled ? item.spec.normalIntensity : 0
    item.light.intensity = nI + (wfI - nI) * t
    _lerpColA.set(item.spec.normalColor)
    _lerpColB.set(item.spec.wfColor)
    _lerpColA.lerp(_lerpColB, t)
    item.light.color.copy(_lerpColA)
  }
}

//Ramp every overlay line's opacity in lockstep with the sweep so the
//edge wireframe reveals progressively instead of popping in at the end.
function setOverlayOpacityAll(t: number) {
  for (const overlay of wfOverlays.values()) {
    const m = overlay.material as LineMaterial
    m.opacity = WIREFRAME_LINE_OPACITY * t
  }
}

//Migrate legacy per-mode arrays (saves from before the unification) into
//the new SharedLight shape. Matches by id; missing ids get index-based
//keys so unrelated lights don't collapse together.
function migrateLegacyLights(
  normalSpecs: LegacyNormalLight[] | undefined,
  wfSpecs:     LegacyWfLight[]     | undefined,
  wfModeColor: string,
): SharedLight[] {
  const byKey = new Map<string, { normal?: LegacyNormalLight; wf?: LegacyWfLight }>()
  ;(normalSpecs ?? []).forEach((n, i) => byKey.set(n.id ?? `_n${i}`, { normal: n }))
  ;(wfSpecs ?? []).forEach((w, i) => {
    const key = w.id ?? `_w${i}`
    const merged = byKey.get(key) ?? {}
    merged.wf = w
    byKey.set(key, merged)
  })
  const out: SharedLight[] = []
  for (const { normal, wf } of byKey.values()) {
    const seed = normal ?? wf
    if (!seed) continue
    out.push({
      id:    seed.id,
      type:  seed.type,
      x:     seed.x, y: seed.y, z: seed.z,
      tx:    seed.tx, ty: seed.ty, tz: seed.tz,
      range: seed.range,
      normalIntensity: normal?.intensity ?? wf?.intensity ?? 1,
      normalColor:     normal?.color ?? VIEWER_DEFAULTS.normalColor,
      wfIntensity:     wf?.intensity ?? normal?.intensity ?? 1,
      wfColor:         wf?.color ?? wfModeColor,
    })
  }
  return out
}

//Resize every directional light's shadow frustum so it covers the scene
//bounding sphere. Called once after the .glb loads.
function tuneShadowCameras(sphereRadius: number) {
  const size = Math.max(sphereRadius * 3, 1)
  for (const item of liveLights) {
    const dl = item.light as DirectionalLight
    if (!(dl as { isDirectionalLight?: boolean }).isDirectionalLight) continue
    dl.shadow.camera.left   = -size
    dl.shadow.camera.right  =  size
    dl.shadow.camera.top    =  size
    dl.shadow.camera.bottom = -size
    dl.shadow.camera.near   = 0.1
    dl.shadow.camera.far    = size * 5
    dl.shadow.camera.updateProjectionMatrix()
  }
}

//===========================================================================
function applyMaterialOverrides(materials: MaterialState[]) {
  //match by NAME first (uuids regenerate per glb load so they don't
  //survive a save+reload), fallback to uuid for backward compatibility.
  //Applied material instances are shared across meshes when they share
  //a glTF material, so one apply propagates everywhere.
  const byName = new Map<string, MaterialState>()
  const byUuid = new Map<string, MaterialState>()
  for (const m of materials) {
    if (m.name) byName.set(m.name, m)
    if (m.uuid) byUuid.set(m.uuid, m)
  }
  const applied = new Set<string>()
  for (const sm of sceneMeshes) {
    const mat = sm.mesh.material as MeshPhysicalMaterial
    if (!mat) continue
    if (applied.has(mat.uuid)) continue   //already mutated this shared mat
    const spec = (mat.name && byName.get(mat.name)) || byUuid.get(mat.uuid)
    if (!spec) continue
    if (spec.color)    mat.color.set(spec.color)
    if (spec.emissive) mat.emissive.set(spec.emissive)
    mat.metalness         = spec.metalness
    mat.roughness         = spec.roughness
    mat.envMapIntensity   = spec.envMapIntensity
    mat.specularIntensity = spec.specularIntensity
    if (spec.emissiveEnabled) {
      mat.emissiveIntensity = spec.emissiveIntensity
    } else {
      mat.emissive.setHex(0x000000)
      mat.emissiveIntensity = 0
    }
    mat.needsUpdate = true
    applied.add(mat.uuid)
  }
}

//===========================================================================
//WIREFRAME SWEEP - shader-driven directional reveal that progressively
//paints the wireframe tint across the model along the world X axis.
//
//Each original material gets a shared onBeforeCompile patch that adds a
//uWfProgress (0..1) uniform + a vWfWorldPos varying. The fragment shader
//mixes the lit color toward uWfTint where worldPos.x along the model's
//bounding box has already been "passed" by the wipe front. Stepping
//uWfProgress in the tick loop drives the animation.
//
//Driving the SAME uWfProgress across every patched shader keeps the
//sweep visually unified - one straight line crossing the whole model.
//Bbox stays raw - the per-corner projection on the sweep axis happens
//in recordBoxFromSceneGraph; result lands in wfMin / wfRange below.
let   wfBox: Box3 | null = null
let   wfMin   = 0
let   wfRange = 1
let   wfAxis  = new Vector3(1, 0, 0)
//Per-instance material registry. Each ThreeViewer has its own Set of
//custom materials so applySweep updates THIS viewer only - no
//cross-contamination between multiple viewers on the same page (the
//MainProject card list mounts one ThreeViewer per project).
const wfMaterials = new Set<CustomNormalMaterial | CustomEmissiveMaterial>()
function applySweep(patch: WfSweepPatch): void {
  pushSweepUniforms(wfMaterials, patch)
}
//Meshes flagged as emissive picks at GLB load - used by the loader to
//track which got a CustomEmissiveMaterial assigned, in case downstream
//code wants to iterate them.
const emissivePickMeshes = new Set<Mesh>()

const WF_SWEEP_DURATION_DEFAULT_MS = 1500
function sweepDurationMs(): number {
  return props.settings?.wireframeMode?.sweepDurationMs ?? WF_SWEEP_DURATION_DEFAULT_MS
}
const WF_OVERLAY_FADE_DURATION_MS  = 600

let wfTransition: {
  startTime: number
  from:      number
  to:        number
  duration:  number
  phase:     "enter" | "leave"
} | null = null

//Separate state for the wireframe-overlay opacity fade. Runs SEQUENTIALLY
//with wfTransition (sweep finishes → overlay fades in; overlay fades out
//→ sweep starts) so sweep and wireframe lines never animate together -
//the user wanted them to be visually decoupled, one then the other.
let wfOverlayFade: {
  startTime: number
  from:      number
  to:        number
  duration:  number
  thenStartLeaveSweep: boolean
} | null = null

//Materials live as Custom{Normal,Emissive}Material instances - the
//class itself carries the sweep shader injection AND binds the shared
//uniform objects. No per-material patching needed here anymore; the
//module-level applySweep() updates every live instance at once.
function pushSweepPbrUniforms(): void {
  const wf = props.settings?.wireframeMode?.material
  if (!wf) return
  applySweep({
    tintColor:         wf.color,
    metalness:         wf.metalness,
    roughness:         wf.roughness,
    envIntensity:      wf.envMapIntensity,
    specularIntensity: wf.specularIntensity,
    emissiveColor:     props.settings?.wireframeMode?.color ?? VIEWER_DEFAULTS.wireframeModeColor,
  })
}

function recordBoxFromSceneGraph(root: { traverse: (cb: (obj: any) => void) => void }) {
  const box = new Box3()
  let any = false
  root.traverse((obj: any) => {
    const m = obj as Mesh
    if (m.isMesh && m.geometry) {
      box.expandByObject(m)
      any = true
    }
  })
  if (any) {
    wfBox = box
    recomputeSweepRange()
  }
}

//Project bbox corners on the sweep axis to get the model's world-space
//extent along the axis, then use the user's ABSOLUTE sweepStart /
//sweepEnd values as the wipe range. The viewer auto-snaps to bbox
//extremes when the saved values look legacy (the old percentage 0..100
//scheme, or values clearly outside the model after a re-author).
function recomputeSweepRange() {
  if (!wfBox) return
  const axisInput = props.settings?.wireframeMode?.sweepAxis ?? [1, 0, 0]

  //Normalize the axis - degenerate (all zero) falls back to world X.
  const ax = new Vector3(axisInput[0], axisInput[1], axisInput[2])
  if (ax.lengthSq() < 0.0001) ax.set(1, 0, 0)
  ax.normalize()
  wfAxis = ax

  //Project every corner of the bbox on the axis and take the min/max
  //so the wipe covers the WHOLE model along the chosen direction.
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
  let pmin =  Infinity
  let pmax = -Infinity
  for (const c of corners) {
    const p = c.dot(ax)
    if (p < pmin) pmin = p
    if (p > pmax) pmax = p
  }
  const spanProj = Math.max(0.0001, pmax - pmin)
  let savedStart: number = props.settings?.wireframeMode?.sweepStart ?? pmin
  let savedEnd:   number = props.settings?.wireframeMode?.sweepEnd   ?? pmax
  //LEGACY MIGRATION - the old scheme stored percentages (0..100). After
  //the switch to absolute coords, those values map nowhere near a
  //typical model bbox. Detect (0, 100) AND values far outside the
  //projected range and snap to bbox extremes so the sweep covers the
  //model out of the box.
  const looksLegacy =
    (savedStart === 0 && savedEnd === 100)
    || savedStart > pmax + spanProj
    || savedEnd   < pmin - spanProj
  if (looksLegacy) {
    savedStart = pmin
    savedEnd   = pmax
  }
  wfMin   = savedStart
  wfRange = Math.max(0.0001, savedEnd - savedStart)

  //Push the freshly-recomputed values into the shared uniform set so
  //every Custom{Normal,Emissive}Material instance reads them at the
  //next draw - no per-material iteration needed.
  applySweep({ axis: wfAxis, min: wfMin, range: wfRange })
}

//Pre-built wireframe-edge geometries per mesh, keyed by uuid. Built via
//buildWireframeWithoutDiagonals (topological diagonal detection from the
//index buffer, no angle threshold). Avoids the per-mesh computation cost
//on the first wireframe toggle.
const precomputedEdges = new Map<string, BufferGeometry>()

function buildPrecomputedEdges() {
  for (const g of precomputedEdges.values()) g.dispose()
  precomputedEdges.clear()
  for (const sm of sceneMeshes) {
    precomputedEdges.set(sm.mesh.uuid, buildWireframeWithoutDiagonals(sm.mesh.geometry as BufferGeometry))
  }
}

//Pre-build the wireframe edge geometries at load time. Materials no
//longer need a precompile pass (we never swap them - the original is
//also the wireframe material via the sweep shader, and it's already
//rendered on the first paint so its program is in the cache).
function precompileWireframeAssets() {
  buildPrecomputedEdges()
}

//ensureWfBaseMat / wfBaseMat: dead - removed alongside the material swap
//path. Custom{Normal,Emissive}Material classes own the look entirely.

//Skip overlay creation for meshes that ended up in the emissive picks
//(they render clean, no wireframe lines). Same behavior as the editor.
function syncWireframeOverlays(on: boolean, color: string, emissiveUuidSet: Set<string>) {
  if (!scene) return
  if (on) {
    const lineWidth = props.settings?.wireframeMode?.overlayLineWidth ?? 1
    const viewport  = renderer ? renderer.getSize(new Vector2()) : new Vector2(1, 1)
    for (const sm of sceneMeshes) {
      if (wfOverlays.has(sm.mesh.uuid)) continue
      if (emissiveUuidSet.has(sm.mesh.uuid)) continue
      //Reuse the precomputed wireframe-without-diagonals BufferGeometry
      //from the warmup pass. Falls back to a fresh build only if the
      //cache is empty.
      const baseGeo = precomputedEdges.get(sm.mesh.uuid)
        ?? buildWireframeWithoutDiagonals(sm.mesh.geometry as BufferGeometry)
      //Wrap into LineSegmentsGeometry so LineMaterial can render with
      //proper pixel-width screen-space quads (WebGL's gl.LINES is 1px
      //on most drivers regardless of linewidth).
      const positions = baseGeo.getAttribute("position").array as Float32Array
      const lineGeom = new LineSegmentsGeometry()
      lineGeom.setPositions(positions as unknown as number[])
      const overlayMat = new LineMaterial({
        color:       new Color(color).getHex(),
        linewidth:   lineWidth,
        transparent: true,
        opacity:     WIREFRAME_LINE_OPACITY,
        depthWrite:  false,
        worldUnits:  false,
      })
      overlayMat.resolution.copy(viewport)
      //LineSegments2 (not Line2) - the geometry holds independent segment
      //pairs, and its constructor is typed for LineSegmentsGeometry
      const overlay = new LineSegments2(lineGeom, overlayMat)
      overlay.renderOrder = WIREFRAME_OVERLAY_RENDER_ORDER
      sm.mesh.add(overlay)
      wfOverlays.set(sm.mesh.uuid, overlay as unknown as LineSegments)
    }
  } else {
    for (const [, overlay] of wfOverlays.entries()) {
      if (overlay.parent) overlay.parent.remove(overlay)
      ;(overlay.material as LineMaterial).dispose?.()
      overlay.geometry.dispose()
    }
    wfOverlays.clear()
  }
}

//Driven by props.wireframe (parent button). Watcher below kicks the
//mode-switch when the prop flips - either at mount-time after the glb
//finishes loading, or live when the user toggles in MainProject.
function applyWireframeMode(on: boolean) {
  if (!scene) return
  if (on === isWireframe.value) return
  isWireframe.value = on
  if (on) enterWireframe()
  else    leaveWireframe()
  requestRender(800)
}

//SINGLE EFFECT - the sweep shader on the originals. No light swap, no
//HDR swap, no edge overlay. The wireframe toggle ONLY animates the
//uWfProgress uniform between 0 and 1, blending each surface toward the
//wireframe tint with the wireframe PBR params (metalness / roughness /
//env). Anything beyond that was making the surface render unpredictably
//(invisible shader, double-darkening from swapped lights, etc.) - the
//user asked to keep just the tint transition with working material
//params and leave HDR + lights + edge lines alone.
function finalizeEnterWireframe() {
  //Snap the wireframe HDR at the END of the sweep so the env swap is
  //masked by the now-uniform tint. applyHdrFromUrl is URL-cached: same
  //file as the normal-mode HDR = no reload, no parse, no PMREM. Spawn
  //the edge overlays at opacity 0 and start a fade-in - the wireframe
  //LINES appear progressively AFTER the surface tint sweep, not at the
  //same time.
  const wf = props.settings?.wireframeMode
  applyHdrFromUrl(wf?.hdrUrl, wf?.hdrIntensity ?? 1)
  //Emissive picks render as full opaque emission - they get NO wireframe
  //lines on top. Build the skip-set from the meshes we flagged at GLB
  //load so syncWireframeOverlays leaves them clean.
  const emissiveUuids = new Set<string>()
  for (const m of emissivePickMeshes) emissiveUuids.add(m.uuid)
  syncWireframeOverlays(
    wf?.overlayOn ?? VIEWER_DEFAULTS.wireframeOverlayOn,
    wf?.overlayColor ?? VIEWER_DEFAULTS.wireframeLineColor,
    emissiveUuids,
  )
  setOverlayOpacityAll(0)
  wfOverlayFade = {
    startTime: performance.now(),
    from:      0,
    to:        1,
    duration:  WF_OVERLAY_FADE_DURATION_MS,
    thenStartLeaveSweep: false,
  }
}

function enterWireframe() {
  if (!scene) return
  //Refresh the sweep uniforms - tint follows the user's wireframe color,
  //axis + range are recomputed against the user's saved sweep settings,
  //and the PBR overrides land before the animation starts so the final
  //state honors the metalness / roughness / env sliders. Both
  //CustomNormalMaterial AND CustomEmissiveMaterial instances pick up
  //these values via the shared uniform set - no per-material iteration.
  recomputeSweepRange()
  pushSweepPbrUniforms()
  //Cancel any in-flight overlay fade so rapid toggles don't fight.
  wfOverlayFade = null

  wfTransition = {
    startTime: performance.now(),
    from:      0,
    to:        1,
    duration:  sweepDurationMs(),
    phase:     "enter",
  }
}

function leaveWireframe() {
  if (!scene) return
  //Switch back to the normal-mode HDR. Same URL-cache short-circuit as
  //finalizeEnterWireframe - identical URL = no reload.
  const n = props.settings?.normalMode
  applyHdrFromUrl(n?.hdrUrl, n?.hdrIntensity ?? 1)

  //If overlay lines are currently on screen (either fully or partway
  //through a fade-in), fade them OUT first. The leave sweep kicks off
  //once the fade-out completes. Otherwise (no overlays yet - leave
  //pressed during the enter sweep before overlays even spawned), go
  //straight to the leave sweep.
  if (wfOverlays.size > 0) {
    wfOverlayFade = {
      startTime: performance.now(),
      //Pick up from wherever the in-flight fade is so a leave during
      //mid-fade-in doesn't pop overlays back to full opacity.
      from:      wfOverlayFade ? lerpedOverlayValue() : 1,
      to:        0,
      duration:  WF_OVERLAY_FADE_DURATION_MS,
      thenStartLeaveSweep: true,
    }
  } else {
    wfOverlayFade = null
    wfTransition = {
      startTime: performance.now(),
      from:      1,
      to:        0,
      duration:  sweepDurationMs(),
      phase:     "leave",
    }
  }
}

//Read the currently-applied overlay opacity straight off the first
//overlay material. Used to start a leave fade-out from wherever the
//in-flight fade-in is, instead of snapping back to full opacity.
function lerpedOverlayValue(): number {
  for (const overlay of wfOverlays.values()) {
    const m = overlay.material as LineMaterial
    return m.opacity / WIREFRAME_LINE_OPACITY
  }
  return 0
}

function advanceOverlayFade() {
  if (!wfOverlayFade) return
  const now = performance.now()
  const t   = Math.min(1, (now - wfOverlayFade.startTime) / wfOverlayFade.duration)
  const eased = t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
  const v = wfOverlayFade.from + (wfOverlayFade.to - wfOverlayFade.from) * eased
  setOverlayOpacityAll(v)
  if (t >= 1) {
    const wasFadeOut = wfOverlayFade.to === 0
    const startSweep = wfOverlayFade.thenStartLeaveSweep
    wfOverlayFade = null
    if (wasFadeOut) syncWireframeOverlays(false, "", new Set())
    if (startSweep) {
      wfTransition = {
        startTime: performance.now(),
        from:      1,
        to:        0,
        duration:  sweepDurationMs(),
        phase:     "leave",
      }
    }
  }
  requestRender()
}

function advanceWfTransition() {
  if (!wfTransition) return
  const now = performance.now()
  const t   = Math.min(1, (now - wfTransition.startTime) / wfTransition.duration)
  //easeInOutCubic - uniform-feeling march across the model. easeOutCubic
  //was over 14% by the first frame after start, which felt like the
  //sweep already began mid-way.
  const eased = t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
  const v = wfTransition.from + (wfTransition.to - wfTransition.from) * eased
  applySweep({ progress: v })
  //v is the unified "wireframe-mode amount" in [0..1] regardless of
  //direction: 0=normal look, 1=wireframe look. Lights ride the same
  //eased curve as the surface tint. Overlay lines are NOT touched here -
  //they live in a binary state outside the sweep (created in
  //finalizeEnterWireframe at full opacity, removed in leaveWireframe).
  applyLightsLerp(v)
  if (t >= 1) {
    if (wfTransition.phase === "enter") finalizeEnterWireframe()
    wfTransition = null
  }
  requestRender()
}

//===========================================================================
onMounted(() => {
  if (!canvas.value) return
  const c = canvas.value
  const { clientWidth: w, clientHeight: h } = c.parentElement!

  scene = new Scene()
  scene.background = null

  camera = new PerspectiveCamera(CAMERA_FOV, w / h, CAMERA_NEAR, CAMERA_FAR)
  camera.position.set(2, 1.5, 3)

  renderer = new WebGLRenderer({ canvas: c, antialias: false, alpha: true, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  renderer.setSize(w, h, false)
  renderer.toneMapping            = NeutralToneMapping
  renderer.toneMappingExposure    = 1
  renderer.shadowMap.enabled      = true
  renderer.shadowMap.type         = PCFSoftShadowMap
  renderer.setClearColor(new Color(0x000000), 0)

  pmrem = new PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  //HDR is loaded LATER, after the GLB lands in the scene (see the GLB
  //callback). Loading it here can race the GLB load: materials may
  //compile their shader programs BEFORE scene.environment exists, baking
  //USE_ENVMAP as undefined into the program cache. Subsequent
  //"scene.environment = probe" then doesn't recompile our onBeforeCompile
  //patches reliably, so the env stays invisible until something else
  //forces a fresh compile - which is what was happening: the env only
  //appeared after the first wireframe toggle (which calls applyHdrFromUrl
  //again at a moment when the materials are already settled).

  const ground = new Mesh(new PlaneGeometry(GROUND_SIZE, GROUND_SIZE), new ShadowMaterial({ opacity: GROUND_OPACITY }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  controls = new OrbitControls(camera, c)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  //Wide range so a saved start view at any radius isn't clamped when
  //OrbitControls re-syncs at the end of the intro fly-in (see consts).
  controls.minDistance = ORBIT_MIN_DISTANCE
  controls.maxDistance = ORBIT_MAX_DISTANCE
  controls.addEventListener("change", () => requestRender(500))

  const renderTarget = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 })
  composer = new EffectComposer(renderer, renderTarget)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new SMAAPass())
  composer.addPass(new OutputPass())

  //LOAD .glb
  const loader = new GLTFLoader()
  loader.load(
    props.glbUrl,
    (gltf) => {
      //viewer unmounted while the glb was in flight - free everything we
      //just parsed instead of leaking it into a torn-down scene.
      if (isDisposed) {
        disposeObjectTree(gltf.scene)
        return
      }
      isLoading.value = false
      loadingProgress.value = 1
      //EMISSIVE PICKS - meshes the author flagged as "glow in wireframe
      //mode" via emissiveMeshes[]. We pre-build the lookup so we can pick
      //the right class (Custom{Normal,Emissive}Material) per mesh below.
      const emissiveSpecs = props.settings?.wireframeMode?.emissiveMeshes ?? []
      const emByUuid = new Map<string, EmissiveSpec>()
      const emByName = new Map<string, EmissiveSpec>()
      for (const e of emissiveSpecs) {
        if (e.uuid) emByUuid.set(e.uuid, e)
        if (e.name) emByName.set(e.name, e)
      }

      sceneMeshes.length = 0
      emissivePickMeshes.clear()
      let meshIndex = 0
      gltf.scene.traverse((obj) => {
        const m = obj as Mesh
        if (!m.isMesh) return
        m.castShadow = true; m.receiveShadow = true
        const name = m.name || `Mesh ${meshIndex}`
        sceneMeshes.push({ mesh: m, name })

        //Each mesh gets its OWN instance of either CustomNormalMaterial
        //or CustomEmissiveMaterial, built from the GLB source's PBR
        //params (texture, color, metalness, roughness, normal map, env,
        //etc.). At progress=0 both classes render IDENTICALLY to what
        //three.js would render with the original material; they only
        //diverge at progress=1 (gray wireframe vs flat opaque emission).
        const src = m.material as MeshStandardMaterial | MeshPhysicalMaterial
        const emSpec = emByUuid.get(m.uuid) ?? emByName.get(name)
        let custom: CustomNormalMaterial | CustomEmissiveMaterial
        if (emSpec) {
          custom = new CustomEmissiveMaterial(src, emSpec.intensity)
          emissivePickMeshes.add(m)
        } else {
          custom = new CustomNormalMaterial(src)
        }
        m.material = custom
        wfMaterials.add(custom)
        meshIndex++
      })

      //Push the wireframe mode params into the shared uniforms so each
      //material is ready to render the sweep correctly the moment it
      //compiles. They'll be re-pushed in enterWireframe too.
      pushSweepPbrUniforms()

      //apply saved material overrides
      if (props.settings?.materials) applyMaterialOverrides(props.settings.materials)

      //WIREFRAME WARMUP - precompile wfBaseMat's program and pre-build
      //EdgesGeometry per mesh now, while the model is settling, instead
      //of paying the stall on the first wireframe toggle.
      precompileWireframeAssets()

      //SPAWN LIGHTS - prefer the new shared shape, fall back to legacy
      //per-mode arrays for back-compat with pre-unification saves.
      const sharedSpecs: SharedLight[] = props.settings?.lights && props.settings.lights.length > 0
        ? props.settings.lights
        : migrateLegacyLights(
            props.settings?.normalMode?.lights,
            props.settings?.wireframeMode?.lights,
            props.settings?.wireframeMode?.color ?? VIEWER_DEFAULTS.wireframeModeColor,
          )
      for (const spec of sharedSpecs) {
        const entry = spawnSharedLight(spec)
        scene!.add(entry.light)
        if (entry.target) scene!.add(entry.target)
        liveLights.push(entry)
      }

      scene!.add(gltf.scene)

      //Center the model FIRST, THEN record the bbox so the sweep range
      //is in the SAME world coords the shader sees via worldPos. The
      //previous order captured the bbox in pre-centering coords, then
      //moved the model out from under the saved sweep cut.
      gltf.scene.updateMatrixWorld(true)
      const tempBox = new Box3().setFromObject(gltf.scene)
      const center  = tempBox.getCenter(new Vector3())
      const sphere  = tempBox.getBoundingSphere(new Sphere())

      gltf.scene.position.x -= center.x
      gltf.scene.position.z -= center.z
      gltf.scene.position.y -= tempBox.min.y
      gltf.scene.updateMatrixWorld(true)

      recordBoxFromSceneGraph(gltf.scene)

      //near/far follow the bounding sphere regardless of pose so a
      //hand-authored start view that's far from the model still resolves
      camera!.near = sphere.radius / 100
      camera!.far  = sphere.radius * 100

      //RESOLVE THE REST POSE - author's saved start view wins; otherwise
      //fall back to the standard bounding-sphere framing.
      const restPos    = new Vector3()
      const restTarget = new Vector3()
      const sv = props.settings?.startView
      if (sv) {
        restPos.set(sv.pos[0], sv.pos[1], sv.pos[2])
        restTarget.set(sv.target[0], sv.target[1], sv.target[2])
      } else {
        const fov = camera!.fov * (Math.PI / 180)
        const distance = sphere.radius / Math.sin(fov / 2) * 1.3
        restPos.set(distance * 0.6, distance * 0.55 + sphere.radius, distance * 0.8)
        restTarget.set(0, sphere.radius * 0.8, 0)
      }

      //ORBITAL FLY-IN - Sketchfab-style: camera starts FAR back (2.5x
      //radius) with a small azimuth offset so the entrance is mostly a
      //slow zoom-in with a touch of rotation, not a wide swing. Polar
      //tilt is gentle - we approach almost level with the rest pose.
      const restSph = new Spherical().setFromVector3(
        restPos.clone().sub(restTarget),
      )
      const fromSph = new Spherical(
        restSph.radius * FLY_IN_RADIUS_MULTIPLIER,
        Math.max(FLY_IN_MIN_POLAR_RAD, restSph.phi - FLY_IN_POLAR_OFFSET_RAD),
        restSph.theta + FLY_IN_AZIMUTH_OFFSET_RAD,
      )

      //Park camera at the fly-start so the first paint shows the offset
      //pose rather than the rest. OrbitControls is disabled until the
      //intro actually fires so a scroll-during-park can't reposition it.
      const startOffset = new Vector3().setFromSpherical(fromSph)
      camera!.position.copy(restTarget).add(startOffset)
      camera!.updateProjectionMatrix()
      controls!.target.copy(restTarget)
      controls!.enabled = false
      controls!.update()

      //Queue the intro - we don't start the lerp until the viewer is
      //actually visible (props.isInView). Once started, introPlayed
      //gates re-triggers so scrolling away + back doesn't replay it.
      pendingIntro = {
        fromSph,
        toSph:   restSph,
        target:  restTarget.clone(),
        duration: FLY_IN_DURATION_MS,
      }
      if (props.isInView && !introPlayed) startIntro()

      tuneShadowCameras(sphere.radius)

      //Load the env map AFTER the GLB materials are in scene. This is
      //the timing fix for the "HDR only appears after first wireframe
      //toggle" issue: when applyHdrFromUrl runs here, the materials are
      //already compiled, three.js detects the env change cleanly, and
      //our onBeforeCompile patches recompile with USE_ENVMAP defined.
      const initMode = props.wireframe ? "wireframe" : "normal"
      const initHdrUrl = initMode === "wireframe"
        ? props.settings?.wireframeMode?.hdrUrl
        : props.settings?.normalMode?.hdrUrl
      const initHdrInt = initMode === "wireframe"
        ? (props.settings?.wireframeMode?.hdrIntensity ?? 1)
        : (props.settings?.normalMode?.hdrIntensity ?? 1)
      applyHdrFromUrl(initHdrUrl, initHdrInt)

      isReady.value = true
      //if the parent already had wireframe ON at mount-time, apply it
      //now that the glb materials / lights are populated
      if (props.wireframe) applyWireframeMode(true)
      requestRender(2000)
    },
    (evt: { total: number; loaded: number }) => {
      if (evt.total > 0) loadingProgress.value = evt.loaded / evt.total
    },
    (err: unknown) => { console.error("[ThreeViewer] glb load failed:", err); isLoading.value = false },
  )

  const tick = () => {
    const now = performance.now()
    if (flyAnim && camera && controls) {
      const t = Math.min(1, (now - flyAnim.startTime) / flyAnim.duration)
      //easeOutCubic - quick deceleration into the rest pose so the
      //entrance feels confident, not floaty.
      const ease = 1 - Math.pow(1 - t, 3)
      //Lerp the three spherical components independently around the
      //fixed target. This produces an arc (rotation) instead of a
      //straight line, matching Sketchfab's intro.
      const sph = new Spherical(
        flyAnim.fromSph.radius + (flyAnim.toSph.radius - flyAnim.fromSph.radius) * ease,
        flyAnim.fromSph.phi    + (flyAnim.toSph.phi    - flyAnim.fromSph.phi)    * ease,
        flyAnim.fromSph.theta  + (flyAnim.toSph.theta  - flyAnim.fromSph.theta)  * ease,
      )
      const offset = new Vector3().setFromSpherical(sph)
      camera.position.copy(flyAnim.target).add(offset)
      camera.lookAt(flyAnim.target)
      if (t >= 1) {
        flyAnim = null
        controls.enabled = true
        controls.update()
      }
      requestRender()
    } else if (now < renderUntil) {
      controls!.update()
    }
    //Wireframe-sweep tint advance + the separate overlay-fade advance
    //(the overlay fades in AFTER the sweep enter completes, and fades
    //out BEFORE the sweep leave starts; they never run concurrently).
    if (wfTransition)  advanceWfTransition()
    if (wfOverlayFade) advanceOverlayFade()
    if (now < renderUntil) composer!.render()
    rafId = requestAnimationFrame(tick)
  }
  tick()
})

//RESIZE - the renderer's drawing buffer was sized once at mount and
//never updated, so any window resize stretched the same buffer over the
//new CSS dimensions and the model rendered squashed. Observing the
//canvas parent and resyncing renderer + composer + camera aspect keeps
//the picture crisp at every viewport width.
let resizeObserver: ResizeObserver | null = null
function syncCanvasSize() {
  if (!canvas.value || !renderer || !composer || !camera) return
  const parent = canvas.value.parentElement
  if (!parent) return
  const w = parent.clientWidth
  const h = parent.clientHeight
  if (w === 0 || h === 0) return
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
  composer.setSize(w, h)
  //LineMaterial computes pixel linewidth from viewport NDC, update each
  //overlay's resolution uniform so the thickness stays correct.
  const size = new Vector2(w, h)
  for (const overlay of wfOverlays.values()) {
    const m = overlay.material as LineMaterial
    m.resolution.copy(size)
  }
  requestRender(500)
}

onMounted(() => {
  if (!canvas.value) return
  const parent = canvas.value.parentElement
  if (!parent) return
  resizeObserver = new ResizeObserver(syncCanvasSize)
  resizeObserver.observe(parent)
})

onBeforeUnmount(() => {
  //flag first so in-flight GLTF / HDR callbacks dispose their payload
  //and bail instead of resurrecting a torn-down scene.
  isDisposed = true
  if (rafId !== null) cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
  resizeObserver = null

  //WIREFRAME OVERLAYS - LineSegments2 geometry + LineMaterial per mesh.
  for (const overlay of wfOverlays.values()) {
    ;(overlay.material as LineMaterial).dispose?.()
    overlay.geometry.dispose()
  }
  wfOverlays.clear()

  //SCENE GRAPH - every mesh geometry + material + material texture under
  //the scene root: the loaded GLB, the ground plane, everything.
  if (scene) disposeObjectTree(scene)

  //MATERIAL REGISTRY - Custom{Normal,Emissive}Material instances. Already
  //covered by the scene traversal when attached (dispose is idempotent),
  //this also frees any instance that got detached along the way.
  for (const mat of wfMaterials) mat.dispose()
  wfMaterials.clear()

  //PRECOMPUTED WIREFRAME EDGES - one BufferGeometry per mesh.
  for (const g of precomputedEdges.values()) g.dispose()
  precomputedEdges.clear()

  //ENVIRONMENT - the active probe (if it isn't the cached one), the
  //cached PMREM probe, and the PMREM generator's internal targets.
  if (scene?.environment && scene.environment !== currentHdrProbe) scene.environment.dispose()
  if (scene) scene.environment = null
  currentHdrProbe?.dispose()
  currentHdrProbe = null
  currentHdrUrl   = null
  pmrem?.dispose()
  pmrem = null

  controls?.dispose()
  composer?.dispose()
  renderer?.dispose()

  //Drop object references so nothing keeps the GPU-side handles alive.
  sceneMeshes.length = 0
  liveLights.length = 0
  emissivePickMeshes.clear()
  scene    = null
  camera   = null
  controls = null
  composer = null
  renderer = null
})

//Re-apply when settings change (e.g. coming back from edit page)
//Live-react to the parent's wireframe toggle once the scene is ready.
watch(() => props.wireframe, (on) => {
  if (!isReady.value) return
  applyWireframeMode(on)
})

//Promote the queued intro to an active flyAnim. Called either right
//after glb load (if the viewer is already visible) or by the in-view
//watcher (if it became visible while the model loaded).
function startIntro() {
  if (!pendingIntro || introPlayed) return
  const intro = pendingIntro
  flyAnim = { ...intro, startTime: performance.now() }
  pendingIntro = null
  introPlayed = true
  requestRender(intro.duration + 200)
}

//Fire the intro the moment the section scrolls into view (the parent
//drives props.isInView from an IntersectionObserver).
watch(() => props.isInView, (vis) => {
  if (vis) startIntro()
})

watch(() => props.settings, (s) => {
  if (!isReady.value || !s) return
  if (s.materials) applyMaterialOverrides(s.materials)
  //don't re-spawn lights here, would require teardown - keep it simple
  //but DO push fresh sweep axis / start / end + PBR params into the
  //shared uniforms so live edits propagate to every custom material.
  recomputeSweepRange()
  pushSweepPbrUniforms()
  requestRender(500)
}, { deep: true })
</script>

<template>
  <div class="three-viewer">
    <canvas ref="canvas" class="three-viewer__canvas"></canvas>
    <!--BRUTALIST loading bar - thin strip at the top of the viewer that
    fills with onProgress percent. No animation, no glow, no rounding;
    disappears the instant the glb is in the scene.-->
    <div v-if="isLoading" class="three-viewer__loading">
      <div class="three-viewer__loading-fill" :style="{ width: (loadingProgress * 100) + '%' }"></div>
    </div>
  </div>
</template>

<style scoped>
.three-viewer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.three-viewer__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/*BRUTALIST loading bar - thicker than the original 2px so it actually
reads against a busy background. Track uses the shared --tag-bg surface
so it stays visible at 0% progress and follows the theme; fill is the
accent so the loading state ties to the rest of the site's interactive
palette. min-width keeps a small visible bar even before the first
progress event fires.*/
.three-viewer__loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--spacing-xxs);
  background-color: var(--tag-bg);
  pointer-events: none;
  z-index: 10;
}
.three-viewer__loading-fill {
  height: 100%;
  min-width: 2%;
  background-color: var(--color-accent);
  transition: width 0.15s linear;
}
</style>
