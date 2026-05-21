import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import JSZip from "jszip"
import { saveAs } from "file-saver"
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js"
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { METADATA_PREFIX } from "@/config/brand"

interface ModelEntry {
  id: string
  source: string | File
  displayName: string
}

function makeDefaultEntries(): ModelEntry[] {
  const paths = [
    "models/items/B-2x1-H20-八小格.3mf",
    "models/items/B-2x1-H40-八小格.3mf",
    "models/items/B-2x1-H80-八小格.3mf",
  ]
  return paths.map((p, i) => ({
    id: `default-${i}`,
    source: p,
    displayName: p.split("/").pop()?.replace(/\.3mf$/i, "") ?? `item-${i}`,
  }))
}
const BASE_MODEL_ROTATION_DEG: [number, number, number] = [-90, 0, 0]
const BASE_POV_OFFSET_DEG: [number, number, number] = [-10, 0, 0]
const BASE_COMPOSITION_OFFSET_X = -0.06
const BASE_COMPOSITION_OFFSET_Y = 0

function normalizePath(path: string) {
  return path.trim().replace(/^\//, "")
}

function toPngName(entry: ModelEntry) {
  return `${entry.displayName}.png`
}

function sourceLabel(entry: ModelEntry) {
  return typeof entry.source === "string"
    ? entry.source
    : entry.source.name
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] ?? 0
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u32be(n: number) {
  return new Uint8Array([
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ])
}

function encodeAscii(text: string) {
  return new TextEncoder().encode(text)
}

function makeTextChunk(keyword: string, text: string): Uint8Array {
  const type = encodeAscii("tEXt")
  const data = encodeAscii(`${keyword}\u0000${text}`)
  const length = u32be(data.length)
  const crcInput = new Uint8Array(type.length + data.length)
  crcInput.set(type, 0)
  crcInput.set(data, type.length)
  const crc = u32be(crc32(crcInput))

  const out = new Uint8Array(4 + 4 + data.length + 4)
  out.set(length, 0)
  out.set(type, 4)
  out.set(data, 8)
  out.set(crc, 8 + data.length)
  return out
}

async function embedPngTextMetadata(blob: Blob, records: Record<string, string>): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.length < 8) return blob
  const pngSig = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== pngSig[i]) return blob
  }

  const firstChunkOffset = 8
  if (firstChunkOffset + 8 > bytes.length) return blob
  const ihdrLen = ((bytes[firstChunkOffset] ?? 0) << 24) |
    ((bytes[firstChunkOffset + 1] ?? 0) << 16) |
    ((bytes[firstChunkOffset + 2] ?? 0) << 8) |
    (bytes[firstChunkOffset + 3] ?? 0)
  const ihdrTotal = 12 + ihdrLen
  const insertPos = firstChunkOffset + ihdrTotal
  if (insertPos > bytes.length) return blob

  const chunks = Object.entries(records).map(([k, v]) => makeTextChunk(k.slice(0, 79), v))
  const totalExtra = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(bytes.length + totalExtra)
  out.set(bytes.slice(0, insertPos), 0)
  let outPos = insertPos
  for (const c of chunks) {
    out.set(c, outPos)
    outPos += c.length
  }
  out.set(bytes.slice(insertPos), outPos)
  return new Blob([out], { type: "image/png" })
}

function num2(v: number) {
  return Number(v.toFixed(2))
}

interface SceneContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  modelRoot: THREE.Group
  dispose: () => void
}

interface ModelRenderOptions {
  modelRotationDeg: [number, number, number]
  fillRatio: number
  colorHex: string
  edgeEnabled: boolean
  edgeColorHex: string
  edgeWidthPx: number
}

interface CameraRenderOptions {
  povRotationDeg: [number, number, number]
  compositionOffsetX: number
  compositionOffsetY: number
}

function disposeObjectResources(root: THREE.Object3D) {
  root.traverse((obj) => {
    const disposable = obj as THREE.Object3D & {
      geometry?: { dispose?: () => void }
      material?: THREE.Material | THREE.Material[]
    }
    disposable.geometry?.dispose?.()
    if (Array.isArray(disposable.material)) {
      disposable.material.forEach((m) => m.dispose())
    } else {
      disposable.material?.dispose()
    }
  })
}

function updateEdgeLineResolution(root: THREE.Object3D, renderer: THREE.WebGLRenderer) {
  const size = new THREE.Vector2()
  renderer.getSize(size)
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || size.x <= 0 || size.y <= 0) {
    return
  }
  root.traverse((obj) => {
    const material = (obj as THREE.Object3D & { material?: unknown }).material
    if (!material) return
    if (material instanceof LineMaterial) {
      material.resolution.set(size.x, size.y)
      return
    }
    if (Array.isArray(material)) {
      material.forEach((m) => {
        if (m instanceof LineMaterial) m.resolution.set(size.x, size.y)
      })
    }
  })
}

function collectMeshes(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) out.push(obj)
  })
  return out
}

function normalizeHexColor(input: string): string | null {
  const value = input.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase()
  return null
}

function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(28, canvas.clientWidth / canvas.clientHeight, 1, 5000)
  const modelRoot = new THREE.Group()
  scene.add(modelRoot)

  scene.add(new THREE.AmbientLight(0xffffff, 0.95))
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8)
  keyLight.position.set(-220, 340, 260)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.45)
  fillLight.position.set(180, 220, -120)
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
  window.addEventListener("resize", resize)

  return {
    renderer,
    scene,
    camera,
    modelRoot,
    dispose: () => {
      window.removeEventListener("resize", resize)
      disposeObjectResources(modelRoot)
      modelRoot.clear()
      renderer.dispose()
    },
  }
}

function applyCameraPose(
  ctx: SceneContext,
  options: CameraRenderOptions,
) {
  if (ctx.modelRoot.children.length === 0) return
  const centeredBox = new THREE.Box3().setFromObject(ctx.modelRoot)
  const finalSize = centeredBox.getSize(new THREE.Vector3())
  // Keep camera distance fixed so fillRatio truly changes on-screen size.
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
    "XYZ",
  )
  const direction = baseDirection.applyEuler(povEuler).normalize()
  ctx.camera.position.copy(direction.multiplyScalar(cameraDistance))
  ctx.camera.lookAt(lookAt)

  // Auto-correct horizontal framing so model doesn't appear left-biased.
  for (let i = 0; i < 3; i++) {
    ctx.camera.updateMatrixWorld(true)
    const projected = framingTarget.clone().project(ctx.camera)
    if (Math.abs(projected.x) < 0.002) break
    const dist = ctx.camera.position.distanceTo(lookAt)
    const halfH = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov * 0.5)) * dist
    const halfW = halfH * ctx.camera.aspect
    const right = new THREE.Vector3()
      .setFromMatrixColumn(ctx.camera.matrixWorld, 0)
      .normalize()
    lookAt.addScaledVector(right, projected.x * halfW)
    ctx.camera.lookAt(lookAt)
  }

  // User composition tweak after auto-centering.
  const appliedCompositionOffsetX = BASE_COMPOSITION_OFFSET_X + options.compositionOffsetX
  const appliedCompositionOffsetY = BASE_COMPOSITION_OFFSET_Y + options.compositionOffsetY
  if (appliedCompositionOffsetX !== 0 || appliedCompositionOffsetY !== 0) {
    const dist = ctx.camera.position.distanceTo(lookAt)
    const halfH = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov * 0.5)) * dist
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

async function renderModelToScene(
  ctx: SceneContext,
  loader: ThreeMFLoader,
  source: string | File,
  modelOptions: ModelRenderOptions,
  cameraOptions: CameraRenderOptions,
) {
  let loaded: THREE.Group
  if (typeof source === "string") {
    const base = import.meta.env.BASE_URL
    const url = `${base}${normalizePath(source)}`
    loaded = await loader.loadAsync(url)
  } else {
    const buffer = await source.arrayBuffer()
    loaded = loader.parse(buffer)
  }

  disposeObjectResources(ctx.modelRoot)
  ctx.modelRoot.clear()
  const model = loaded.clone(true)

  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false
      obj.receiveShadow = false
      const tint = new THREE.Color(modelOptions.colorHex)
      const applyTint = (material: THREE.Material): THREE.Material => {
        const cloned = material.clone()
        const materialWithColor = cloned as THREE.Material & {
          color?: THREE.Color
          vertexColors?: boolean
          map?: THREE.Texture | null
          toneMapped?: boolean
        }
        if (materialWithColor.color instanceof THREE.Color) {
          materialWithColor.color.copy(tint)
          materialWithColor.needsUpdate = true
        }
        if (typeof materialWithColor.vertexColors === "boolean") {
          materialWithColor.vertexColors = false
          materialWithColor.needsUpdate = true
        }
        if ("map" in materialWithColor && materialWithColor.map) {
          materialWithColor.map = null
          materialWithColor.needsUpdate = true
        }
        return cloned
      }
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(applyTint)
      } else if (obj.material) {
        obj.material = applyTint(obj.material)
      }

      if (modelOptions.edgeEnabled) {
        try {
          const merged = mergeVertices(obj.geometry.clone(), 1e-4)
          const hardEdges = new THREE.EdgesGeometry(merged, 68)
          merged.dispose()
          const positions = hardEdges.attributes.position
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
          if (valid && raw) {
            const edgeGeometry = new LineSegmentsGeometry().setPositions(
              new Float32Array(raw as ArrayLike<number>),
            )
            const edgeMaterial = new LineMaterial({
              color: new THREE.Color(modelOptions.edgeColorHex),
              linewidth: THREE.MathUtils.clamp(modelOptions.edgeWidthPx, 0.5, 6),
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
            obj.add(edgeLines)
          }
          hardEdges.dispose()
        } catch {
          // Skip problematic mesh edge generation to avoid breaking whole render.
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
    THREE.MathUtils.degToRad(appliedModelRotation[2]),
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

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("PNG 生成失败"))
      else resolve(blob)
    }, "image/png")
  })
}

export default function ItemCardTool() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<SceneContext | null>(null)
  const loaderRef = useRef<ThreeMFLoader | null>(null)
  const dragStateRef = useRef<{
    active: boolean
    pointerId: number | null
    startX: number
    startY: number
    startPovX: number
    startPovY: number
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPovX: 0,
    startPovY: 0,
  })

  const [entries, setEntries] = useState<ModelEntry[]>(makeDefaultEntries)
  const [activeId, setActiveId] = useState(entries[0]?.id ?? "")
  const [status, setStatus] = useState("就绪")
  const [busy, setBusy] = useState(false)
  const [exportWidth, setExportWidth] = useState(1024)
  const [exportHeight, setExportHeight] = useState(1024)
  const [rotX, setRotX] = useState(0)
  const [rotY, setRotY] = useState(0)
  const [rotZ, setRotZ] = useState(0)
  const [povX, setPovX] = useState(0)
  const [povY, setPovY] = useState(0)
  const [povZ, setPovZ] = useState(0)
  const [fillRatio, setFillRatio] = useState(1)
  const [modelColorHex, setModelColorHex] = useState("#FFFFFF")
  const [modelColorInput, setModelColorInput] = useState("#FFFFFF")
  const [edgeEnabled, setEdgeEnabled] = useState(true)
  const [edgeColorHex, setEdgeColorHex] = useState("#0F172A")
  const [edgeColorInput, setEdgeColorInput] = useState("#0F172A")
  const [edgeWidthPx, setEdgeWidthPx] = useState(1.8)
  const [compositionOffsetX, setCompositionOffsetX] = useState(0)
  const [compositionOffsetY, setCompositionOffsetY] = useState(0)

  const activeEntry = useMemo(() => entries.find((e) => e.id === activeId), [entries, activeId])
  const modelRenderOptions = useMemo<ModelRenderOptions>(
    () => ({
      modelRotationDeg: [rotX, rotY, rotZ],
      fillRatio,
      colorHex: modelColorHex,
      edgeEnabled,
      edgeColorHex,
      edgeWidthPx,
    }),
    [rotX, rotY, rotZ, fillRatio, modelColorHex, edgeEnabled, edgeColorHex, edgeWidthPx],
  )
  const cameraRenderOptions = useMemo<CameraRenderOptions>(
    () => ({
      povRotationDeg: [povX, povY, povZ],
      compositionOffsetX,
      compositionOffsetY,
    }),
    [povX, povY, povZ, compositionOffsetX, compositionOffsetY],
  )
  const buildExportMetadata = useCallback((entry: ModelEntry) => ({
    [`${METADATA_PREFIX}.modelPath`]: typeof entry.source === "string" ? normalizePath(entry.source) : entry.source.name,
    [`${METADATA_PREFIX}.displayName`]: entry.displayName,
    [`${METADATA_PREFIX}.exportSize`]: `${Math.max(64, Math.floor(exportWidth))}x${Math.max(64, Math.floor(exportHeight))}`,
    [`${METADATA_PREFIX}.rotationDeg`]: `${num2(rotX)},${num2(rotY)},${num2(rotZ)}`,
    [`${METADATA_PREFIX}.modelBaseRotationDeg`]: `${BASE_MODEL_ROTATION_DEG[0]},${BASE_MODEL_ROTATION_DEG[1]},${BASE_MODEL_ROTATION_DEG[2]}`,
    [`${METADATA_PREFIX}.modelAppliedRotationDeg`]: `${num2(BASE_MODEL_ROTATION_DEG[0] + rotX)},${num2(BASE_MODEL_ROTATION_DEG[1] + rotY)},${num2(BASE_MODEL_ROTATION_DEG[2] + rotZ)}`,
    [`${METADATA_PREFIX}.povRotationDeg`]: `${num2(povX)},${num2(povY)},${num2(povZ)}`,
    [`${METADATA_PREFIX}.povBaseOffsetDeg`]: `${BASE_POV_OFFSET_DEG[0]},${BASE_POV_OFFSET_DEG[1]},${BASE_POV_OFFSET_DEG[2]}`,
    [`${METADATA_PREFIX}.povAppliedDeg`]: `${num2(BASE_POV_OFFSET_DEG[0] + povX)},${num2(BASE_POV_OFFSET_DEG[1] + povY)},${num2(BASE_POV_OFFSET_DEG[2] + povZ)}`,
    [`${METADATA_PREFIX}.compositionOffsetX`]: String(num2(compositionOffsetX)),
    [`${METADATA_PREFIX}.compositionBaseOffsetX`]: String(BASE_COMPOSITION_OFFSET_X),
    [`${METADATA_PREFIX}.compositionAppliedOffsetX`]: String(num2(BASE_COMPOSITION_OFFSET_X + compositionOffsetX)),
    [`${METADATA_PREFIX}.compositionOffsetY`]: String(num2(compositionOffsetY)),
    [`${METADATA_PREFIX}.compositionBaseOffsetY`]: String(BASE_COMPOSITION_OFFSET_Y),
    [`${METADATA_PREFIX}.compositionAppliedOffsetY`]: String(num2(BASE_COMPOSITION_OFFSET_Y + compositionOffsetY)),
    [`${METADATA_PREFIX}.fillRatio`]: String(num2(fillRatio)),
    [`${METADATA_PREFIX}.modelColorHex`]: modelColorHex,
    [`${METADATA_PREFIX}.edgeEnabled`]: String(edgeEnabled),
    [`${METADATA_PREFIX}.edgeColorHex`]: edgeColorHex,
    [`${METADATA_PREFIX}.edgeWidthPx`]: String(num2(edgeWidthPx)),
    [`${METADATA_PREFIX}.exportedAt`]: new Date().toISOString(),
  }), [compositionOffsetX, compositionOffsetY, edgeColorHex, edgeEnabled, edgeWidthPx, exportHeight, exportWidth, fillRatio, modelColorHex, povX, povY, povZ, rotX, rotY, rotZ])

  useEffect(() => {
    if (!canvasRef.current) return
    sceneRef.current = createScene(canvasRef.current)
    loaderRef.current = new ThreeMFLoader()
    return () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
      loaderRef.current = null
    }
  }, [])

  const renderOne = useCallback(async (entry: ModelEntry) => {
    const scene = sceneRef.current
    const loader = loaderRef.current
    if (!scene || !loader || !canvasRef.current) return
    const label = sourceLabel(entry)
    setStatus(`渲染中：${label}`)
    await renderModelToScene(scene, loader, entry.source, modelRenderOptions, cameraRenderOptions)
    setStatus(`已渲染：${label}`)
  }, [cameraRenderOptions, modelRenderOptions])

  useEffect(() => {
    if (!activeEntry) return
    renderOne(activeEntry).catch((e) => {
      setStatus(`渲染失败：${String(e)}`)
    })
  }, [activeEntry, renderOne])

  useEffect(() => {
    if (!sceneRef.current) return
    applyCameraPose(sceneRef.current, cameraRenderOptions)
  }, [cameraRenderOptions])

  const withExportSize = useCallback(async <T,>(run: () => Promise<T>): Promise<T | undefined> => {
    const scene = sceneRef.current
    if (!scene || !canvasRef.current) return
    const canvas = canvasRef.current
    const prevW = canvas.width
    const prevH = canvas.height
    const prevAspect = scene.camera.aspect
    const nextW = Math.max(64, Math.floor(exportWidth))
    const nextH = Math.max(64, Math.floor(exportHeight))
    canvas.width = nextW
    canvas.height = nextH
    scene.renderer.setSize(nextW, nextH, false)
    scene.camera.aspect = nextW / nextH
    scene.camera.updateProjectionMatrix()

    try {
      return await run()
    } finally {
      canvas.width = prevW
      canvas.height = prevH
      scene.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
      scene.camera.aspect = prevAspect
      scene.camera.updateProjectionMatrix()
      scene.renderer.render(scene.scene, scene.camera)
    }
  }, [exportHeight, exportWidth])

  const handleDownloadCurrent = useCallback(async () => {
    if (!canvasRef.current || !activeEntry) return
    setBusy(true)
    try {
      const blob = await withExportSize(async () => {
        await renderOne(activeEntry)
        const raw = await canvasToBlob(canvasRef.current!)
        return embedPngTextMetadata(raw, buildExportMetadata(activeEntry))
      })
      if (!blob) throw new Error("PNG 生成失败")
      const pngName = toPngName(activeEntry)
      saveAs(blob, pngName)
      setStatus(`已导出：${pngName}（${exportWidth}x${exportHeight}）`)
    } catch (e) {
      setStatus(`导出失败：${String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [activeEntry, buildExportMetadata, exportHeight, exportWidth, renderOne, withExportSize])

  const handleDownloadZip = useCallback(async () => {
    if (!canvasRef.current || entries.length === 0) return
    setBusy(true)
    const zip = new JSZip()
    try {
      await withExportSize(async () => {
        for (const entry of entries) {
          await renderOne(entry)
          const raw = await canvasToBlob(canvasRef.current!)
          const blob = await embedPngTextMetadata(raw, buildExportMetadata(entry))
          zip.file(toPngName(entry), blob)
        }
        return true
      })
      const out = await zip.generateAsync({ type: "blob" })
      saveAs(out, "item-card-images.zip")
      setStatus(`已批量导出：${entries.length} 张（${exportWidth}x${exportHeight}）`)
    } catch (e) {
      setStatus(`批量导出失败：${String(e)}`)
    } finally {
      setBusy(false)
      if (activeEntry) {
        renderOne(activeEntry).catch(() => {})
      }
    }
  }, [activeEntry, buildExportMetadata, entries, exportHeight, exportWidth, renderOne, withExportSize])

  const handleOpenFolder = useCallback(async () => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.accept = ".3mf"
    input.webkitdirectory = true
    input.onchange = () => {
      const files = Array.from(input.files ?? []).filter((f) =>
        f.name.toLowerCase().endsWith(".3mf"),
      )
      if (files.length === 0) return
      const newEntries: ModelEntry[] = files.map((f, i) => ({
        id: `local-${Date.now()}-${i}`,
        source: f,
        displayName: f.name.replace(/\.3mf$/i, ""),
      }))
      setEntries(newEntries)
      if (newEntries[0]) {
        setActiveId(newEntries[0].id)
      }
      setStatus(`已加载 ${newEntries.length} 个文件`)
    }
    input.click()
  }, [])

  const handleAddFiles = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.accept = ".3mf"
    input.onchange = () => {
      const files = Array.from(input.files ?? []).filter((f) =>
        f.name.toLowerCase().endsWith(".3mf"),
      )
      if (files.length === 0) return
      const newEntries: ModelEntry[] = files.map((f, i) => ({
        id: `local-${Date.now()}-${i}`,
        source: f,
        displayName: f.name.replace(/\.3mf$/i, ""),
      }))
      setEntries((prev) => [...prev, ...newEntries])
      setStatus(`已添加 ${newEntries.length} 个文件`)
    }
    input.click()
  }, [])

  const handleRemoveEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id)
      if (activeId === id && next[0]) {
        setActiveId(next[0].id)
      }
      return next
    })
  }, [activeId])

  const handleRenameEntry = useCallback((id: string, newName: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, displayName: newName } : e)),
    )
  }, [])

  const handleSaveRenamed = useCallback(async (entry: ModelEntry) => {
    try {
      let blob: Blob
      if (typeof entry.source === "string") {
        const base = import.meta.env.BASE_URL
        const url = `${base}${normalizePath(entry.source)}`
        const res = await fetch(url)
        blob = await res.blob()
      } else {
        blob = entry.source
      }
      saveAs(blob, `${entry.displayName}.3mf`)
      setStatus(`已保存：${entry.displayName}.3mf`)
    } catch (e) {
      setStatus(`保存失败：${String(e)}`)
    }
  }, [])

  const handleSaveAllRenamed = useCallback(async () => {
    setBusy(true)
    const zip = new JSZip()
    try {
      for (const entry of entries) {
        let blob: Blob
        if (typeof entry.source === "string") {
          const base = import.meta.env.BASE_URL
          const url = `${base}${normalizePath(entry.source)}`
          const res = await fetch(url)
          blob = await res.blob()
        } else {
          blob = entry.source
        }
        zip.file(`${entry.displayName}.3mf`, blob)
      }
      const out = await zip.generateAsync({ type: "blob" })
      saveAs(out, "renamed-models.zip")
      setStatus(`已批量保存 ${entries.length} 个重命名模型`)
    } catch (e) {
      setStatus(`批量保存失败：${String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [entries])

  const handleModelColorBlur = useCallback(() => {
    const normalized = normalizeHexColor(modelColorInput)
    if (!normalized) {
      setModelColorInput(modelColorHex)
      return
    }
    setModelColorHex(normalized)
    if (modelColorInput !== normalized) setModelColorInput(normalized)
  }, [modelColorHex, modelColorInput])

  const handleEdgeColorBlur = useCallback(() => {
    const normalized = normalizeHexColor(edgeColorInput)
    if (!normalized) {
      setEdgeColorInput(edgeColorHex)
      return
    }
    setEdgeColorHex(normalized)
    if (edgeColorInput !== normalized) setEdgeColorInput(normalized)
  }, [edgeColorHex, edgeColorInput])

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPovX: povX,
      startPovY: povY,
    }
    canvas.setPointerCapture(e.pointerId)
  }, [povX, povY])

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = dragStateRef.current
    if (!state.active || state.pointerId !== e.pointerId) return
    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY
    const sensitivity = 0.18
    setPovY(num2(state.startPovY - dx * sensitivity))
    setPovX(num2(state.startPovX + dy * sensitivity))
  }, [])

  const handleCanvasPointerEnd = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = dragStateRef.current
    if (!state.active) return
    if (state.pointerId === e.pointerId) {
      const canvas = canvasRef.current
      if (canvas?.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId)
      }
      dragStateRef.current.active = false
      dragStateRef.current.pointerId = null
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <div className="mx-auto flex max-w-[1200px] gap-4 p-4">
        <div className="w-[380px] shrink-0 rounded-xl border border-white/15 bg-white/5 p-4">
          <h1 className="text-lg font-semibold">3MF Item Card 出图工具</h1>
          <p className="mt-1 text-xs text-white/70">
            视角固定为左前斜上（适合卡片图），PNG 透明背景。
          </p>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-white/80">模型列表</span>
            <button
              type="button"
              onClick={handleOpenFolder}
              className="rounded-md border border-white/25 px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
            >
              打开文件夹
            </button>
            <button
              type="button"
              onClick={handleAddFiles}
              className="rounded-md border border-white/25 px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
            >
              添加文件
            </button>
          </div>

          <div className="mt-2 max-h-[240px] overflow-y-auto rounded-md border border-white/15 bg-black/30">
            {entries.length === 0 ? (
              <p className="p-3 text-center text-xs text-white/40">暂无模型，请打开文件夹或添加文件</p>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => setActiveId(entry.id)}
                  className={`flex cursor-pointer items-center gap-2 border-b border-white/8 px-2 py-1.5 last:border-b-0 ${
                    activeId === entry.id ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span className="shrink-0 text-[10px] text-white/30">
                    {activeId === entry.id ? "●" : "○"}
                  </span>
                  <input
                    type="text"
                    value={entry.displayName}
                    onChange={(e) => handleRenameEntry(entry.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 bg-transparent text-xs outline-none focus:underline focus:decoration-white/40"
                    title={sourceLabel(entry)}
                  />
                  <button
                    type="button"
                    className="shrink-0 text-[10px] text-white/30 hover:text-blue-400"
                    onClick={(e) => { e.stopPropagation(); handleSaveRenamed(entry) }}
                    title="下载重命名文件"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-[10px] text-white/30 hover:text-red-400"
                    onClick={(e) => { e.stopPropagation(); handleRemoveEntry(entry.id) }}
                    title="移除"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
          {entries.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={handleSaveAllRenamed}
              className="mt-2 w-full rounded-md border border-white/25 px-3 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              批量下载重命名模型（ZIP）
            </button>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-white/80">
              导出宽度
              <input
                type="number"
                min={64}
                value={exportWidth}
                onChange={(e) => setExportWidth(Number(e.target.value) || 1024)}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
              />
            </label>
            <label className="text-xs text-white/80">
              导出高度
              <input
                type="number"
                min={64}
                value={exportHeight}
                onChange={(e) => setExportHeight(Number(e.target.value) || 1024)}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
              />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="text-xs text-white/80">
              旋转 X
              <input
                type="number"
                step={0.1}
                value={rotX}
                onChange={(e) => setRotX(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
              />
            </label>
            <label className="text-xs text-white/80">
              旋转 Y
              <input
                type="number"
                step={0.1}
                value={rotY}
                onChange={(e) => setRotY(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
              />
            </label>
            <label className="text-xs text-white/80">
              旋转 Z
              <input
                type="number"
                step={0.1}
                value={rotZ}
                onChange={(e) => setRotZ(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
              />
            </label>
          </div>

          <div className="mt-3 text-xs text-white/80">POV 视角微调（相机）</div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <label className="text-xs text-white/80">
              POV X
              <input
                type="number"
                step={0.1}
                value={povX}
                onChange={(e) => setPovX(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
              />
            </label>
            <label className="text-xs text-white/80">
              POV Y
              <input
                type="number"
                step={0.1}
                value={povY}
                onChange={(e) => setPovY(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
              />
            </label>
            <label className="text-xs text-white/80">
              POV Z
              <input
                type="number"
                step={0.1}
                value={povZ}
                onChange={(e) => setPovZ(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
              />
            </label>
          </div>

          <label className="mt-3 block text-xs text-white/80">
            构图偏移 X（-1 ~ 1，默认 0）
            <input
              type="number"
              step={0.1}
              value={compositionOffsetX}
              onChange={(e) => setCompositionOffsetX(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
            />
          </label>
          <label className="mt-2 block text-xs text-white/80">
            构图偏移 Y（-1 ~ 1，默认 0）
            <input
              type="number"
              step={0.1}
              value={compositionOffsetY}
              onChange={(e) => setCompositionOffsetY(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
            />
          </label>

          <label className="mt-3 block text-xs text-white/80">
            模型占比（{fillRatio.toFixed(2)}x）
          </label>
          <input
            type="range"
            min={0.4}
            max={1.6}
            step={0.05}
            value={fillRatio}
            onChange={(e) => setFillRatio(Number(e.target.value))}
            className="mt-1 w-full"
          />

          <label className="mt-3 block text-xs text-white/80">
            模型颜色（HEX）
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={modelColorInput}
                onChange={(e) => setModelColorInput(e.target.value)}
                onBlur={handleModelColorBlur}
                placeholder="#FFFFFF"
                className="w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs uppercase outline-none focus:border-white/40"
              />
              <input
                type="color"
                value={modelColorHex}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase()
                  setModelColorHex(next)
                  setModelColorInput(next)
                }}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-white/20 bg-black/35 p-1"
                title="颜色选择"
              />
            </div>
          </label>

          <label className="mt-3 flex items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={edgeEnabled}
              onChange={(e) => setEdgeEnabled(e.target.checked)}
            />
            渲染边线
          </label>
          <label className="mt-2 block text-xs text-white/80">
            边线颜色（HEX）
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={edgeColorInput}
                onChange={(e) => setEdgeColorInput(e.target.value)}
                onBlur={handleEdgeColorBlur}
                placeholder="#0F172A"
                className="w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs uppercase outline-none focus:border-white/40"
              />
              <input
                type="color"
                value={edgeColorHex}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase()
                  setEdgeColorHex(next)
                  setEdgeColorInput(next)
                }}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-white/20 bg-black/35 p-1"
                title="边线颜色"
              />
            </div>
          </label>
          <label className="mt-2 block text-xs text-white/80">
            边线粗细（{edgeWidthPx.toFixed(1)} px）
          </label>
          <input
            type="range"
            min={0.5}
            max={6}
            step={0.1}
            value={edgeWidthPx}
            onChange={(e) => setEdgeWidthPx(Number(e.target.value))}
            className="mt-1 w-full"
          />

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy || !activeEntry}
              onClick={handleDownloadCurrent}
              className="rounded-md bg-white px-3 py-2 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              导出当前 PNG
            </button>
            <button
              type="button"
              disabled={busy || entries.length === 0}
              onClick={handleDownloadZip}
              className="rounded-md border border-white/35 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              批量导出 ZIP
            </button>
          </div>

          <p className="mt-3 text-xs text-white/70">{status}</p>
        </div>

        <div className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#1b1b1b] p-3">
          <p className="mb-2 text-xs text-white/65">
            预览区拖动可旋转视角（左右=POV Y，上下=POV X），左侧数值会实时回填。
          </p>
          <div className="h-[720px] overflow-hidden rounded-lg bg-[linear-gradient(45deg,#242424_25%,transparent_25%),linear-gradient(-45deg,#242424_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#242424_75%),linear-gradient(-45deg,transparent_75%,#242424_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
            <canvas
              ref={canvasRef}
              className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerEnd}
              onPointerCancel={handleCanvasPointerEnd}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

