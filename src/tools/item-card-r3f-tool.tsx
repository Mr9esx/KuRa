import { useEffect, useMemo, useState } from "react"
import { Canvas, useLoader, useThree } from "@react-three/fiber"
import { Edges, OrbitControls, Outlines } from "@react-three/drei"
import * as THREE from "three"
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js"

interface ModelEntry {
  id: string
  modelPath: string
  displayName: string
}

type EdgeRenderMode = "none" | "hardEdges" | "wireframe" | "cad"
type EdgePresetId = "productOutline" | "structure" | "technical" | "custom"
type LightPresetId = "balanced" | "highContrast" | "softFill" | "custom"

interface EdgePreset {
  label: string
  mode: EdgeRenderMode
  colorHex: string
  widthPx: number
  hardEdgeThresholdDeg: number
}

interface LightSetup {
  ambient: number
  key: number
  fill: number
}

const BASE_MODEL_ROTATION_DEG: [number, number, number] = [-90, 0, 0]
const DEFAULT_POV: [number, number, number] = [-190, 170, 220]
const DEFAULT_TARGET: [number, number, number] = [0, 55, 0]

const DEFAULT_MODELS: ModelEntry[] = [
  { id: "default-0", modelPath: "models/items/f/F-2x1-H20-八小格.3mf", displayName: "F-2x1-H20-八小格" },
  { id: "default-1", modelPath: "models/items/f/F-2x1-H40-八小格.3mf", displayName: "F-2x1-H40-八小格" },
  { id: "default-2", modelPath: "models/items/f/F-2x1-H80-八小格.3mf", displayName: "F-2x1-H80-八小格" },
]

const EDGE_PRESETS: Record<Exclude<EdgePresetId, "custom">, EdgePreset> = {
  productOutline: {
    label: "产品轮廓",
    mode: "hardEdges",
    colorHex: "#0F172A",
    widthPx: 1.8,
    hardEdgeThresholdDeg: 68,
  },
  structure: {
    label: "结构展示",
    mode: "wireframe",
    colorHex: "#1E293B",
    widthPx: 1.2,
    hardEdgeThresholdDeg: 68,
  },
  technical: {
    label: "技术图纸",
    mode: "cad",
    colorHex: "#0B0F1A",
    widthPx: 1.6,
    hardEdgeThresholdDeg: 55,
  },
}

const LIGHT_PRESETS: Record<Exclude<LightPresetId, "custom">, { label: string; values: LightSetup }> = {
  balanced: { label: "均衡（默认）", values: { ambient: 0.95, key: 0.8, fill: 0.45 } },
  highContrast: { label: "高对比", values: { ambient: 0.55, key: 1.05, fill: 0.25 } },
  softFill: { label: "柔和补光", values: { ambient: 1.1, key: 0.65, fill: 0.8 } },
}

const DEFAULT_EDGE_PRESET: Exclude<EdgePresetId, "custom"> = "productOutline"
const DEFAULT_LIGHT_PRESET: Exclude<LightPresetId, "custom"> = "balanced"
const DEFAULT_EDGE_SETUP = EDGE_PRESETS[DEFAULT_EDGE_PRESET]
const DEFAULT_LIGHT_SETUP = LIGHT_PRESETS[DEFAULT_LIGHT_PRESET].values

function normalizePath(path: string) {
  return path.trim().replace(/^\//, "")
}

function normalizeHexColor(input: string): string | null {
  const value = input.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase()
  return null
}

interface FlatMesh {
  id: string
  geometry: THREE.BufferGeometry
}

interface PreparedModelProps {
  modelPath: string
  modelColorHex: string
  edgeMode: EdgeRenderMode
  edgeColorHex: string
  edgeWidthPx: number
  hardEdgeThresholdDeg: number
  fillRatio: number
  modelRotationDeg: [number, number, number]
}

function PreparedModel({
  modelPath,
  modelColorHex,
  edgeMode,
  edgeColorHex,
  edgeWidthPx,
  hardEdgeThresholdDeg,
  fillRatio,
  modelRotationDeg,
}: PreparedModelProps) {
  const base = import.meta.env.BASE_URL
  const url = `${base}${normalizePath(modelPath)}`
  const loaded = useLoader(ThreeMFLoader, url)

  const meshes = useMemo<FlatMesh[]>(() => {
    const cloned = loaded.clone(true)
    const rawBox = new THREE.Box3().setFromObject(cloned)
    const rawCenter = rawBox.getCenter(new THREE.Vector3())
    const rawSize = rawBox.getSize(new THREE.Vector3())
    const maxEdge = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1
    const targetMaxEdge = 140 * fillRatio
    const scale = targetMaxEdge / maxEdge

    cloned.scale.setScalar(scale)
    cloned.position.sub(rawCenter.multiplyScalar(scale))

    const appliedModelRotation: [number, number, number] = [
      BASE_MODEL_ROTATION_DEG[0] + modelRotationDeg[0],
      BASE_MODEL_ROTATION_DEG[1] + modelRotationDeg[1],
      BASE_MODEL_ROTATION_DEG[2] + modelRotationDeg[2],
    ]
    cloned.rotation.set(
      THREE.MathUtils.degToRad(appliedModelRotation[0]),
      THREE.MathUtils.degToRad(appliedModelRotation[1]),
      THREE.MathUtils.degToRad(appliedModelRotation[2]),
    )

    const scaledBox = new THREE.Box3().setFromObject(cloned)
    cloned.position.y -= scaledBox.min.y

    const centeredBox = new THREE.Box3().setFromObject(cloned)
    const finalCenter = centeredBox.getCenter(new THREE.Vector3())
    cloned.position.x -= finalCenter.x
    cloned.position.z -= finalCenter.z
    cloned.updateMatrixWorld(true)

    const out: FlatMesh[] = []
    let idx = 0
    cloned.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const baked = obj.geometry.clone()
      baked.applyMatrix4(obj.matrixWorld)
      out.push({ id: `${obj.uuid}-${idx++}`, geometry: baked })
    })
    return out
  }, [fillRatio, loaded, modelPath, modelRotationDeg])

  useEffect(() => {
    return () => {
      meshes.forEach((m) => m.geometry.dispose())
    }
  }, [meshes])

  return (
    <group>
      {meshes.map((mesh) => {
        const isWireframe = edgeMode === "wireframe"
        return (
          <mesh key={mesh.id} geometry={mesh.geometry} castShadow={false} receiveShadow={false}>
            <meshStandardMaterial
              color={isWireframe ? edgeColorHex : modelColorHex}
              roughness={0.5}
              metalness={0}
              wireframe={isWireframe}
            />
            {edgeMode === "hardEdges" && (
              <Edges
                threshold={THREE.MathUtils.clamp(hardEdgeThresholdDeg, 1, 180)}
                lineWidth={THREE.MathUtils.clamp(edgeWidthPx, 0.5, 6)}
                color={edgeColorHex}
              />
            )}
            {edgeMode === "cad" && (
              <>
                <Edges
                  threshold={THREE.MathUtils.clamp(hardEdgeThresholdDeg, 1, 180)}
                  lineWidth={THREE.MathUtils.clamp(edgeWidthPx, 0.5, 6)}
                  color={edgeColorHex}
                />
                <Outlines
                  color={edgeColorHex}
                  thickness={0.0018 * THREE.MathUtils.clamp(edgeWidthPx, 0.5, 6)}
                  angle={Math.PI}
                  screenspace
                  transparent
                  opacity={0.95}
                />
              </>
            )}
          </mesh>
        )
      })}
    </group>
  )
}

interface CameraRigProps {
  position: [number, number, number]
  target: [number, number, number]
}

function CameraRig({ position, target }: CameraRigProps) {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(target[0], target[1], target[2])
    camera.updateProjectionMatrix()
  }, [camera, position, target])
  return null
}

export default function ItemCardR3FTool() {
  const [entries] = useState<ModelEntry[]>(DEFAULT_MODELS)
  const [activeId, setActiveId] = useState(entries[0]?.id ?? "")
  const [fillRatio, setFillRatio] = useState(1)
  const [rotX, setRotX] = useState(0)
  const [rotY, setRotY] = useState(0)
  const [rotZ, setRotZ] = useState(0)
  const [modelColorHex, setModelColorHex] = useState("#FFFFFF")
  const [modelColorInput, setModelColorInput] = useState("#FFFFFF")
  const [edgePreset, setEdgePreset] = useState<EdgePresetId>(DEFAULT_EDGE_PRESET)
  const [edgeMode, setEdgeMode] = useState<EdgeRenderMode>(DEFAULT_EDGE_SETUP.mode)
  const [edgeColorHex, setEdgeColorHex] = useState(DEFAULT_EDGE_SETUP.colorHex)
  const [edgeColorInput, setEdgeColorInput] = useState(DEFAULT_EDGE_SETUP.colorHex)
  const [edgeWidthPx, setEdgeWidthPx] = useState(DEFAULT_EDGE_SETUP.widthPx)
  const [hardEdgeThresholdDeg, setHardEdgeThresholdDeg] = useState(DEFAULT_EDGE_SETUP.hardEdgeThresholdDeg)
  const [lightPreset, setLightPreset] = useState<LightPresetId>(DEFAULT_LIGHT_PRESET)
  const [ambientLightIntensity, setAmbientLightIntensity] = useState(DEFAULT_LIGHT_SETUP.ambient)
  const [keyLightIntensity, setKeyLightIntensity] = useState(DEFAULT_LIGHT_SETUP.key)
  const [fillLightIntensity, setFillLightIntensity] = useState(DEFAULT_LIGHT_SETUP.fill)

  const activeEntry = useMemo(() => entries.find((e) => e.id === activeId), [activeId, entries])

  useEffect(() => {
    if (edgePreset === "custom") return
    const preset = EDGE_PRESETS[edgePreset]
    setEdgeMode(preset.mode)
    setEdgeColorHex(preset.colorHex)
    setEdgeColorInput(preset.colorHex)
    setEdgeWidthPx(preset.widthPx)
    setHardEdgeThresholdDeg(preset.hardEdgeThresholdDeg)
  }, [edgePreset])

  useEffect(() => {
    if (lightPreset === "custom") return
    const preset = LIGHT_PRESETS[lightPreset]
    setAmbientLightIntensity(preset.values.ambient)
    setKeyLightIntensity(preset.values.key)
    setFillLightIntensity(preset.values.fill)
  }, [lightPreset])

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <div className="mx-auto flex max-w-[1200px] gap-4 p-4">
        <div className="w-[380px] shrink-0 rounded-xl border border-white/15 bg-white/5 p-4">
          <h1 className="text-lg font-semibold">3MF Item Card（R3F + drei 实验）</h1>
          <p className="mt-1 text-xs text-white/70">
            用于对照 drei 的 Edges/相机控制效果，当前只加载内置模型。
          </p>

          <label className="mt-3 block text-xs text-white/80">
            模型
            <select
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
            >
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.displayName}</option>
              ))}
            </select>
          </label>

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
            光照预设
            <select
              value={lightPreset}
              onChange={(e) => setLightPreset(e.target.value as LightPresetId)}
              className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
            >
              <option value="balanced">{LIGHT_PRESETS.balanced.label}</option>
              <option value="highContrast">{LIGHT_PRESETS.highContrast.label}</option>
              <option value="softFill">{LIGHT_PRESETS.softFill.label}</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          <label className="mt-2 block text-xs text-white/80">
            环境光强度（{ambientLightIntensity.toFixed(2)}）
          </label>
          <input
            type="range"
            min={0}
            max={2.5}
            step={0.05}
            value={ambientLightIntensity}
            onChange={(e) => {
              setLightPreset("custom")
              setAmbientLightIntensity(Number(e.target.value))
            }}
            className="mt-1 w-full"
          />
          <label className="mt-2 block text-xs text-white/80">
            主光强度（{keyLightIntensity.toFixed(2)}）
          </label>
          <input
            type="range"
            min={0}
            max={2.5}
            step={0.05}
            value={keyLightIntensity}
            onChange={(e) => {
              setLightPreset("custom")
              setKeyLightIntensity(Number(e.target.value))
            }}
            className="mt-1 w-full"
          />
          <label className="mt-2 block text-xs text-white/80">
            补光强度（{fillLightIntensity.toFixed(2)}）
          </label>
          <input
            type="range"
            min={0}
            max={2.5}
            step={0.05}
            value={fillLightIntensity}
            onChange={(e) => {
              setLightPreset("custom")
              setFillLightIntensity(Number(e.target.value))
            }}
            className="mt-1 w-full"
          />

          <label className="mt-3 block text-xs text-white/80">
            模型颜色（HEX）
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={modelColorInput}
                onChange={(e) => setModelColorInput(e.target.value)}
                onBlur={() => {
                  const normalized = normalizeHexColor(modelColorInput)
                  if (!normalized) {
                    setModelColorInput(modelColorHex)
                    return
                  }
                  setModelColorHex(normalized)
                  setModelColorInput(normalized)
                }}
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
              />
            </div>
          </label>

          <label className="mt-3 block text-xs text-white/80">
            描边预设
            <select
              value={edgePreset}
              onChange={(e) => setEdgePreset(e.target.value as EdgePresetId)}
              className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
            >
              <option value="productOutline">{EDGE_PRESETS.productOutline.label}</option>
              <option value="structure">{EDGE_PRESETS.structure.label}</option>
              <option value="technical">{EDGE_PRESETS.technical.label}</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          <label className="mt-2 block text-xs text-white/80">
            描边模式
            <select
              value={edgeMode}
              onChange={(e) => {
                setEdgePreset("custom")
                setEdgeMode(e.target.value as EdgeRenderMode)
              }}
              className="mt-1 w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none focus:border-white/40"
            >
              <option value="none">关闭</option>
              <option value="hardEdges">drei Edges（轮廓硬边）</option>
              <option value="wireframe">Material Wireframe（框架线）</option>
              <option value="cad">建模线（CAD）</option>
            </select>
          </label>
          {edgeMode === "hardEdges" && (
            <>
              <label className="mt-2 block text-xs text-white/80">
                硬边阈值（{hardEdgeThresholdDeg.toFixed(0)}°）
              </label>
              <input
                type="range"
                min={1}
                max={180}
                step={1}
                value={hardEdgeThresholdDeg}
                onChange={(e) => {
                  setEdgePreset("custom")
                  setHardEdgeThresholdDeg(Number(e.target.value))
                }}
                className="mt-1 w-full"
              />
            </>
          )}
          <label className="mt-2 block text-xs text-white/80">
            边线颜色（HEX）
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={edgeColorInput}
                onChange={(e) => setEdgeColorInput(e.target.value)}
                onBlur={() => {
                  const normalized = normalizeHexColor(edgeColorInput)
                  if (!normalized) {
                    setEdgeColorInput(edgeColorHex)
                    return
                  }
                  setEdgePreset("custom")
                  setEdgeColorHex(normalized)
                  setEdgeColorInput(normalized)
                }}
                className="w-full rounded-md border border-white/20 bg-black/35 px-2 py-2 text-xs uppercase outline-none focus:border-white/40"
              />
              <input
                type="color"
                value={edgeColorHex}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase()
                  setEdgePreset("custom")
                  setEdgeColorHex(next)
                  setEdgeColorInput(next)
                }}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-white/20 bg-black/35 p-1"
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
            onChange={(e) => {
              setEdgePreset("custom")
              setEdgeWidthPx(Number(e.target.value))
            }}
            className="mt-1 w-full"
          />
        </div>

        <div className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#1b1b1b] p-3">
          <p className="mb-2 text-xs text-white/65">
            鼠标拖动旋转，滚轮缩放。用于对照 drei 版本描边效果。
          </p>
          <div className="h-[720px] overflow-hidden rounded-lg bg-[linear-gradient(45deg,#242424_25%,transparent_25%),linear-gradient(-45deg,#242424_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#242424_75%),linear-gradient(-45deg,transparent_75%,#242424_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
            <Canvas
              shadows={false}
              dpr={[1, 2]}
              gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
              camera={{ fov: 28, near: 1, far: 5000 }}
            >
              <CameraRig position={DEFAULT_POV} target={DEFAULT_TARGET} />
              <ambientLight intensity={ambientLightIntensity} />
              <directionalLight position={[-220, 340, 260]} intensity={keyLightIntensity} />
              <directionalLight position={[180, 220, -120]} intensity={fillLightIntensity} />
              {activeEntry && (
                <PreparedModel
                  modelPath={activeEntry.modelPath}
                  modelColorHex={modelColorHex}
                  edgeMode={edgeMode}
                  edgeColorHex={edgeColorHex}
                  edgeWidthPx={edgeWidthPx}
                  hardEdgeThresholdDeg={hardEdgeThresholdDeg}
                  fillRatio={fillRatio}
                  modelRotationDeg={[rotX, rotY, rotZ]}
                />
              )}
              <OrbitControls
                makeDefault
                target={new THREE.Vector3(DEFAULT_TARGET[0], DEFAULT_TARGET[1], DEFAULT_TARGET[2])}
                enablePan={true}
              />
            </Canvas>
          </div>
        </div>
      </div>
    </div>
  )
}

