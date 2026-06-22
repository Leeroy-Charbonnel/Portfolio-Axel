<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue"
import {
  Box3,
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

interface NormalLight {
  id:       string
  type:     "point" | "directional"
  intensity: number
  color:    string
  range?:    number   //point-light only, three.js "distance" (0 = infinite)
  x: number; y: number; z: number
  tx?: number; ty?: number; tz?: number
}

interface WfLight {
  id:       string
  type:     "point" | "directional"
  intensity: number
  color?:    string   //per-light color (defaults to mode color if missing)
  range?:    number   //point-light only
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
  normalMode?: {
    hdrId?:        string
    hdrUrl?:       string | null
    hdrIntensity?: number
    lights?:       NormalLight[]
  }
  wireframeMode?: {
    hdrId?:           string
    hdrUrl?:          string | null
    hdrIntensity?:    number
    color?:           string
    overlayOn?:       boolean
    overlayColor?:    string
    material?: {
      color:             string
      metalness:         number
      roughness:         number
      envMapIntensity:   number
      specularIntensity: number
    }
    emissiveMeshes?: EmissiveSpec[]
    lights?:         WfLight[]
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

const canvas = ref<HTMLCanvasElement | null>(null)
const isWireframe = ref(false)
const isReady     = ref(false)

let scene:    Scene | null = null
let camera:   PerspectiveCamera | null = null
let renderer: WebGLRenderer | null = null
let composer: EffectComposer | null = null
let controls: OrbitControls | null = null
let pmrem:    PMREMGenerator | null = null
let rafId:    number | null = null
let renderUntil = 0
function requestRender(ms = 300) { renderUntil = performance.now() + ms }

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

//Live lights for each mode - swapped in/out by toggleWireframe
const normalLightObjects: { light: PointLight | DirectionalLight; target?: import("three").Object3D }[] = []
const wfLightObjects:     { light: PointLight | DirectionalLight; target?: import("three").Object3D }[] = []

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

//Apply env from a direct URL saved on the viewerSettings (file extension
//in the URL drives the loader choice). Falls back to procedural sky when
//the URL is missing.
function applyHdrFromUrl(url: string | null | undefined, intensity: number) {
  if (!url) {
    applyEnvFromSource(makeSkyGradient(), intensity)
    return
  }
  const isExr = /\.exr$/i.test(url)
  const loader = isExr ? new EXRLoader() : new HDRLoader()
  loader.load(url, (source) => applyEnvFromSource(source, intensity))
}

//===========================================================================
//Spawn a light (point or directional) per the saved spec. We keep the
//Three objects in a parallel array so toggleWireframe can show/hide them.
function spawnLight(spec: NormalLight | WfLight, forcedColor?: string): { light: PointLight | DirectionalLight; target?: import("three").Object3D } {
  //Per-light color (saved by the editor) wins over the forcedColor
  //fallback (mode color) so wireframe lights can be color-picked
  //individually too, exactly like normal lights.
  const colorHex = (spec as NormalLight | WfLight).color ?? forcedColor ?? "#ffffff"
  const col = new Color(colorHex)
  let light: PointLight | DirectionalLight
  if (spec.type === "point") {
    //range (three.js "distance") = 0 means infinite range (default).
    const range = (spec as NormalLight | WfLight).range ?? 0
    light = new PointLight(col, spec.intensity, range, 2)
    light.position.set(spec.x, spec.y, spec.z)
    return { light }
  } else {
    light = new DirectionalLight(col, spec.intensity)
    light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias       = -0.0002
    light.shadow.normalBias = 0.02
    light.position.set(spec.x, spec.y, spec.z)
    const target = light.target
    target.position.set(spec.tx ?? 0, spec.ty ?? 0, spec.tz ?? 0)
    target.updateMatrixWorld()
    return { light, target }
  }
}

//Resize every directional light's shadow frustum so it covers the scene
//bounding sphere. Called once after the .glb loads and the model is
//framed/centered.
function tuneShadowCameras(sphereRadius: number) {
  const size = Math.max(sphereRadius * 3, 1)
  for (const arr of [normalLightObjects, wfLightObjects]) {
    for (const item of arr) {
      const dl = item.light as DirectionalLight
      if (!(dl as any).isDirectionalLight) continue
      dl.shadow.camera.left   = -size
      dl.shadow.camera.right  =  size
      dl.shadow.camera.top    =  size
      dl.shadow.camera.bottom = -size
      dl.shadow.camera.near   = 0.1
      dl.shadow.camera.far    = size * 5
      dl.shadow.camera.updateProjectionMatrix()
    }
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
    polygonOffsetFactor: 1,
    polygonOffsetUnits:  1,
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
      const edgesGeo = new EdgesGeometry(sm.mesh.geometry, 1)
      const overlayMat = new LineBasicMaterial({
        color:       new Color(color),
        transparent: true,
        opacity:     0.9,
        depthWrite:  false,
      })
      const overlay = new LineSegments(edgesGeo, overlayMat)
      overlay.renderOrder = 998
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

function enterWireframe() {
  if (!scene) return
  ensureWfBaseMat()
  const wf = props.settings?.wireframeMode
  const modeColor = wf?.color ?? "#14b8a6"

  //swap mesh.material refs - wfBaseMat for everything, per-emissive
  //materials for picks. Emissive picks are matched by mesh NAME (the
  //glTF name is stable; mesh.uuid regenerates on every reload).
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

  for (const l of normalLightObjects) { l.light.visible = false }
  for (const l of wfLightObjects)     { l.light.visible = true  }

  applyHdrFromUrl(wf?.hdrUrl, wf?.hdrIntensity ?? 1)
}

function leaveWireframe() {
  if (!scene) return
  for (const sm of sceneMeshes) {
    const orig = meshOriginalMaterials.get(sm.mesh.uuid)
    if (orig) sm.mesh.material = orig
  }
  syncWireframeOverlays(false, "", new Set())
  for (const l of normalLightObjects) { l.light.visible = true  }
  for (const l of wfLightObjects)     { l.light.visible = false }
  const n = props.settings?.normalMode
  applyHdrFromUrl(n?.hdrUrl, n?.hdrIntensity ?? 1)
}

//===========================================================================
onMounted(() => {
  if (!canvas.value) return
  const c = canvas.value
  const { clientWidth: w, clientHeight: h } = c.parentElement!

  scene = new Scene()
  scene.background = null

  camera = new PerspectiveCamera(35, w / h, 0.01, 1000)
  camera.position.set(2, 1.5, 3)

  renderer = new WebGLRenderer({ canvas: c, antialias: false, alpha: true, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(w, h, false)
  renderer.toneMapping            = NeutralToneMapping
  renderer.toneMappingExposure    = 1
  renderer.shadowMap.enabled      = true
  renderer.shadowMap.type         = PCFSoftShadowMap
  renderer.setClearColor(new Color(0x000000), 0)

  pmrem = new PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  applyHdrFromUrl(props.settings?.normalMode?.hdrUrl, props.settings?.normalMode?.hdrIntensity ?? 1)

  const ground = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ opacity: 0.35 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  controls = new OrbitControls(camera, c)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  //Wide range so a saved start view at a large or tight radius isn't
  //clamped when OrbitControls re-syncs at the end of the intro fly-in.
  controls.minDistance = 0.05
  controls.maxDistance = 200
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

      //apply saved material overrides
      if (props.settings?.materials) applyMaterialOverrides(props.settings.materials)

      //spawn normal + wireframe lights
      const n = props.settings?.normalMode
      if (n?.lights) {
        for (const spec of n.lights) {
          const entry = spawnLight(spec)
          scene!.add(entry.light)
          if (entry.target) scene!.add(entry.target)
          normalLightObjects.push(entry)
        }
      }
      const wf = props.settings?.wireframeMode
      if (wf?.lights) {
        for (const spec of wf.lights) {
          const entry = spawnLight(spec, wf.color ?? "#14b8a6")
          entry.light.visible = false
          scene!.add(entry.light)
          if (entry.target) scene!.add(entry.target)
          wfLightObjects.push(entry)
        }
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
        restSph.radius * 2.5,
        Math.max(0.05, restSph.phi - 0.2),  //barely above
        restSph.theta + Math.PI / 4,         //eighth turn around the model
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
        duration: 2800,
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
    (err) => { console.error("[ThreeViewer] glb load failed:", err) },
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
    if (now < renderUntil) composer!.render()
    rafId = requestAnimationFrame(tick)
  }
  tick()
})

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
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
  requestRender(500)
}, { deep: true })
</script>

<template>
  <div class="three-viewer">
    <canvas ref="canvas" class="three-viewer__canvas"></canvas>
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
</style>
