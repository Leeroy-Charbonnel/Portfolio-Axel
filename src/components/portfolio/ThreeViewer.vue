<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue"
import {
  Box3,
  type Material,
  Color,
  DataTexture,
  DirectionalLight,
  EdgesGeometry,
  EquirectangularReflectionMapping,
  HalfFloatType,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  OrthographicCamera,
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
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFLoader }    from "three/examples/jsm/loaders/GLTFLoader.js"
import { HDRLoader }     from "three/examples/jsm/loaders/HDRLoader.js"
import { EXRLoader }     from "three/examples/jsm/loaders/EXRLoader.js"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass }     from "three/examples/jsm/postprocessing/RenderPass.js"
import { OutputPass }     from "three/examples/jsm/postprocessing/OutputPass.js"
import { SMAAPass }       from "three/examples/jsm/postprocessing/SMAAPass.js"

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

interface ViewerSettings {
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
    //EdgesGeometry threshold (deg). Faces whose normals differ by LESS
    //than this are merged so coplanar triangulation diagonals don't
    //pollute the wireframe. Global editor pref - applies everywhere.
    edgeThresholdDeg?: number
    //Per-project sweep axis (free vec3, normalized at runtime) + start
    ///end offsets (% of bbox projected on that axis) for the wireframe
    //wipe animation. Default = X axis 0%..100% reproduces the auto-bbox
    //behaviour when the project predates these fields.
    sweepAxis?:  [number, number, number]
    sweepStart?: number
    sweepEnd?:   number
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
//in front without z-fighting; edge threshold filters triangulation diagonals).
const POLYGON_OFFSET_FACTOR        = 1
const POLYGON_OFFSET_UNITS         = 1
const WIREFRAME_EDGE_THRESHOLD_DEG = 1
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
const meshOriginalMaterials = new Map<string, MeshPhysicalMaterial>()
const wfOverlays = new Map<string, LineSegments>()
const wfEmissiveMaterials = new Map<string, MeshPhysicalMaterial>()

//Shared lights - one entry per spec, intensity + color are swapped per
//mode by applyLightsForMode() instead of having two parallel arrays.
type LiveLight = {
  spec:    SharedLight
  light:   PointLight | DirectionalLight
  target?: import("three").Object3D
}
const liveLights: LiveLight[] = []

let wfBaseMat: MeshPhysicalMaterial | null = null

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

//Apply env from a direct URL saved on the viewerSettings (file extension
//in the URL drives the loader choice). Falls back to procedural sky when
//the URL is missing OR the file fails to load.
function applyHdrFromUrl(url: string | null | undefined, intensity: number) {
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
    scene.environment = currentHdrProbe
    scene.environmentIntensity = intensity
    requestRender()
    return
  }
  const isExr = /\.exr$/i.test(url)
  const loader = isExr ? new EXRLoader() : new HDRLoader()
  loader.load(
    url,
    (source) => {
      applyEnvFromSource(source, intensity)
      //pull the probe back out of the scene so we can rebind it on the
      //next toggle without re-running PMREM.
      currentHdrUrl   = url
      currentHdrProbe = scene?.environment ?? null
    },
    undefined,
    (err) => {
      console.error(`[ThreeViewer] HDR load failed for ${url}:`, err)
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

//Apply the current mode's intensity + color from each LiveLight.spec
//onto the actual three.js light. Called on wireframe enter/leave so the
//SAME light fixture changes character between the two modes.
function applyLightsForMode(mode: "normal" | "wireframe") {
  for (const item of liveLights) {
    const intensity = mode === "wireframe" ? item.spec.wfIntensity : item.spec.normalIntensity
    const colorHex  = mode === "wireframe" ? item.spec.wfColor     : item.spec.normalColor
    item.light.intensity = intensity
    item.light.color.set(colorHex)
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
      normalColor:     normal?.color ?? "#ffffff",
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
const wfPatchedMaterials = new Set<string>()
const wfShaders: { mat: Material; shader: { uniforms: Record<string, { value: unknown }> } }[] = []
//Bbox stays raw - the per-corner projection on the sweep axis happens
//in recordBoxFromSceneGraph; result lands in wfMin / wfRange below.
let   wfBox: Box3 | null = null
let   wfMin   = 0
let   wfRange = 1
let   wfAxis  = new Vector3(1, 0, 0)

const WF_SWEEP_DURATION_MS = 1500

let wfTransition: {
  startTime: number
  from:      number
  to:        number
  duration:  number
  phase:     "enter" | "leave"
} | null = null

function wireframeTintColor(): Color {
  const hex = props.settings?.wireframeMode?.material?.color ?? "#808080"
  return new Color(hex)
}

function patchMaterialForSweep(material: Material) {
  if (wfPatchedMaterials.has(material.uuid)) return
  wfPatchedMaterials.add(material.uuid)

  const prevOnBeforeCompile = material.onBeforeCompile?.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer)
    shader.uniforms.uWfProgress = { value: wfTransition ? wfTransition.from : (isWireframe.value ? 1 : 0) }
    shader.uniforms.uWfTint     = { value: wireframeTintColor() }
    shader.uniforms.uWfAxis     = { value: wfAxis.clone() }
    shader.uniforms.uWfMin      = { value: wfMin }
    shader.uniforms.uWfRange    = { value: wfRange }

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWfWorldPos;",
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvWfWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWfWorldPos;\nuniform float uWfProgress;\nuniform vec3 uWfTint;\nuniform vec3 uWfAxis;\nuniform float uWfMin;\nuniform float uWfRange;",
      )
      //Inject BEFORE PBR lighting: replace diffuseColor with the tint
      //so the full lighting pipeline (lights, env contribution, tone
      //mapping) runs on the wireframe colour. Otherwise the tint would
      //land as a sRGB blend on top of the already-lit original colour
      //and look distinct from the real wfBaseMat at the end of the
      //sweep.
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

//Take the user-set axis + start/end offsets and project the bbox corners
//onto the axis to figure out the min and max world-space coordinates the
//wipe should travel between. Called whenever the axis OR the offsets
//change, and once at GLTF load after the bbox is filled.
function recomputeSweepRange() {
  if (!wfBox) return
  const axisInput = props.settings?.wireframeMode?.sweepAxis ?? [1, 0, 0]
  const start     = (props.settings?.wireframeMode?.sweepStart ?? 0)   / 100
  const end       = (props.settings?.wireframeMode?.sweepEnd   ?? 100) / 100

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
  const span = Math.max(0.0001, pmax - pmin)
  //Apply user start/end offsets - extend or shrink the visible sweep.
  wfMin   = pmin + span * start
  wfRange = Math.max(0.0001, span * (end - start))

  //Push the freshly-recomputed values onto every patched shader.
  for (const e of wfShaders) {
    ;(e.shader.uniforms.uWfAxis  as { value: Vector3 }).value.copy(wfAxis)
    ;(e.shader.uniforms.uWfMin   as { value: number  }).value = wfMin
    ;(e.shader.uniforms.uWfRange as { value: number  }).value = wfRange
  }
}

function setUWfProgressOnAll(v: number) {
  for (const e of wfShaders) {
    e.shader.uniforms.uWfProgress.value = v
  }
}

function ensureWfBaseMat() {
  const matSpec = props.settings?.wireframeMode?.material
  if (wfBaseMat) {
    if (matSpec) {
      wfBaseMat.color.set(matSpec.color)
      wfBaseMat.metalness         = matSpec.metalness
      wfBaseMat.roughness         = matSpec.roughness
      wfBaseMat.envMapIntensity   = matSpec.envMapIntensity
      wfBaseMat.specularIntensity = matSpec.specularIntensity
      wfBaseMat.needsUpdate = true
    }
    return
  }
  //polygonOffset pushes the surface BACK in z so the wireframe overlay
  //lines (sharing the geometry) land in front without z-fighting. Same
  //setup as the editor so view and edit render identically.
  wfBaseMat = new MeshPhysicalMaterial({
    color:             new Color(matSpec?.color             ?? "#808080"),
    metalness:         matSpec?.metalness                   ?? 0,
    roughness:         matSpec?.roughness                   ?? 0.5,
    envMapIntensity:   matSpec?.envMapIntensity             ?? 1,
    specularIntensity: matSpec?.specularIntensity           ?? 1,
    polygonOffset:       true,
    polygonOffsetFactor: POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits:  POLYGON_OFFSET_UNITS,
  })
}

//Skip overlay creation for meshes that ended up in the emissive picks
//(they render clean, no wireframe lines). Same behavior as the editor.
function syncWireframeOverlays(on: boolean, color: string, emissiveUuidSet: Set<string>) {
  if (!scene) return
  if (on) {
    for (const sm of sceneMeshes) {
      if (wfOverlays.has(sm.mesh.uuid)) continue
      if (emissiveUuidSet.has(sm.mesh.uuid)) continue
      const threshold = props.settings?.wireframeMode?.edgeThresholdDeg ?? WIREFRAME_EDGE_THRESHOLD_DEG
      const edgesGeo = new EdgesGeometry(sm.mesh.geometry, threshold)
      const overlayMat = new LineBasicMaterial({
        color:       new Color(color),
        transparent: true,
        opacity:     WIREFRAME_LINE_OPACITY,
        depthWrite:  false,
      })
      const overlay = new LineSegments(edgesGeo, overlayMat)
      overlay.renderOrder = WIREFRAME_OVERLAY_RENDER_ORDER
      sm.mesh.add(overlay)
      wfOverlays.set(sm.mesh.uuid, overlay)
    }
  } else {
    for (const overlay of wfOverlays.values()) {
      if (overlay.parent) overlay.parent.remove(overlay)
      if (overlay.material instanceof LineBasicMaterial) overlay.material.dispose()
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

//Compute emissive overrides + swap each mesh to its wireframe material.
//Factored so enterWireframe can defer this until the sweep animation ends.
function finalizeEnterWireframe() {
  if (!scene) return
  ensureWfBaseMat()
  const wf = props.settings?.wireframeMode
  const modeColor = wf?.color ?? "#14b8a6"

  const intensityFor = (mesh: Mesh): number | undefined => {
    const sm = sceneMeshes.find((s) => s.mesh === mesh)
    for (const e of (wf?.emissiveMeshes ?? [])) {
      if (e.name && sm?.name === e.name) return e.intensity
      if (e.uuid && mesh.uuid === e.uuid) return e.intensity
    }
    return undefined
  }

  const emissiveSet = new Set<string>()
  for (const sm of sceneMeshes) {
    const intensity = intensityFor(sm.mesh)
    if (intensity !== undefined) {
      emissiveSet.add(sm.mesh.uuid)
      let mat = wfEmissiveMaterials.get(sm.mesh.uuid)
      if (!mat) {
        const base = props.settings?.wireframeMode?.material
        mat = new MeshPhysicalMaterial({
          color:             new Color(base?.color             ?? "#808080"),
          metalness:         base?.metalness                   ?? 0,
          roughness:         base?.roughness                   ?? 0.5,
          envMapIntensity:   base?.envMapIntensity             ?? 1,
          specularIntensity: base?.specularIntensity           ?? 1,
          emissive:          new Color(modeColor),
          emissiveIntensity: intensity,
        })
        wfEmissiveMaterials.set(sm.mesh.uuid, mat)
      } else {
        mat.emissive.set(modeColor)
        mat.emissiveIntensity = intensity
        mat.needsUpdate = true
      }
      sm.mesh.material = mat
    } else {
      sm.mesh.material = wfBaseMat!
    }
  }

  syncWireframeOverlays(wf?.overlayOn ?? true, wf?.overlayColor ?? "#000000", emissiveSet)

  //Snap lights + HDR to wireframe mode NOW that the model is uniformly
  //tinted - the lighting change is invisible against the flat surface.
  applyLightsForMode("wireframe")
  applyHdrFromUrl(wf?.hdrUrl, wf?.hdrIntensity ?? 1)
}

function enterWireframe() {
  if (!scene) return
  //Refresh the sweep uniforms - tint follows the user's wireframe color,
  //axis + range are recomputed against the user's saved sweep settings.
  recomputeSweepRange()
  const tint = wireframeTintColor()
  for (const e of wfShaders) {
    (e.shader.uniforms.uWfTint as { value: Color }).value.copy(tint)
  }

  //Materials stay as ORIGINALS during the sweep with normal-mode lights
  //and HDR still active. finalizeEnterWireframe() swaps to wfBaseMat +
  //picks AND snaps lights + HDR to wireframe mode at the END, when the
  //model is already a uniform tint so the lighting swap is invisible.
  wfTransition = {
    startTime: performance.now(),
    from:      0,
    to:        1,
    duration:  WF_SWEEP_DURATION_MS,
    phase:     "enter",
  }
}

function leaveWireframe() {
  if (!scene) return
  //Swap materials back to originals NOW so the sweep can drag the tint
  //back to 0 visually. Edge overlays come off immediately.
  for (const sm of sceneMeshes) {
    const orig = meshOriginalMaterials.get(sm.mesh.uuid)
    if (orig) sm.mesh.material = orig
  }
  syncWireframeOverlays(false, "", new Set())
  applyLightsForMode("normal")
  const n = props.settings?.normalMode
  applyHdrFromUrl(n?.hdrUrl, n?.hdrIntensity ?? 1)

  wfTransition = {
    startTime: performance.now(),
    from:      1,
    to:        0,
    duration:  WF_SWEEP_DURATION_MS,
    phase:     "leave",
  }
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
  setUWfProgressOnAll(v)
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
  applyHdrFromUrl(props.settings?.normalMode?.hdrUrl, props.settings?.normalMode?.hdrIntensity ?? 1)

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
  composer.addPass(new SMAAPass(w, h))
  composer.addPass(new OutputPass())

  //LOAD .glb
  const loader = new GLTFLoader()
  loader.load(
    props.glbUrl,
    (gltf) => {
      isLoading.value = false
      loadingProgress.value = 1
      //Share ONE upgraded Physical instance across meshes that point at
      //the same glTF Standard material - otherwise an edit only touches
      //one mesh while the others keep the original look.
      const stdToPhysical = new Map<string, MeshPhysicalMaterial>()
      gltf.scene.traverse((obj) => {
        const m = obj as Mesh
        if (m.isMesh) {
          m.castShadow = true; m.receiveShadow = true
          if (m.material && !(m.material as any).isMeshPhysicalMaterial) {
            const std = m.material as MeshStandardMaterial
            if (stdToPhysical.has(std.uuid)) {
              m.material = stdToPhysical.get(std.uuid)!
            } else {
              const phys = new MeshPhysicalMaterial({
                color: std.color, map: std.map,
                metalness: std.metalness, roughness: std.roughness,
                emissive: std.emissive, emissiveIntensity: std.emissiveIntensity, emissiveMap: std.emissiveMap,
                normalMap: std.normalMap, roughnessMap: std.roughnessMap, metalnessMap: std.metalnessMap,
                aoMap: std.aoMap, aoMapIntensity: std.aoMapIntensity, envMapIntensity: std.envMapIntensity,
                transparent: std.transparent, opacity: std.opacity, alphaTest: std.alphaTest,
                side: std.side, depthTest: std.depthTest, depthWrite: std.depthWrite, flatShading: std.flatShading,
              })
              if (std.normalScale) phys.normalScale.copy(std.normalScale)
              phys.name = std.name
              phys.uuid = std.uuid
              stdToPhysical.set(std.uuid, phys)
              m.material = phys
            }
          }
        }
      })

      sceneMeshes.length = 0
      let meshIndex = 0
      gltf.scene.traverse((obj) => {
        const m = obj as Mesh
        if (!m.isMesh) return
        sceneMeshes.push({ mesh: m, name: m.name || `Mesh ${meshIndex}` })
        meshOriginalMaterials.set(m.uuid, m.material as MeshPhysicalMaterial)
        meshIndex++
      })

      //SWEEP shader prep: world-bbox once (used for the wipe range) and
      //patch every original material with the onBeforeCompile injection
      //so the uniform-driven tint is available the moment the user
      //toggles wireframe mode. Idempotent per-material via the
      //wfPatchedMaterials Set.
      gltf.scene.updateMatrixWorld(true)
      recordBoxFromSceneGraph(gltf.scene)
      for (const sm of sceneMeshes) {
        const mat = sm.mesh.material as Material | Material[]
        if (Array.isArray(mat)) { for (const sub of mat) patchMaterialForSweep(sub) }
        else                    patchMaterialForSweep(mat)
      }

      //apply saved material overrides
      if (props.settings?.materials) applyMaterialOverrides(props.settings.materials)

      //SPAWN LIGHTS - prefer the new shared shape, fall back to legacy
      //per-mode arrays for back-compat with pre-unification saves.
      const sharedSpecs: SharedLight[] = props.settings?.lights && props.settings.lights.length > 0
        ? props.settings.lights
        : migrateLegacyLights(
            props.settings?.normalMode?.lights,
            props.settings?.wireframeMode?.lights,
            props.settings?.wireframeMode?.color ?? "#14b8a6",
          )
      for (const spec of sharedSpecs) {
        const entry = spawnSharedLight(spec)
        scene!.add(entry.light)
        if (entry.target) scene!.add(entry.target)
        liveLights.push(entry)
      }

      scene!.add(gltf.scene)

      const tempBox = new Box3().setFromObject(gltf.scene)
      const center  = tempBox.getCenter(new Vector3())
      const sphere  = tempBox.getBoundingSphere(new Sphere())

      gltf.scene.position.x -= center.x
      gltf.scene.position.z -= center.z
      gltf.scene.position.y -= tempBox.min.y

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

      isReady.value = true
      //if the parent already had wireframe ON at mount-time, apply it
      //now that the glb materials / lights are populated
      if (props.wireframe) applyWireframeMode(true)
      requestRender(2000)
    },
    undefined,
    (evt) => {
      if (evt.total > 0) loadingProgress.value = evt.loaded / evt.total
    },
    (err) => { console.error("[ThreeViewer] glb load failed:", err); isLoading.value = false },
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
    //Wireframe-sweep tint advance. Ticked here so it runs at framerate
    //alongside the camera anim + render keepalive; calls requestRender
    //internally so the composer keeps painting until the sweep is done.
    if (wfTransition) advanceWfTransition()
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
  if (rafId !== null) cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
  resizeObserver = null
  controls?.dispose()
  composer?.dispose()
  renderer?.dispose()
  for (const m of wfEmissiveMaterials.values()) m.dispose()
  wfEmissiveMaterials.clear()
  for (const overlay of wfOverlays.values()) {
    if (overlay.material instanceof LineBasicMaterial) overlay.material.dispose()
    overlay.geometry.dispose()
  }
  wfOverlays.clear()
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
  //but DO push fresh sweep axis / start / end into the shader uniforms
  //so live edits in the editor preview without a reload.
  recomputeSweepRange()
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
reads against a busy background. Track at 8% alpha gives a visible base
line even at 0% progress; fill is the accent so the loading state ties
to the rest of the site's interactive palette. min-width keeps a small
visible bar even before the first progress event fires.*/
.three-viewer__loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background-color: hsl(0 0% 100% / 0.08);
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
