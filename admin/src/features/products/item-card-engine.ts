import * as THREE from 'three'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

// ---------- constants (mirrored from app config) ----------

const PREVIEW_LIGHT = {
  ambient: 0.78,
  key: 0.88,
  fill: 0.56,
  keyPosition: [200, 400, 150] as const,
  fillPosition: [-100, 200, -200] as const,
}

const PREVIEW_SURFACE = { roughness: 0.9, metalness: 0 }

const BASE_MODEL_ROTATION_DEG: [number, number, number] = [-90, 0, 0]
const BASE_POV_OFFSET_DEG: [number, number, number] = [-10, 0, 0]
const BASE_COMPOSITION_OFFSET_X = -0.06
const BASE_COMPOSITION_OFFSET_Y = 0

// ---------- types ----------

export interface LightSetup {
  ambient: number
  key: number
  fill: number
}

export type LightPresetId = 'balanced' | 'highContrast' | 'softFill' | 'custom'

export const LIGHT_PRESETS: Record<
  Exclude<LightPresetId, 'custom'>,
  { label: string; values: LightSetup }
> = {
  balanced: {
    label: '均衡（默认）',
    values: {
      ambient: PREVIEW_LIGHT.ambient,
      key: PREVIEW_LIGHT.key,
      fill: PREVIEW_LIGHT.fill,
    },
  },
  highContrast: {
    label: '高对比',
    values: { ambient: 0.55, key: 1.05, fill: 0.25 },
  },
  softFill: {
    label: '柔和补光',
    values: { ambient: 1.1, key: 0.65, fill: 0.8 },
  },
}

export type EdgeRenderMode = 'none' | 'hardEdges' | 'wireframe' | 'cad'
export type EdgePresetId =
  | 'productOutline'
  | 'structure'
  | 'technical'
  | 'custom'

export interface EdgePreset {
  label: string
  mode: EdgeRenderMode
  colorHex: string
  widthPx: number
  hardEdgeThresholdDeg: number
}

export const EDGE_PRESETS: Record<
  Exclude<EdgePresetId, 'custom'>,
  EdgePreset
> = {
  productOutline: {
    label: '产品轮廓',
    mode: 'hardEdges',
    colorHex: '#0F172A',
    widthPx: 1.8,
    hardEdgeThresholdDeg: 68,
  },
  structure: {
    label: '结构展示',
    mode: 'wireframe',
    colorHex: '#1E293B',
    widthPx: 1.2,
    hardEdgeThresholdDeg: 68,
  },
  technical: {
    label: '技术图纸',
    mode: 'cad',
    colorHex: '#0B0F1A',
    widthPx: 1.6,
    hardEdgeThresholdDeg: 55,
  },
}

export const DEFAULT_LIGHT_PRESET: Exclude<LightPresetId, 'custom'> =
  'balanced'
export const DEFAULT_LIGHT_SETUP = LIGHT_PRESETS[DEFAULT_LIGHT_PRESET].values
export const DEFAULT_EDGE_PRESET: Exclude<EdgePresetId, 'custom'> =
  'productOutline'
export const DEFAULT_EDGE_SETUP = EDGE_PRESETS[DEFAULT_EDGE_PRESET]

export interface ModelRenderOptions {
  modelRotationDeg: [number, number, number]
  fillRatio: number
  colorHex: string
  edgeMode: EdgeRenderMode
  edgeColorHex: string
  edgeWidthPx: number
  hardEdgeThresholdDeg: number
}

export interface CameraRenderOptions {
  povRotationDeg: [number, number, number]
  compositionOffsetX: number
  compositionOffsetY: number
}

// ---------- scene context ----------

export interface SceneContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  modelRoot: THREE.Group
  ambientLight: THREE.AmbientLight
  keyLight: THREE.DirectionalLight
  fillLight: THREE.DirectionalLight
  loader: ThreeMFLoader
  dispose: () => void
}

// ---------- internal helpers ----------

function disposeObjectResources(root: THREE.Object3D) {
  root.traverse((obj) => {
    const d = obj as THREE.Object3D & {
      geometry?: { dispose?: () => void }
      material?: THREE.Material | THREE.Material[]
    }
    d.geometry?.dispose?.()
    if (Array.isArray(d.material)) d.material.forEach((m) => m.dispose())
    else d.material?.dispose()
  })
}

function updateEdgeLineResolution(
  root: THREE.Object3D,
  renderer: THREE.WebGLRenderer
) {
  const size = new THREE.Vector2()
  renderer.getSize(size)
  if (
    !Number.isFinite(size.x) ||
    !Number.isFinite(size.y) ||
    size.x <= 0 ||
    size.y <= 0
  )
    return
  root.traverse((obj) => {
    const mat = (obj as THREE.Object3D & { material?: unknown }).material
    if (!mat) return
    if (mat instanceof LineMaterial) {
      mat.resolution.set(size.x, size.y)
    } else if (Array.isArray(mat)) {
      mat.forEach((m) => {
        if (m instanceof LineMaterial) m.resolution.set(size.x, size.y)
      })
    }
  })
}

interface EdgeRenderOptions {
  mode: EdgeRenderMode
  colorHex: string
  widthPx: number
  hardEdgeThresholdDeg: number
}

function extractLinePositions(
  geometry: THREE.BufferGeometry
): Float32Array | null {
  const positions = geometry.attributes.position
  const raw = positions?.array as ArrayLike<number> | undefined
  let valid = Boolean(raw && raw.length >= 6 && raw.length % 6 === 0)
  if (valid && raw) {
    for (let i = 0; i < raw.length; i++) {
      if (!Number.isFinite(raw[i] ?? NaN)) {
        valid = false
        break
      }
    }
  }
  if (!valid || !raw) return null
  return new Float32Array(raw as ArrayLike<number>)
}

function makeEdgeLines(
  rawPositions: Float32Array,
  options: EdgeRenderOptions
): LineSegments2 {
  const edgeGeometry = new LineSegmentsGeometry().setPositions(rawPositions)
  const edgeMaterial = new LineMaterial({
    color: new THREE.Color(options.colorHex),
    linewidth: THREE.MathUtils.clamp(options.widthPx, 0.5, 6),
    transparent: true,
    opacity: 0.95,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  })
  const edgeLines = new LineSegments2(edgeGeometry, edgeMaterial)
  edgeLines.userData.__itemCardEdge = true
  edgeLines.renderOrder = 3
  edgeLines.frustumCulled = false
  return edgeLines
}

function createMeshEdgeOverlay(
  mesh: THREE.Mesh,
  options: EdgeRenderOptions
): LineSegments2 | null {
  if (options.mode === 'none') return null
  let merged: THREE.BufferGeometry | null = null
  let lineGeometry: THREE.BufferGeometry | null = null
  try {
    if (options.mode === 'hardEdges' || options.mode === 'cad') {
      merged = mergeVertices(mesh.geometry.clone(), 1e-4)
      lineGeometry = new THREE.EdgesGeometry(
        merged,
        THREE.MathUtils.clamp(options.hardEdgeThresholdDeg, 1, 180)
      )
    } else {
      lineGeometry = new THREE.WireframeGeometry(mesh.geometry)
    }
    const rawPositions = extractLinePositions(lineGeometry)
    if (!rawPositions) return null
    return makeEdgeLines(rawPositions, options)
  } finally {
    lineGeometry?.dispose()
    merged?.dispose()
  }
}

function createCadSilhouetteOverlay(
  mesh: THREE.Mesh,
  colorHex: string
): THREE.Mesh {
  const overlay = new THREE.Mesh(
    mesh.geometry.clone(),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    })
  )
  overlay.scale.setScalar(1.01)
  overlay.renderOrder = 2
  return overlay
}

// ---------- public API ----------

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const w = Math.max(1, canvas.clientWidth)
  const h = Math.max(1, canvas.clientHeight)
  renderer.setSize(w, h, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(28, w / h, 1, 5000)
  const modelRoot = new THREE.Group()
  scene.add(modelRoot)

  const ambientLight = new THREE.AmbientLight(
    0xffffff,
    DEFAULT_LIGHT_SETUP.ambient
  )
  scene.add(ambientLight)
  const keyLight = new THREE.DirectionalLight(
    0xffffff,
    DEFAULT_LIGHT_SETUP.key
  )
  keyLight.position.set(...PREVIEW_LIGHT.keyPosition)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(
    0xffffff,
    DEFAULT_LIGHT_SETUP.fill
  )
  fillLight.position.set(...PREVIEW_LIGHT.fillPosition)
  scene.add(fillLight)

  const resize = () => {
    const width = canvas.clientWidth
    const height = Math.max(1, canvas.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    updateEdgeLineResolution(modelRoot, renderer)
  }
  resize()
  window.addEventListener('resize', resize)

  const loader = new ThreeMFLoader()

  return {
    renderer,
    scene,
    camera,
    modelRoot,
    ambientLight,
    keyLight,
    fillLight,
    loader,
    dispose: () => {
      window.removeEventListener('resize', resize)
      disposeObjectResources(modelRoot)
      modelRoot.clear()
      renderer.dispose()
    },
  }
}

export function applyLightSetup(ctx: SceneContext, setup: LightSetup) {
  ctx.ambientLight.intensity = THREE.MathUtils.clamp(setup.ambient, 0, 2.5)
  ctx.keyLight.intensity = THREE.MathUtils.clamp(setup.key, 0, 2.5)
  ctx.fillLight.intensity = THREE.MathUtils.clamp(setup.fill, 0, 2.5)
}

export function applyCameraPose(
  ctx: SceneContext,
  options: CameraRenderOptions
) {
  if (ctx.modelRoot.children.length === 0) return
  const centeredBox = new THREE.Box3().setFromObject(ctx.modelRoot)
  const finalSize = centeredBox.getSize(new THREE.Vector3())
  const cameraDistance = 280
  const framingTarget = new THREE.Vector3(0, finalSize.y * 0.42, 0)
  const lookAt = framingTarget.clone()
  const baseDirection = new THREE.Vector3(-1, 0.72, 1.15).normalize()
  const appliedPov: [number, number, number] = [
    BASE_POV_OFFSET_DEG[0] + options.povRotationDeg[0],
    BASE_POV_OFFSET_DEG[1] + options.povRotationDeg[1],
    BASE_POV_OFFSET_DEG[2] + options.povRotationDeg[2],
  ]
  const povEuler = new THREE.Euler(
    THREE.MathUtils.degToRad(appliedPov[0]),
    THREE.MathUtils.degToRad(appliedPov[1]),
    THREE.MathUtils.degToRad(appliedPov[2]),
    'XYZ'
  )
  const direction = baseDirection.applyEuler(povEuler).normalize()
  ctx.camera.position.copy(direction.multiplyScalar(cameraDistance))
  ctx.camera.lookAt(lookAt)

  for (let i = 0; i < 3; i++) {
    ctx.camera.updateMatrixWorld(true)
    const projected = framingTarget.clone().project(ctx.camera)
    if (Math.abs(projected.x) < 0.002) break
    const dist = ctx.camera.position.distanceTo(lookAt)
    const halfH =
      Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov * 0.5)) * dist
    const halfW = halfH * ctx.camera.aspect
    const right = new THREE.Vector3()
      .setFromMatrixColumn(ctx.camera.matrixWorld, 0)
      .normalize()
    lookAt.addScaledVector(right, projected.x * halfW)
    ctx.camera.lookAt(lookAt)
  }

  const appliedCompositionOffsetX =
    BASE_COMPOSITION_OFFSET_X + options.compositionOffsetX
  const appliedCompositionOffsetY =
    BASE_COMPOSITION_OFFSET_Y + options.compositionOffsetY
  if (appliedCompositionOffsetX !== 0 || appliedCompositionOffsetY !== 0) {
    const dist = ctx.camera.position.distanceTo(lookAt)
    const halfH =
      Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov * 0.5)) * dist
    const halfW = halfH * ctx.camera.aspect
    const right = new THREE.Vector3()
      .setFromMatrixColumn(ctx.camera.matrixWorld, 0)
      .normalize()
    const up = new THREE.Vector3()
      .setFromMatrixColumn(ctx.camera.matrixWorld, 1)
      .normalize()
    lookAt.addScaledVector(right, appliedCompositionOffsetX * halfW)
    lookAt.addScaledVector(up, appliedCompositionOffsetY * halfH)
    ctx.camera.lookAt(lookAt)
  }

  updateEdgeLineResolution(ctx.modelRoot, ctx.renderer)
  ctx.renderer.render(ctx.scene, ctx.camera)
}

export async function renderModelToScene(
  ctx: SceneContext,
  sourceUrl: string,
  modelOptions: ModelRenderOptions,
  cameraOptions: CameraRenderOptions
) {
  const loaded = await ctx.loader.loadAsync(sourceUrl)
  disposeObjectResources(ctx.modelRoot)
  ctx.modelRoot.clear()
  const model = loaded.clone(true)

  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false
      obj.receiveShadow = false
      const tint = new THREE.Color(modelOptions.colorHex)
      const buildMat = () =>
        new THREE.MeshStandardMaterial({
          color: tint,
          roughness: PREVIEW_SURFACE.roughness,
          metalness: PREVIEW_SURFACE.metalness,
        })
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose())
        obj.material = obj.material.map(() => buildMat())
      } else if (obj.material) {
        obj.material.dispose()
        obj.material = buildMat()
      }

      if (modelOptions.edgeMode !== 'none') {
        try {
          const edgeLines = createMeshEdgeOverlay(obj, {
            mode: modelOptions.edgeMode,
            colorHex: modelOptions.edgeColorHex,
            widthPx: modelOptions.edgeWidthPx,
            hardEdgeThresholdDeg: modelOptions.hardEdgeThresholdDeg,
          })
          if (edgeLines) obj.add(edgeLines)
          if (modelOptions.edgeMode === 'cad') {
            obj.add(createCadSilhouetteOverlay(obj, modelOptions.edgeColorHex))
          }
        } catch {
          // skip
        }
      }
    }
  })

  const rawBox = new THREE.Box3().setFromObject(model)
  const rawCenter = rawBox.getCenter(new THREE.Vector3())
  const rawSize = rawBox.getSize(new THREE.Vector3())
  const maxEdge = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1
  const targetMaxEdge = 140 * modelOptions.fillRatio
  const scale = targetMaxEdge / maxEdge

  model.scale.setScalar(scale)
  model.position.sub(rawCenter.multiplyScalar(scale))
  const appliedModelRotation: [number, number, number] = [
    BASE_MODEL_ROTATION_DEG[0] + modelOptions.modelRotationDeg[0],
    BASE_MODEL_ROTATION_DEG[1] + modelOptions.modelRotationDeg[1],
    BASE_MODEL_ROTATION_DEG[2] + modelOptions.modelRotationDeg[2],
  ]
  model.rotation.set(
    THREE.MathUtils.degToRad(appliedModelRotation[0]),
    THREE.MathUtils.degToRad(appliedModelRotation[1]),
    THREE.MathUtils.degToRad(appliedModelRotation[2])
  )

  const scaledBox = new THREE.Box3().setFromObject(model)
  model.position.y -= scaledBox.min.y

  const centeredBox = new THREE.Box3().setFromObject(model)
  const finalCenter = centeredBox.getCenter(new THREE.Vector3())
  model.position.x -= finalCenter.x
  model.position.z -= finalCenter.z

  ctx.modelRoot.add(model)
  applyCameraPose(ctx, cameraOptions)
}

export type ExportFormat = 'png' | 'jpeg' | 'webp'

export interface ExportOptions {
  width: number
  height: number
  format?: ExportFormat
  /** 0–1, only used for jpeg/webp. Default 0.85 */
  quality?: number
}

export async function exportImage(
  ctx: SceneContext,
  options: ExportOptions
): Promise<Blob> {
  const { width, height, format = 'png', quality = 0.85 } = options
  const canvas = ctx.renderer.domElement
  const prevW = canvas.width
  const prevH = canvas.height
  const prevAspect = ctx.camera.aspect
  const nextW = Math.max(64, Math.floor(width))
  const nextH = Math.max(64, Math.floor(height))
  canvas.width = nextW
  canvas.height = nextH
  ctx.renderer.setSize(nextW, nextH, false)
  ctx.camera.aspect = nextW / nextH
  ctx.camera.updateProjectionMatrix()
  updateEdgeLineResolution(ctx.modelRoot, ctx.renderer)
  ctx.renderer.render(ctx.scene, ctx.camera)

  const mimeType =
    format === 'jpeg'
      ? 'image/jpeg'
      : format === 'webp'
        ? 'image/webp'
        : 'image/png'
  const qualityArg = format === 'png' ? undefined : quality

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('图片生成失败'))
        else resolve(b)
      },
      mimeType,
      qualityArg
    )
  })

  canvas.width = prevW
  canvas.height = prevH
  ctx.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  ctx.camera.aspect = prevAspect
  ctx.camera.updateProjectionMatrix()
  ctx.renderer.render(ctx.scene, ctx.camera)

  return blob
}
