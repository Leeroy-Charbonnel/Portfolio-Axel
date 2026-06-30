import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector3,
} from "three"

//WIREFRAME MATERIALS - two custom MeshPhysicalMaterial subclasses sharing
//a sweep machinery. Both render IDENTICALLY at progress=0 (full PBR with
//the source GLB's texture / metalness / roughness / normal map / env
//intensity etc.). They diverge at progress=1:
//  - CustomNormalMaterial   → wireframe gray (PBR-shaded with the wf
//                              material params, diffuse mixed to uWfTint)
//  - CustomEmissiveMaterial → FLAT opaque emission, bypasses PBR entirely
//                              (outgoingLight = uWfEmissive * intensity,
//                              alpha 1, transparent=false)
//
//Each material owns its OWN uniform set on shader.uniforms - we DON'T
//share uniform objects at module-level anymore. Two ThreeViewer instances
//on the same page (e.g. multiple MainProject cards) would otherwise have
//their sweeps cross-contaminate via the shared reference, so when the
//user toggles wireframe on project 1, project 2's viewer would render
//in wireframe state the moment it mounted. Per-instance uniforms + the
//consumer (ThreeViewer / editor) tracking its own material set fixes it.

//===========================================================================
//SHADER FRAGMENTS - common pieces both classes inject.
const VERTEX_INJECT_COMMON   = "#include <common>\nvarying vec3 vWfWorldPos;"
const VERTEX_INJECT_POS      = "#include <project_vertex>\nvWfWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;"

const FRAGMENT_INJECT_COMMON_BASE =
  "#include <common>\n" +
  "varying vec3 vWfWorldPos;\n" +
  "uniform float uWfProgress;\nuniform vec3 uWfTint;\nuniform vec3 uWfAxis;\n" +
  "uniform float uWfMin;\nuniform float uWfRange;\n" +
  "uniform float uWfMetalness;\nuniform float uWfRoughness;\n" +
  "uniform float uWfEnvScale;\nuniform float uWfSpecScale;\n" +
  "uniform vec3 uWfEmissive;\n"

const FRAGMENT_INJECT_WF_MASK_AND_TINT =
  "#include <map_fragment>\n" +
  "float wfT = (dot(vWfWorldPos, uWfAxis) - uWfMin) / max(uWfRange, 0.0001);\n" +
  "float wfP = uWfProgress * 1.04 - 0.02;\n" +
  //SHARP transition - step() instead of smoothstep() so the sweep front
  //is a clean binary boundary. The previous 0.04-wide smoothstep band
  //rendered as a visibly lighter zone at the front (mid-mix between
  //original and tint), which the user explicitly rejected.
  "float wfMask = 1.0 - step(wfP, wfT);\n" +
  "diffuseColor.rgb = mix(diffuseColor.rgb, uWfTint, wfMask);\n"

const FRAGMENT_INJECT_ROUGHNESS =
  "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uWfRoughness, wfMask);\n"

const FRAGMENT_INJECT_METALNESS =
  "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, uWfMetalness, wfMask);\n"

const FRAGMENT_INJECT_ENV =
  "#include <lights_fragment_maps>\n" +
  "#ifdef USE_ENVMAP\n" +
  "float wfEnvK = mix(1.0, uWfEnvScale / max(envMapIntensity, 0.0001), wfMask);\n" +
  "iblIrradiance *= wfEnvK;\n" +
  "radiance      *= wfEnvK;\n" +
  "#endif\n"

//===========================================================================
//Per-material uniform set. Each Custom{Normal,Emissive}Material instance
//gets its OWN set; the consumer (ThreeViewer / editor) iterates its own
//materials to push updates. No module-level shared state = no cross-
//instance contamination.
interface SweepUniformSet {
  uWfProgress:  { value: number }
  uWfTint:      { value: Color }
  uWfAxis:      { value: Vector3 }
  uWfMin:       { value: number }
  uWfRange:     { value: number }
  uWfMetalness: { value: number }
  uWfRoughness: { value: number }
  uWfEnvScale:  { value: number }
  uWfSpecScale: { value: number }
  uWfEmissive:  { value: Color }
}

function freshUniformSet(): SweepUniformSet {
  return {
    uWfProgress:  { value: 0 },
    uWfTint:      { value: new Color("#808080") },
    uWfAxis:      { value: new Vector3(1, 0, 0) },
    uWfMin:       { value: 0 },
    uWfRange:     { value: 1 },
    uWfMetalness: { value: 0 },
    uWfRoughness: { value: 0.5 },
    uWfEnvScale:  { value: 1 },
    uWfSpecScale: { value: 1 },
    uWfEmissive:  { value: new Color("#14b8a6") },
  }
}

export interface WfSweepPatch {
  progress?:          number
  tintColor?:         Color | string
  axis?:              Vector3
  min?:               number
  range?:             number
  metalness?:         number
  roughness?:         number
  envIntensity?:      number
  specularIntensity?: number
  emissiveColor?:     Color | string
}

//Push a partial update across every material in the iterable. Consumers
//keep a Set / Array of their own materials and call this when sweep
//params change. Each material has its own uniform set so this is a
//per-instance write, not a shared mutation.
export function pushSweepUniforms(
  materials: Iterable<CustomNormalMaterial | CustomEmissiveMaterial>,
  patch: WfSweepPatch,
): void {
  for (const mat of materials) {
    const u = mat._sweepUniforms
    if (patch.progress !== undefined)          u.uWfProgress.value = patch.progress
    if (patch.tintColor !== undefined)         u.uWfTint.value.set(patch.tintColor as never)
    if (patch.axis !== undefined)              u.uWfAxis.value.copy(patch.axis)
    if (patch.min !== undefined)               u.uWfMin.value = patch.min
    if (patch.range !== undefined)             u.uWfRange.value = patch.range
    if (patch.metalness !== undefined)         u.uWfMetalness.value = patch.metalness
    if (patch.roughness !== undefined)         u.uWfRoughness.value = patch.roughness
    if (patch.envIntensity !== undefined)      u.uWfEnvScale.value = patch.envIntensity
    if (patch.specularIntensity !== undefined) u.uWfSpecScale.value = patch.specularIntensity
    if (patch.emissiveColor !== undefined)     u.uWfEmissive.value.set(patch.emissiveColor as never)
  }
}

//===========================================================================
function copyPbrFrom(
  target: MeshPhysicalMaterial,
  src:    MeshStandardMaterial | MeshPhysicalMaterial,
): void {
  target.color.copy(src.color)
  target.map               = src.map
  target.metalness         = src.metalness
  target.roughness         = src.roughness
  target.emissive.copy(src.emissive)
  target.emissiveIntensity = src.emissiveIntensity
  target.emissiveMap       = src.emissiveMap
  target.normalMap         = src.normalMap
  if (src.normalScale) target.normalScale.copy(src.normalScale)
  target.roughnessMap      = src.roughnessMap
  target.metalnessMap      = src.metalnessMap
  target.aoMap             = src.aoMap
  target.aoMapIntensity    = src.aoMapIntensity
  target.envMapIntensity   = src.envMapIntensity
  target.side              = src.side
  target.depthTest         = src.depthTest
  target.depthWrite        = src.depthWrite
  target.flatShading       = src.flatShading
  target.alphaTest         = src.alphaTest
  target.name              = src.name
}

//===========================================================================
export class CustomNormalMaterial extends MeshPhysicalMaterial {
  //Per-instance uniform set. ALWAYS allocated in the constructor (not at
  //onBeforeCompile time) so that pushSweepUniforms() can mutate it even
  //BEFORE the first render. onBeforeCompile then BINDS this same object
  //to the shader by reference - so any value mutation propagates to the
  //GPU at the next draw. Previously the uniforms were created lazily,
  //and a push-before-compile silently skipped the material; the next
  //compile then used constructor defaults (min=0, range=1) which left
  //the model mid-sweep on initial load.
  _sweepUniforms: SweepUniformSet

  constructor(source?: MeshStandardMaterial | MeshPhysicalMaterial) {
    super()
    if (source) {
      copyPbrFrom(this, source)
      this.transparent = source.transparent
      this.opacity     = source.opacity
    }
    this._sweepUniforms = freshUniformSet()
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this._sweepUniforms as unknown as Record<string, { value: unknown }>)
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>",         VERTEX_INJECT_COMMON)
        .replace("#include <project_vertex>", VERTEX_INJECT_POS)
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>",                 FRAGMENT_INJECT_COMMON_BASE)
        .replace("#include <map_fragment>",           FRAGMENT_INJECT_WF_MASK_AND_TINT)
        .replace("#include <roughnessmap_fragment>",  FRAGMENT_INJECT_ROUGHNESS)
        .replace("#include <metalnessmap_fragment>",  FRAGMENT_INJECT_METALNESS)
        .replace("#include <lights_fragment_maps>",   FRAGMENT_INJECT_ENV)
    }
  }
  //All CustomNormalMaterial instances produce identical shader source -
  //they CAN share one compiled WebGL program. Per-instance uniforms still
  //bind correctly at draw time because each material has its own values.
  customProgramCacheKey(): string {
    return "wfCustomNormal"
  }
}

//===========================================================================
export class CustomEmissiveMaterial extends MeshPhysicalMaterial {
  wfEmissiveBoost: number
  _sweepUniforms: SweepUniformSet
  private _shaderUniforms: { uWfEmissiveBoost: { value: number } } | null = null

  constructor(source?: MeshStandardMaterial | MeshPhysicalMaterial, emissiveBoost: number = 1) {
    super()
    if (source) copyPbrFrom(this, source)
    //Force ALL alpha-related state off so emissive picks render as 100%
    //opaque flat emission. transparent=false alone isn't enough - if the
    //source has alphaTest > 0, alphaMap set, alphaHash on, or
    //transmission > 0, fragments can still get discarded or blended.
    this.transparent     = false
    this.opacity         = 1.0
    this.alphaTest       = 0
    this.alphaMap        = null
    this.alphaHash       = false
    this.transmission    = 0
    this.depthWrite      = true
    this.depthTest       = true
    this.wfEmissiveBoost = emissiveBoost
    this._sweepUniforms  = freshUniformSet()
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this._sweepUniforms as unknown as Record<string, { value: unknown }>)
      //Per-instance brightness multiplier - separate from the sweep set
      //because it's emissive-only.
      const boostUniform = { value: this.wfEmissiveBoost }
      ;(shader.uniforms as Record<string, { value: unknown }>).uWfEmissiveBoost = boostUniform
      this._shaderUniforms = { uWfEmissiveBoost: boostUniform }

      //NO vertex inject + NO wfMask-based diffuseColor / roughness /
      //metalness / env injections - emissive picks transition UNIFORMLY
      //across the whole mesh, driven straight by uWfProgress (0..1),
      //NOT by the per-fragment positional sweep front.
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          FRAGMENT_INJECT_COMMON_BASE +
          "uniform float uWfEmissiveBoost;\n",
        )
        //Force diffuseColor.a = 1 BEFORE any alphatest / alphahash chunk
        //that could discard fragments. Belt-and-braces against any quirky
        //source material flags we missed in the constructor.
        .replace(
          "#include <alphatest_fragment>",
          "diffuseColor.a = 1.0;\n" +
          "#include <alphatest_fragment>",
        )
        //THE emissive-specific override - mix outgoingLight toward the
        //FLAT emission colour (uWfEmissive * uWfEmissiveBoost) gated by
        //uWfProgress (uniform = same value per fragment) so the whole
        //mesh fades colour together, no sweep front passing through.
        .replace(
          "#include <opaque_fragment>",
          "outgoingLight = mix(outgoingLight, uWfEmissive * uWfEmissiveBoost, uWfProgress);\n" +
          "diffuseColor.a = 1.0;\n" +
          "#include <opaque_fragment>",
        )
    }
  }
  customProgramCacheKey(): string {
    return "wfCustomEmissive"
  }
  setEmissiveBoost(v: number): void {
    this.wfEmissiveBoost = v
    if (this._shaderUniforms) this._shaderUniforms.uWfEmissiveBoost.value = v
  }
}

//===========================================================================
//WIREFRAME EDGES - topological diagonal detection. Standard EdgesGeometry
//uses a per-edge angle threshold to drop "near-coplanar" edges that are
//likely triangulation diagonals on flat faces. We DON'T want that UX
//(arbitrary slider, breaks on slightly-curved quads, etc.); instead we
//detect diagonals purely from the index buffer:
//
//Most exporters (Blender / Maya / Houdini / Three's GLTFExporter) emit
//the two triangles of a triangulated quad CONSECUTIVELY in the index
//buffer. Each consecutive pair that shares EXACTLY two vertices means
//those two vertices form the quad's diagonal - we exclude that edge.
//Everything else is kept (real mesh edges + open-boundary outlines).
export function buildWireframeWithoutDiagonals(geom: BufferGeometry): BufferGeometry {
  const positionAttr = geom.getAttribute("position")
  const indexAttr    = geom.getIndex()

  const triangles: Array<[number, number, number]> = []
  if (indexAttr) {
    const arr = indexAttr.array
    for (let i = 0; i + 2 < arr.length; i += 3) {
      triangles.push([arr[i] as number, arr[i + 1] as number, arr[i + 2] as number])
    }
  } else {
    const count = positionAttr.count
    for (let i = 0; i + 2 < count; i += 3) {
      triangles.push([i, i + 1, i + 2])
    }
  }

  const edgeKey = (a: number, b: number): string =>
    a < b ? `${a},${b}` : `${b},${a}`
  const diagonals = new Set<string>()
  for (let i = 0; i + 1 < triangles.length; i += 2) {
    const t1 = triangles[i]
    const t2 = triangles[i + 1]
    if (!t1 || !t2) continue
    const shared: number[] = []
    for (const v of t1) if (t2.indexOf(v) >= 0) shared.push(v)
    if (shared.length === 2) {
      diagonals.add(edgeKey(shared[0]!, shared[1]!))
    }
  }

  const edgesToDraw = new Set<string>()
  for (const t of triangles) {
    const e1 = edgeKey(t[0], t[1])
    const e2 = edgeKey(t[1], t[2])
    const e3 = edgeKey(t[2], t[0])
    if (!diagonals.has(e1)) edgesToDraw.add(e1)
    if (!diagonals.has(e2)) edgesToDraw.add(e2)
    if (!diagonals.has(e3)) edgesToDraw.add(e3)
  }

  const positions = new Float32Array(edgesToDraw.size * 2 * 3)
  let off = 0
  for (const key of edgesToDraw) {
    const parts = key.split(",")
    const a = Number(parts[0])
    const b = Number(parts[1])
    positions[off++] = positionAttr.getX(a)
    positions[off++] = positionAttr.getY(a)
    positions[off++] = positionAttr.getZ(a)
    positions[off++] = positionAttr.getX(b)
    positions[off++] = positionAttr.getY(b)
    positions[off++] = positionAttr.getZ(b)
  }
  const result = new BufferGeometry()
  result.setAttribute("position", new BufferAttribute(positions, 3))
  return result
}
