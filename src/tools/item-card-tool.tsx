import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import JSZip from "jszip"
import { saveAs } from "file-saver"
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js"

const DEFAULT_MODELS = [
  "models/items/B-2x1-H20-八小格.3mf",
  "models/items/B-2x1-H40-八小格.3mf",
  "models/items/B-2x1-H80-八小格.3mf",
]
const BASE_MODEL_ROTATION_DEG: [number, number, number] = [-90, 0, 0]
const BASE_POV_OFFSET_DEG: [number, number, number] = [-10, 0, 0]
const BASE_COMPOSITION_OFFSET_X = -0.06

function normalizePath(path: string) {
  return path.trim().replace(/^\//, "")
}

function toPngName(modelPath: string) {
  const name = modelPath.split("/").pop() ?? "item"
  return name.replace(/\.3mf$/i, ".png")
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
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
  const ihdrLen = (bytes[firstChunkOffset] << 24) |
    (bytes[firstChunkOffset + 1] << 16) |
    (bytes[firstChunkOffset + 2] << 8) |
    bytes[firstChunkOffset + 3]
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

interface RenderOptions {
  modelRotationDeg: [number, number, number]
  povRotationDeg: [number, number, number]
  fillRatio: number
  compositionOffsetX: number
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
    const height = canvas.clientHeight
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
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
      modelRoot.clear()
      renderer.dispose()
    },
  }
}

async function renderModelToScene(
  ctx: SceneContext,
  loader: ThreeMFLoader,
  modelPath: string,
  options: RenderOptions,
) {
  const base = import.meta.env.BASE_URL
  const url = `${base}${normalizePath(modelPath)}`
  const loaded = await loader.loadAsync(url)

  ctx.modelRoot.clear()
  const model = loaded.clone(true)

  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false
      obj.receiveShadow = false
    }
  })

  const rawBox = new THREE.Box3().setFromObject(model)
  const rawCenter = rawBox.getCenter(new THREE.Vector3())
  const rawSize = rawBox.getSize(new THREE.Vector3())
  const maxEdge = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1
  const targetMaxEdge = 140 * options.fillRatio
  const scale = targetMaxEdge / maxEdge

  model.scale.setScalar(scale)
  model.position.sub(rawCenter.multiplyScalar(scale))
  const appliedModelRotation: [number, number, number] = [
    BASE_MODEL_ROTATION_DEG[0] + options.modelRotationDeg[0],
    BASE_MODEL_ROTATION_DEG[1] + options.modelRotationDeg[1],
    BASE_MODEL_ROTATION_DEG[2] + options.modelRotationDeg[2],
  ]
  model.rotation.set(
    THREE.MathUtils.degToRad(appliedModelRotation[0]),
    THREE.MathUtils.degToRad(appliedModelRotation[1]),
    THREE.MathUtils.degToRad(appliedModelRotation[2]),
  )

  const scaledBox = new THREE.Box3().setFromObject(model)
  model.position.y -= scaledBox.min.y

  const centeredBox = new THREE.Box3().setFromObject(model)
  const finalSize = centeredBox.getSize(new THREE.Vector3())
  const finalCenter = centeredBox.getCenter(new THREE.Vector3())

  model.position.x -= finalCenter.x
  model.position.z -= finalCenter.z

  ctx.modelRoot.add(model)

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
  if (appliedCompositionOffsetX !== 0) {
    const dist = ctx.camera.position.distanceTo(lookAt)
    const halfH = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov * 0.5)) * dist
    const halfW = halfH * ctx.camera.aspect
    const right = new THREE.Vector3()
      .setFromMatrixColumn(ctx.camera.matrixWorld, 0)
      .normalize()
    lookAt.addScaledVector(right, appliedCompositionOffsetX * halfW)
    ctx.camera.lookAt(lookAt)
  }

  ctx.renderer.render(ctx.scene, ctx.camera)
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

  const [modelListText, setModelListText] = useState(DEFAULT_MODELS.join("\n"))
  const [activePath, setActivePath] = useState(DEFAULT_MODELS[0])
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
  const [compositionOffsetX, setCompositionOffsetX] = useState(0)

  const modelPaths = useMemo(
    () => modelListText.split("\n").map(normalizePath).filter(Boolean),
    [modelListText],
  )
  const renderOptions = useMemo<RenderOptions>(
    () => ({
      modelRotationDeg: [rotX, rotY, rotZ],
      povRotationDeg: [povX, povY, povZ],
      fillRatio,
      compositionOffsetX,
    }),
    [rotX, rotY, rotZ, povX, povY, povZ, fillRatio, compositionOffsetX],
  )
  const buildExportMetadata = useCallback((modelPath: string) => ({
    "kura.modelPath": normalizePath(modelPath),
    "kura.exportSize": `${Math.max(64, Math.floor(exportWidth))}x${Math.max(64, Math.floor(exportHeight))}`,
    "kura.rotationDeg": `${num2(rotX)},${num2(rotY)},${num2(rotZ)}`,
    "kura.modelBaseRotationDeg": `${BASE_MODEL_ROTATION_DEG[0]},${BASE_MODEL_ROTATION_DEG[1]},${BASE_MODEL_ROTATION_DEG[2]}`,
    "kura.modelAppliedRotationDeg": `${num2(BASE_MODEL_ROTATION_DEG[0] + rotX)},${num2(BASE_MODEL_ROTATION_DEG[1] + rotY)},${num2(BASE_MODEL_ROTATION_DEG[2] + rotZ)}`,
    "kura.povRotationDeg": `${num2(povX)},${num2(povY)},${num2(povZ)}`,
    "kura.povBaseOffsetDeg": `${BASE_POV_OFFSET_DEG[0]},${BASE_POV_OFFSET_DEG[1]},${BASE_POV_OFFSET_DEG[2]}`,
    "kura.povAppliedDeg": `${num2(BASE_POV_OFFSET_DEG[0] + povX)},${num2(BASE_POV_OFFSET_DEG[1] + povY)},${num2(BASE_POV_OFFSET_DEG[2] + povZ)}`,
    "kura.compositionOffsetX": String(num2(compositionOffsetX)),
    "kura.compositionBaseOffsetX": String(BASE_COMPOSITION_OFFSET_X),
    "kura.compositionAppliedOffsetX": String(num2(BASE_COMPOSITION_OFFSET_X + compositionOffsetX)),
    "kura.fillRatio": String(num2(fillRatio)),
    "kura.exportedAt": new Date().toISOString(),
  }), [compositionOffsetX, exportHeight, exportWidth, fillRatio, povX, povY, povZ, rotX, rotY, rotZ])

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

  const renderOne = useCallback(async (path: string) => {
    const scene = sceneRef.current
    const loader = loaderRef.current
    if (!scene || !loader || !canvasRef.current) return
    setStatus(`渲染中：${path}`)
    await renderModelToScene(scene, loader, path, renderOptions)
    setStatus(`已渲染：${path}`)
  }, [renderOptions])

  useEffect(() => {
    if (!activePath) return
    renderOne(activePath).catch((e) => {
      setStatus(`渲染失败：${String(e)}`)
    })
  }, [activePath, renderOne])

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
    if (!canvasRef.current || !activePath) return
    setBusy(true)
    try {
      const blob = await withExportSize(async () => {
        await renderOne(activePath)
        const raw = await canvasToBlob(canvasRef.current!)
        return embedPngTextMetadata(raw, buildExportMetadata(activePath))
      })
      if (!blob) throw new Error("PNG 生成失败")
      saveAs(blob, toPngName(activePath))
      setStatus(`已导出：${toPngName(activePath)}（${exportWidth}x${exportHeight}）`)
    } catch (e) {
      setStatus(`导出失败：${String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [activePath, exportHeight, exportWidth, renderOne, withExportSize])

  const handleDownloadZip = useCallback(async () => {
    if (!canvasRef.current || modelPaths.length === 0) return
    setBusy(true)
    const zip = new JSZip()
    try {
      await withExportSize(async () => {
        for (const path of modelPaths) {
          await renderOne(path)
          const raw = await canvasToBlob(canvasRef.current!)
          const blob = await embedPngTextMetadata(raw, buildExportMetadata(path))
          zip.file(toPngName(path), blob)
        }
        return true
      })
      const out = await zip.generateAsync({ type: "blob" })
      saveAs(out, "item-card-images.zip")
      setStatus(`已批量导出：${modelPaths.length} 张（${exportWidth}x${exportHeight}）`)
    } catch (e) {
      setStatus(`批量导出失败：${String(e)}`)
    } finally {
      setBusy(false)
      if (activePath) {
        renderOne(activePath).catch(() => {})
      }
    }
  }, [activePath, buildExportMetadata, exportHeight, exportWidth, modelPaths, renderOne, withExportSize])

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <div className="mx-auto flex max-w-[1200px] gap-4 p-4">
        <div className="w-[340px] shrink-0 rounded-xl border border-white/15 bg-white/5 p-4">
          <h1 className="text-lg font-semibold">3MF Item Card 出图工具</h1>
          <p className="mt-1 text-xs text-white/70">
            视角固定为左前斜上（适合卡片图），PNG 透明背景。
          </p>

          <label className="mt-4 block text-xs text-white/80">模型路径（每行一个，相对 public）</label>
          <textarea
            value={modelListText}
            onChange={(e) => setModelListText(e.target.value)}
            className="mt-1 h-40 w-full resize-y rounded-md border border-white/20 bg-black/35 p-2 text-xs outline-none focus:border-white/40"
          />

          <label className="mt-3 block text-xs text-white/80">当前预览</label>
          <select
            value={activePath}
            onChange={(e) => setActivePath(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
          >
            {modelPaths.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

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

          <label className="mt-3 block text-xs text-white/80">
            模型占比（{fillRatio.toFixed(2)}x）
          </label>
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={fillRatio}
            onChange={(e) => setFillRatio(Number(e.target.value))}
            className="mt-1 w-full"
          />

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy || !activePath}
              onClick={handleDownloadCurrent}
              className="rounded-md bg-white px-3 py-2 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              导出当前 PNG
            </button>
            <button
              type="button"
              disabled={busy || modelPaths.length === 0}
              onClick={handleDownloadZip}
              className="rounded-md border border-white/35 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              批量导出 ZIP
            </button>
          </div>

          <p className="mt-3 text-xs text-white/70">{status}</p>
        </div>

        <div className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#1b1b1b] p-3">
          <div className="h-[720px] overflow-hidden rounded-lg bg-[linear-gradient(45deg,#242424_25%,transparent_25%),linear-gradient(-45deg,#242424_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#242424_75%),linear-gradient(-45deg,transparent_75%,#242424_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
            <canvas ref={canvasRef} className="h-full w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

