import { Suspense, lazy, useRef, useEffect, useCallback, useState, useMemo, type DragEvent, type ChangeEvent } from "react"
import * as THREE from "three"
import { useThree, useFrame, useLoader } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei/core/OrbitControls"
import { Dialog } from "@base-ui/react/dialog"
import { toast } from "sonner"
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js"
import { useEditorStore } from "@/stores/editor-store"
import { useThemeStore } from "@/stores/theme-store"
import { getMaterialColor, MATERIAL_COLORS } from "@/config/materials"
import { UnifiedPreviewCanvas } from "@/components/preview/unified-preview-canvas"
import { CELL_SIZE } from "@/config/catalog"
import { findItemBySku, useCatalog } from "@/hooks/use-catalog"
import { cn } from "@/lib/utils"
import {
  APP_AUTHOR_NAME,
  APP_LICENSE_NAME,
  APP_LICENSE_URL,
  APP_PAGE_TITLE,
  CUSTOM_EVENTS,
  DATA_TRANSFER_TYPE,
  EXPORT_PREFIX,
} from "@/config/brand"
import { AppLogo } from "@/components/brand/app-logo"
import { TitleLogo } from "@/components/brand/title-logo"
import { type BlockCatalogItem, type Preset } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import { Trash2, ChevronLeft, ChevronRight, Eraser, Pipette, ArrowUpDown, Layers, CircleHelp, AlertTriangle, Info } from "lucide-react"
import { validateLayout, type LayoutProblem } from "@/engine/export-validation"
import { trackEvent } from "@/lib/analytics"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "@/components/ui/navigation-menu"
import { Button } from "@/components/ui/button"
import { PresetDialog } from "@/features/catalog/components/PresetDialog"
import { BlockMesh } from "./BlockMesh"
import { CellGrid } from "./CellGrid"
import { GhostPreview } from "./GhostPreview"
import { TourGhostItem } from "./TourGhostItem"
import { ViewCube, cameraTweenRef } from "./ViewCube"

const LazyPlacedItems = lazy(async () => {
  const mod = await import("./PlacedItems")
  return { default: mod.PlacedItems }
})

function getItemNameBySku(sku: string): string {
  const item = findItemBySku(sku)
  return item?.display_name ?? sku
}

interface ShoppingListItem {
  sku: string
  name: string
  qty: number
}

interface ImportedLayoutData {
  blockSku: string
  placements: Array<{ sku: string; cell: [number, number] }>
}

type ExportDeps = {
  JSZip: new () => {
    file: (name: string, data: string | ArrayBuffer | Blob) => unknown
    generateAsync: (options: { type: "blob" }) => Promise<Blob>
  }
  saveAs: (typeof import("file-saver"))["saveAs"]
  XLSX: typeof import("xlsx")
}

async function loadExportDeps(): Promise<ExportDeps> {
  const [JSZipModule, { saveAs }, XLSX] = await Promise.all([
    import("jszip"),
    import("file-saver"),
    import("xlsx"),
  ])
  const JSZip = JSZipModule.default as ExportDeps["JSZip"]
  return { JSZip, saveAs, XLSX }
}

function buildShoppingList(placements: Placement[]): ShoppingListItem[] {
  const counter = new Map<string, number>()
  for (const p of placements) {
    counter.set(p.sku, (counter.get(p.sku) ?? 0) + 1)
  }
  return Array.from(counter.entries())
    .map(([sku, qty]) => ({
      sku,
      name: getItemNameBySku(sku),
      qty,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku))
}

function createLayoutPayload(block: BlockCatalogItem, placements: Placement[]): ImportedLayoutData {
  return {
    blockSku: block.sku,
    placements: placements.map((p) => ({ sku: p.sku, cell: p.cell })),
  }
}

function createModelPayload(block: BlockCatalogItem, placements: Placement[]) {
  return {
    type: "model",
    exportedAt: new Date().toISOString(),
    block,
    placements,
  }
}

async function appendModelAssetsToZip(
  zip: { file: (name: string, data: string | ArrayBuffer | Blob) => unknown },
  block: BlockCatalogItem,
  placements: Placement[],
) {
  const paths = new Set<string>()
  if (block.modelPath) paths.add(block.modelPath.replace(/^\//, ""))
  for (const p of placements) {
    const item = findItemBySku(p.sku)
    if (item?.modelPath) paths.add(item.modelPath.replace(/^\//, ""))
  }

  const failed: string[] = []
  await Promise.all(
    Array.from(paths).map(async (path) => {
      const url = `${import.meta.env.BASE_URL}${path}`
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.arrayBuffer()
        zip.file(path, data)
      } catch {
        failed.push(path)
      }
    }),
  )

  if (failed.length > 0) {
    zip.file(
      "missing-model-files.txt",
      [
        "以下模型文件未能打包（请检查路径或资源是否存在）：",
        ...failed.map((p) => `- ${p}`),
      ].join("\n"),
    )
  }
}

function createShoppingWorkbook(
  block: BlockCatalogItem,
  placements: Placement[],
  XLSX: typeof import("xlsx"),
) {
  const shoppingList = buildShoppingList(placements)
  const metaRows = [
    { 字段: "导出时间", 值: new Date().toISOString() },
    { 字段: "框体 SKU", 值: block.sku },
    { 字段: "框体名称", 值: block.display_name },
    { 字段: "总放置数", 值: String(placements.length) },
    { 字段: "SKU 种类数", 值: String(shoppingList.length) },
  ]
  const itemRows = shoppingList.map((item) => ({
    SKU: item.sku,
    名称: item.name,
    数量: item.qty,
  }))

  const wb = XLSX.utils.book_new()
  const summaryWs = XLSX.utils.json_to_sheet(metaRows)
  const itemsWs = XLSX.utils.json_to_sheet(itemRows)
  XLSX.utils.book_append_sheet(wb, summaryWs, "概要")
  XLSX.utils.book_append_sheet(wb, itemsWs, "清单")
  return wb
}

function trackExport(exportType: string, block: BlockCatalogItem, placements: Placement[]) {
  const skuCounts: Record<string, number> = {}
  for (const p of placements) {
    skuCounts[p.sku] = (skuCounts[p.sku] ?? 0) + 1
  }
  trackEvent("layout_export", {
    export_type: exportType,
    block_sku: block.sku,
    block_name: block.display_name,
    total_items: placements.length,
    unique_skus: Object.keys(skuCounts).length,
    item_skus: skuCounts,
  })
}

async function exportLayout(block: BlockCatalogItem, placements: Placement[]) {
  trackExport("layout", block, placements)
  const { saveAs } = await import("file-saver")
  const payload = createLayoutPayload(block, placements)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  saveAs(blob, `${EXPORT_PREFIX}-layout-${Date.now()}.json`)
}

async function exportModel(block: BlockCatalogItem, placements: Placement[]) {
  trackExport("model", block, placements)
  const { JSZip, saveAs } = await loadExportDeps()
  const zip = new JSZip()
  const modelPayload = createModelPayload(block, placements)
  zip.file("layout.json", JSON.stringify(modelPayload, null, 2))
  await appendModelAssetsToZip(zip, block, placements)
  const modelBundle = await zip.generateAsync({ type: "blob" })
  saveAs(modelBundle, `${EXPORT_PREFIX}-model-${Date.now()}.zip`)
}

async function exportShoppingXlsx(block: BlockCatalogItem, placements: Placement[]) {
  trackExport("shopping", block, placements)
  const { XLSX, saveAs } = await loadExportDeps()
  const wb = createShoppingWorkbook(block, placements, XLSX)
  const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  const xlsxBlob = new Blob([xlsxBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  saveAs(xlsxBlob, `${EXPORT_PREFIX}-shopping-list-${Date.now()}.xlsx`)
}

async function exportAll(block: BlockCatalogItem, placements: Placement[]) {
  trackExport("all", block, placements)
  const { JSZip, saveAs, XLSX } = await loadExportDeps()
  const zip = new JSZip()
  const modelPayload = createModelPayload(block, placements)
  const wb = createShoppingWorkbook(block, placements, XLSX)
  const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })

  zip.file("layout.json", JSON.stringify(modelPayload, null, 2))
  await appendModelAssetsToZip(zip, block, placements)
  zip.file("shopping-list.xlsx", xlsxBuffer)
  const blob = await zip.generateAsync({ type: "blob" })
  saveAs(blob, `${EXPORT_PREFIX}-export-${Date.now()}.zip`)
}

function normalizeImportedLayout(raw: unknown): ImportedLayoutData {
  if (!raw || typeof raw !== "object") {
    throw new Error("导入文件内容无效")
  }
  const data = raw as {
    blockSku?: unknown
    placements?: unknown
  }

  if (typeof data.blockSku !== "string" || !data.blockSku) {
    throw new Error("导入文件缺少 blockSku")
  }
  const blockSku = data.blockSku

  const rawPlacements = Array.isArray(data.placements) ? data.placements : []
  const placements: Array<{ sku: string; cell: [number, number] }> = []
  for (const entry of rawPlacements) {
    if (!entry || typeof entry !== "object") continue
    const sku = (entry as { sku?: unknown }).sku
    const cell = (entry as { cell?: unknown }).cell
    if (typeof sku !== "string" || !Array.isArray(cell) || cell.length < 2) continue
    const col = Number(cell[0])
    const row = Number(cell[1])
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue
    placements.push({ sku, cell: [Math.trunc(col), Math.trunc(row)] })
  }
  if (placements.length === 0 && rawPlacements.length > 0) {
    throw new Error("导入文件中的放置项无效")
  }
  return { blockSku, placements }
}

function parseLayoutJsonText(text: string): ImportedLayoutData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("JSON 解析失败")
  }
  return normalizeImportedLayout(parsed)
}

function logViewportDnD(...args: unknown[]) {
  if (!import.meta.env.DEV) return
  console.log("[viewport-mobile-dnd]", ...args)
}

async function parseImportedLayoutFile(file: File): Promise<ImportedLayoutData> {
  const lower = file.name.toLowerCase()
  if (!lower.endsWith(".json")) {
    throw new Error("仅支持导入 JSON 文件")
  }
  return parseLayoutJsonText(await file.text())
}

function setPresetQueryParam(presetId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set("set", presetId)
  window.history.replaceState({}, "", url)
}

function clampDirectionPolar(dir: THREE.Vector3, minPolar: number, maxPolar: number): THREE.Vector3 {
  const theta = Math.acos(Math.max(-1, Math.min(1, dir.y)))
  if (theta >= minPolar && theta <= maxPolar) return dir.clone()

  const clampedTheta = Math.max(minPolar, Math.min(maxPolar, theta))
  const horizontalLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z)

  if (horizontalLen < 1e-6) {
    return new THREE.Vector3(0, Math.cos(clampedTheta), Math.sin(clampedTheta))
  }

  const newY = Math.cos(clampedTheta)
  const newHorizontal = Math.sin(clampedTheta)
  const scale = newHorizontal / horizontalLen

  return new THREE.Vector3(dir.x * scale, newY, dir.z * scale).normalize()
}

function CameraAnimator() {
  const camera = useThree((s) => s.camera)
  const defaultControls = useThree((s) => s.controls) as any
  const invalidate = useThree((s) => s.invalidate)
  const animRef = useRef(false)

  useEffect(() => {
    const _dummy = new THREE.Object3D()

    cameraTweenRef.current = (direction: THREE.Vector3) => {
      if (animRef.current) return
      const controls = defaultControls
      const focusPoint: THREE.Vector3 = controls?.target?.clone() ?? new THREE.Vector3()
      const radius = camera.position.distanceTo(focusPoint)

      const minPolar: number = controls?.minPolarAngle ?? 0
      const maxPolar: number = controls?.maxPolarAngle ?? Math.PI
      const clampedDir = clampDirectionPolar(direction, minPolar, maxPolar)

      const q1 = camera.quaternion.clone()

      const up = new THREE.Vector3()
      if (Math.abs(clampedDir.y) > 0.9 && Math.abs(clampedDir.x) < 0.3 && Math.abs(clampedDir.z) < 0.3) {
        up.set(0, 0, clampedDir.y > 0 ? -1 : 1)
      } else {
        up.set(0, 1, 0)
      }

      _dummy.position.set(0, 0, 0)
      _dummy.up.copy(up)
      _dummy.lookAt(clampedDir)
      const q2 = _dummy.quaternion.clone()

      if (q1.dot(q2) < 0) q2.set(-q2.x, -q2.y, -q2.z, -q2.w)
      if (q1.angleTo(q2) < 0.02) return

      animRef.current = true
      if (controls) controls.enabled = false
      const defaultUp = camera.up.clone()
      const start = performance.now()
      const duration = 500

      const tick = () => {
        const t = Math.min((performance.now() - start) / duration, 1)
        const ease = 1 - Math.pow(1 - t, 3)
        const q = q1.clone().slerp(q2, ease)

        camera.position.set(0, 0, 1).applyQuaternion(q).multiplyScalar(radius).add(focusPoint)
        camera.up.set(0, 1, 0).applyQuaternion(q).normalize()
        camera.quaternion.copy(q)
        invalidate()

        if (t < 1) {
          requestAnimationFrame(tick)
        } else {
          camera.up.copy(defaultUp)
          if (controls) {
            controls.enabled = true
            controls.update()
          }
          invalidate()
          animRef.current = false
        }
      }

      tick()
    }

    return () => {
      cameraTweenRef.current = null
    }
  }, [camera, defaultControls, invalidate])

  return null
}

function useIsDark() {
  const mode = useThemeStore((s) => s.mode)
  if (mode !== "system") return mode === "dark"
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
}

function Scene({
  previewSku,
  dragging,
  mobile,
  onBlockLoadStateChange,
}: {
  previewSku: string | null
  dragging: boolean
  mobile?: boolean
  onBlockLoadStateChange?: (state: { loading: boolean; failed: boolean }) => void
}) {
  const block = useEditorStore((s) => s.block)
  const placements = useEditorStore((s) => s.placements)
  const selectedSku = useEditorStore((s) => s.selectedCatalogSku)
  const selectedPlacementId = useEditorStore((s) => s.selectedPlacementId)
  const hoveredCell = useEditorStore((s) => s.hoveredCell)
  const blockColorId = useEditorStore((s) => s.blockColorId)
  const itemColorId = useEditorStore((s) => s.itemColorId)

  const setHoveredCell = useEditorStore((s) => s.setHoveredCell)
  const placeItem = useEditorStore((s) => s.placeItem)
  const selectPlacement = useEditorStore((s) => s.selectPlacement)
  const movePlacement = useEditorStore((s) => s.movePlacement)
  const removePlacement = useEditorStore((s) => s.removePlacement)
  const isDark = useIsDark()
  const [draggingPlacementId, setDraggingPlacementId] = useState<string | null>(null)
  const [showDetailedItems, setShowDetailedItems] = useState(false)
  const [blockMeshReady, setBlockMeshReady] = useState(!block.modelPath)

  const blockMat = getMaterialColor(blockColorId)
  const itemMat = getMaterialColor(itemColorId)
  const activeSku = previewSku ?? selectedSku
  const selectedItem = activeSku ? findItemBySku(activeSku) : undefined
  const inPlacementMode = mobile && !!selectedSku
  const controlsEnabled = !dragging && !draggingPlacementId && !inPlacementMode
  const orbitTargetY = Math.max(20, block.height * 0.45)
  const [innerW, innerD] = block.innerSize
  const placeholderOuterW = innerW + 8
  const placeholderOuterD = innerD + 8
  const blockModelUrl = useMemo(() => {
    if (!block.modelPath) return null
    const base = import.meta.env.BASE_URL
    return `${base}${block.modelPath.replace(/^\//, "")}`
  }, [block.modelPath])

  const deg = (d: number) => (d * Math.PI) / 180

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedPlacementId) {
        removePlacement(selectedPlacementId)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [removePlacement, selectedPlacementId])

  useEffect(() => {
    if (!blockModelUrl) {
      setBlockMeshReady(true)
      return
    }

    setBlockMeshReady(false)
    // Use R3F loader cache to warm up without a duplicate plain fetch.
    useLoader.preload(ThreeMFLoader, blockModelUrl)
  }, [blockModelUrl])

  useEffect(() => {
    onBlockLoadStateChange?.({
      loading: !blockMeshReady,
      failed: false,
    })
  }, [blockMeshReady, onBlockLoadStateChange])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null
    const win = globalThis as unknown as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (id: number) => void
    }

    const onIdle: IdleRequestCallback = () => {
      setShowDetailedItems(true)
    }

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(onIdle, { timeout: 500 })
    } else {
      timeoutId = globalThis.setTimeout(() => {
        setShowDetailedItems(true)
      }, 200)
    }

    return () => {
      if (idleId !== null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId)
      }
    }
  }, [])

  const handleCellClick = (col: number, row: number) => {
    if (selectedSku) {
      placeItem(col, row)
      return
    }
    selectPlacement(null)
  }

  return (
    <>
      <CameraAnimator />

      <OrbitControls
        makeDefault
        minPolarAngle={deg(10)}
        maxPolarAngle={deg(80)}
        minDistance={mobile ? 100 : 150}
        maxDistance={800}
        enableDamping
        dampingFactor={0.1}
        target={[0, orbitTargetY, 0]}
        enabled={controlsEnabled}
      />

      {/* Ground reference */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -4.5, 0]}
        onClick={() => {
          useEditorStore.getState().selectCatalogItem(null)
          selectPlacement(null)
        }}
      >
        <planeGeometry args={[256, 256]} />
        <meshStandardMaterial color={isDark ? "#2a2a2a" : "#f0eeeb"} roughness={1} />
      </mesh>

      <Suspense
        fallback={
          <mesh position={[0, block.height / 2, 0]}>
            <boxGeometry args={[placeholderOuterW, block.height, placeholderOuterD]} />
            <meshStandardMaterial
              color={blockMat.hex}
              roughness={blockMat.roughness}
              metalness={0}
              transparent
              opacity={0.3}
            />
          </mesh>
        }
      >
        <BlockMesh
          block={block}
          color={blockMat.hex}
          roughness={blockMat.roughness}
          onReady={() => setBlockMeshReady(true)}
        />
      </Suspense>
      <CellGrid
        block={block}
        onCellHover={setHoveredCell}
        onCellClick={handleCellClick}
      />
      {showDetailedItems && (
        <Suspense fallback={null}>
          <LazyPlacedItems
            block={block}
            placements={placements}
            color={itemMat.hex}
            roughness={itemMat.roughness}
            mobile={mobile}
            selectedPlacementId={selectedPlacementId}
            draggingPlacementId={draggingPlacementId}
            onSelectPlacement={selectPlacement}
            onMovePlacement={movePlacement}
            onDragPlacementChange={setDraggingPlacementId}
          />
        </Suspense>
      )}

      <ViewCube mobile={mobile} />

      {hoveredCell && selectedItem && (
        <GhostPreview
          block={block}
          cell={hoveredCell}
          item={selectedItem}
          placements={placements}
        />
      )}

      <TourGhostItem />
    </>
  )
}

/** pointer-events-none 不会继承，子节点默认可交互；HUD 等叠层需阻断整棵子树。 */
const VIEWPORT_OVERLAY =
  "pointer-events-none select-none [-webkit-touch-callout:none] [&_*]:pointer-events-none [&_*]:select-none"

/** 可点击工具栏：保持 pointer-events，同时禁止 iOS 长按选中文字/图片。 */
const VIEWPORT_CHROME =
  "pointer-events-auto touch-manipulation select-none [-webkit-touch-callout:none] [&_*]:select-none [&_img]:select-none [&_svg]:select-none [&_button]:pointer-events-auto [&_a]:pointer-events-auto [&_[role=button]]:pointer-events-auto"

function formatMemLabel(gl: THREE.WebGLRenderer): string {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } }
  if (perf.memory?.usedJSHeapSize) {
    return `${Math.round(perf.memory.usedJSHeapSize / 1048576)} MB`
  }

  // iOS Safari does not expose performance.memory; show WebGL resource counts instead.
  const { textures, geometries } = gl.info.memory
  if (textures > 0 || geometries > 0) {
    return `${textures} tex · ${geometries} geo`
  }

  return "--"
}

function FpsTracker({ onUpdate }: { onUpdate: (fps: number, memLabel: string) => void }) {
  const gl = useThree((s) => s.gl)
  const frames = useRef(0)
  const lastTime = useRef(performance.now())

  useFrame(() => {
    frames.current++
    const now = performance.now()
    const elapsed = now - lastTime.current
    if (elapsed >= 1000) {
      const fps = Math.round((frames.current * 1000) / elapsed)
      onUpdate(fps, formatMemLabel(gl))
      frames.current = 0
      lastTime.current = now
    }
  })

  return null
}

function SceneBridge({
  onReady,
}: {
  onReady: (camera: THREE.Camera, canvas: HTMLCanvasElement) => void
}) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    onReady(camera, gl.domElement)
  }, [camera, gl, onReady])

  return null
}

function ColorPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-2 p-3">
      {MATERIAL_COLORS.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          title={c.name}
          className={cn(
            "size-6 rounded-full border-2 transition-transform hover:scale-110",
            value === c.id ? "border-foreground scale-110" : "border-transparent",
          )}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  )
}

function PresetSelector({
  onSelect,
  maxWidth,
}: {
  onSelect: (preset: Preset) => void
  maxWidth: number
}) {
  const { data, loading, error } = useCatalog()
  const scrollRef = useRef<HTMLDivElement>(null)
  const presets = data?.presets ?? []

  const scrollByCards = (direction: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" })
  }

  if (loading) {
    return (
      <div className="flex gap-2 px-11 py-2" style={{ width: maxWidth }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-[170px] shrink-0 rounded-lg border border-border p-2">
            <Skeleton className="mb-1.5 aspect-[4/3] w-full rounded-md" />
            <Skeleton className="h-3 w-3/4 rounded" />
            <Skeleton className="mt-1 h-2.5 w-1/2 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (error || presets.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground" style={{ width: maxWidth }}>
        暂无可用套装
      </div>
    )
  }

  return (
    <div className="relative" style={{ width: maxWidth }}>
      <button
        type="button"
        onClick={() => scrollByCards(-1)}
        className="absolute top-1/2 left-2 z-10 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        aria-label="向左滚动套装"
      >
        <ChevronLeft className="size-4" />
      </button>

      <div
        ref={scrollRef}
        className="no-scrollbar flex w-full overflow-x-auto overflow-y-hidden px-11 py-2"
      >
        <div className="flex w-max gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onSelect(preset)}
              className="group flex w-[170px] shrink-0 flex-col rounded-lg border border-border bg-background p-2 text-left transition-all hover:border-foreground/30 hover:bg-muted/30"
            >
              <div className="mb-1.5 aspect-[4/3] w-full overflow-hidden rounded-md bg-muted/60" />
              <div className="truncate text-xs font-medium leading-tight">{preset.name}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {preset.items.length} 件
              </div>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => scrollByCards(1)}
        className="absolute top-1/2 right-2 z-10 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        aria-label="向右滚动套装"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

function MobileTopBar() {
  const [aboutOpen, setAboutOpen] = useState(false)
  return (
    <div
      data-viewport-chrome
      className={cn(
        VIEWPORT_CHROME,
        "flex w-full items-center justify-between rounded-xl border border-border bg-background/80 px-3 py-1.5 backdrop-blur-md",
      )}
      onTouchStart={() => window.getSelection()?.removeAllRanges()}
    >
      <div className="flex items-center gap-1.5">
        <AppLogo className="size-5" />
        <TitleLogo className="h-4 w-auto" />
      </div>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                id="tour-m-replay"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.tourReplay))
                }}
                className="rounded-md p-1.5 text-foreground transition-colors hover:bg-muted"
                aria-label="功能引导"
              />
            }
          >
            <CircleHelp className="size-[18px]" strokeWidth={2.2} />
          </TooltipTrigger>
          <TooltipContent>功能引导</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={() => {
                  const { mode, setMode } = useThemeStore.getState()
                  setMode(mode === "dark" ? "light" : "dark")
                }}
                className="rounded-md p-1.5 text-foreground transition-colors hover:bg-muted"
                aria-label="切换主题"
              />
            }
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
              <path d="M12 3l0 18" />
              <path d="M12 9l4.65 -4.65" />
              <path d="M12 14.3l7.37 -7.37" />
              <path d="M12 19.6l8.85 -8.85" />
            </svg>
          </TooltipTrigger>
          <TooltipContent>切换主题</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={() => setAboutOpen(true)}
                className="rounded-md p-1.5 text-foreground transition-colors hover:bg-muted"
                aria-label="关于"
              />
            }
          >
            <Info className="size-[18px]" strokeWidth={2.2} />
          </TooltipTrigger>
          <TooltipContent>关于</TooltipContent>
        </Tooltip>
        <AboutLicenseDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      </div>
    </div>
  )
}

export function MobileActionBar() {
  const [activePreset, setActivePreset] = useState<Preset | null>(null)
  const [materialTarget, setMaterialTarget] = useState<"block" | "item">("block")
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [validationProblems, setValidationProblems] = useState<LayoutProblem[]>([])
  const [validationDialogOpen, setValidationDialogOpen] = useState(false)
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false)
  const [pendingExportType, setPendingExportType] = useState<ExportType>("all")
  const pendingExportRef = useRef<(() => void) | null>(null)
  const setProblemPlacementIds = useEditorStore((s) => s.setProblemPlacementIds)
  const barRef = useRef<HTMLDivElement>(null)
  const [presetPanelMaxWidth, setPresetPanelMaxWidth] = useState(720)
  const blockColorId = useEditorStore((s) => s.blockColorId)
  const itemColorId = useEditorStore((s) => s.itemColorId)
  const block = useEditorStore((s) => s.block)
  const placements = useEditorStore((s) => s.placements)
  const selectedPlacementId = useEditorStore((s) => s.selectedPlacementId)
  const setBlockColor = useEditorStore((s) => s.setBlockColor)
  const setItemColor = useEditorStore((s) => s.setItemColor)
  const clearAll = useEditorStore((s) => s.clearAll)
  const removePlacement = useEditorStore((s) => s.removePlacement)
  const importLayout = useEditorStore((s) => s.importLayout)
  const count = placements.length
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const update = () => {
      setPresetPanelMaxWidth(Math.max(320, window.innerWidth - 32))
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        target.closest(
          '[data-slot="navigation-menu-trigger"], [data-slot="navigation-menu-content"], [data-slot="navigation-menu-popup"], [data-slot="navigation-menu-positioner"]',
        )
      ) {
        return
      }
      barRef.current
        ?.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-trigger"]')
        .forEach((trigger) => trigger.blur())
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [])

  const handleDelete = () => {
    if (!selectedPlacementId) return
    setConfirmDeleteOpen(true)
  }

  const handleClear = () => {
    if (count === 0) return
    setConfirmClearOpen(true)
  }

  const exportFnMap: Record<ExportType, () => void | Promise<void>> = {
    layout: () => exportLayout(block, placements),
    model: () => exportModel(block, placements),
    shopping: () => exportShoppingXlsx(block, placements),
    all: () => exportAll(block, placements),
  }

  const openExportPreview = (type: ExportType) => {
    setPendingExportType(type)
    setExportPreviewOpen(true)
  }

  const handleConfirmExport = () => {
    setExportPreviewOpen(false)
    const exportFn = exportFnMap[pendingExportType]
    const result = validateLayout(placements, block)
    if (result.valid) {
      exportFn()
    } else {
      pendingExportRef.current = exportFn
      setValidationProblems(result.problems)
      setValidationDialogOpen(true)
    }
  }

  const handleOpenImportPicker = () => {
    importInputRef.current?.click()
  }

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.currentTarget.value = ""
    if (!file) return
    try {
      const layout = await parseImportedLayoutFile(file)
      const result = importLayout(layout)
      if (!result.ok) {
        toast.error("导入失败：未找到匹配框体")
        return
      }
      if (result.skipped > 0) {
        toast.success(`导入完成：已放置 ${result.applied} 项，跳过 ${result.skipped} 项`)
      } else {
        toast.success(`导入完成：已放置 ${result.applied} 项`)
      }
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : "文件格式错误"}`)
    }
  }

  const iconTrigger =
    "inline-flex size-9 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-muted hover:text-foreground focus:bg-transparent focus:text-foreground/65 focus-visible:bg-muted focus-visible:text-foreground data-[pressed]:not-data-popup-open:bg-transparent data-[pressed]:not-data-popup-open:text-foreground/65 data-popup-open:bg-muted data-popup-open:text-foreground data-popup-open:focus:bg-muted data-popup-open:focus:text-foreground [&>svg+svg]:hidden"

  return (
    <div ref={barRef} className="flex items-center gap-0.5">
      <NavigationMenu className="flex-none" side="top" sideOffset={16}>
        <NavigationMenuList className="gap-0">
          <NavigationMenuItem>
            <NavigationMenuTrigger id="tour-m-materials" className={iconTrigger} aria-label="材质">
              <Pipette className="size-4" strokeWidth={2.2} />
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="flex flex-col gap-2 p-2">
                <div className="inline-flex rounded-md border border-border p-0.5">
                  <button
                    onClick={() => setMaterialTarget("block")}
                    className={cn(
                      "rounded-[5px] px-2 py-1 text-xs transition-colors",
                      materialTarget === "block"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    框体
                  </button>
                  <button
                    onClick={() => setMaterialTarget("item")}
                    className={cn(
                      "rounded-[5px] px-2 py-1 text-xs transition-colors",
                      materialTarget === "item"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    收纳件
                  </button>
                </div>
                <ColorPicker
                  value={materialTarget === "block" ? blockColorId : itemColorId}
                  onChange={materialTarget === "block" ? setBlockColor : setItemColor}
                />
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuTrigger id="tour-m-export" className={iconTrigger} aria-label="导入导出">
              <ArrowUpDown className="size-4" strokeWidth={2.2} />
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="flex min-w-[180px] flex-col gap-1 p-2">
                <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground">导出</div>
                <button
                  onClick={() => openExportPreview("model")}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出模型（ZIP）
                </button>
                <button
                  onClick={() => openExportPreview("shopping")}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出购物清单（XLSX）
                </button>
                <button
                  onClick={() => openExportPreview("all")}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  全部导出（ZIP）
                </button>
                <button
                  onClick={() => openExportPreview("layout")}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出布局（JSON）
                </button>
                <div className="my-1 h-px bg-border" />
                <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground">导入</div>
                <button
                  onClick={handleOpenImportPicker}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导入布局（JSON）
                </button>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      <NavigationMenu
        className="flex-none"
        side="top"
        sideOffset={16}
        positionerClassName="!left-4 !right-4 !w-auto max-w-none"
        popupClassName="!w-full"
      >
        <NavigationMenuList className="gap-0">
          <NavigationMenuItem>
            <NavigationMenuTrigger id="tour-m-presets" className={iconTrigger} aria-label="套装">
              <Layers className="size-4" strokeWidth={2.2} />
            </NavigationMenuTrigger>
            <NavigationMenuContent className="p-1">
              <PresetSelector
                onSelect={setActivePreset}
                maxWidth={presetPanelMaxWidth}
              />
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      <div className="mx-px h-3.5 w-px bg-border" />

      <button
        id="tour-m-delete-btn"
        onClick={handleDelete}
        disabled={!selectedPlacementId}
        className="inline-flex size-9 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        aria-label="删除选中"
      >
        <Trash2 className="size-4" strokeWidth={2.2} />
      </button>
      <button
        id="tour-m-clear-btn"
        onClick={handleClear}
        disabled={count === 0}
        className="inline-flex size-9 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
        aria-label="清空"
      >
        <Eraser className="size-4" strokeWidth={2.2} />
      </button>

      <PresetDialog
        preset={activePreset}
        open={!!activePreset}
        onOpenChange={(open) => !open && setActivePreset(null)}
      />

      <DeleteConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={() => {
          if (selectedPlacementId) removePlacement(selectedPlacementId)
          setConfirmDeleteOpen(false)
        }}
      />

      <Dialog.Root open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-[10000] w-[calc(100%-2rem)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-xl">
            <div className="p-4">
              <Dialog.Title className="text-sm font-semibold">确认清空</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                确认清空当前布局吗？此操作不可撤销。
              </Dialog.Description>
            </div>
            <div className="border-t border-border p-4">
              <div className="flex gap-2">
                <Dialog.Close className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                  取消
                </Dialog.Close>
                <button
                  onClick={() => {
                    clearAll()
                    setConfirmClearOpen(false)
                  }}
                  className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  确认清空
                </button>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <ExportPreviewDialog
        open={exportPreviewOpen}
        onOpenChange={setExportPreviewOpen}
        exportType={pendingExportType}
        block={block}
        placements={placements}
        onConfirmExport={handleConfirmExport}
      />

      <ValidationWarningDialog
        open={validationDialogOpen}
        onOpenChange={setValidationDialogOpen}
        problems={validationProblems}
        onForceExport={() => {
          setValidationDialogOpen(false)
          pendingExportRef.current?.()
          pendingExportRef.current = null
        }}
        onHighlight={() => {
          setProblemPlacementIds(validationProblems.map((p) => p.placementId))
          setValidationDialogOpen(false)
          pendingExportRef.current = null
        }}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />
    </div>
  )
}

function ViewportToolbar({ mobile }: { mobile?: boolean }) {
  const [activePreset, setActivePreset] = useState<Preset | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [materialTarget, setMaterialTarget] = useState<"block" | "item">("block")
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [validationProblems, setValidationProblems] = useState<LayoutProblem[]>([])
  const [validationDialogOpen, setValidationDialogOpen] = useState(false)
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false)
  const [pendingExportType, setPendingExportType] = useState<ExportType>("all")
  const pendingExportRef = useRef<(() => void) | null>(null)
  const setProblemPlacementIds = useEditorStore((s) => s.setProblemPlacementIds)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [presetPanelMaxWidth, setPresetPanelMaxWidth] = useState(720)
  const blockColorId = useEditorStore((s) => s.blockColorId)
  const itemColorId = useEditorStore((s) => s.itemColorId)
  const block = useEditorStore((s) => s.block)
  const placements = useEditorStore((s) => s.placements)
  const selectedPlacementId = useEditorStore((s) => s.selectedPlacementId)
  const setBlockColor = useEditorStore((s) => s.setBlockColor)
  const setItemColor = useEditorStore((s) => s.setItemColor)
  const clearAll = useEditorStore((s) => s.clearAll)
  const removePlacement = useEditorStore((s) => s.removePlacement)
  const importLayout = useEditorStore((s) => s.importLayout)
  const count = useEditorStore((s) => s.placements.length)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const viewportEl = toolbarRef.current?.closest<HTMLElement>("[id='tour-viewport']")
    if (!viewportEl) return

    const update = () => {
      const rect = viewportEl.getBoundingClientRect()
      const left = rect.left + 16
      setPresetPanelMaxWidth(Math.max(320, viewportEl.clientWidth - 32))
      document.documentElement.style.setProperty("--preset-panel-left", `${left}px`)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewportEl)
    return () => observer.disconnect()
  }, [])

  const handleDelete = () => {
    if (!selectedPlacementId) return
    setConfirmDeleteOpen(true)
  }

  const handleClear = () => {
    if (count === 0) return
    setConfirmClearOpen(true)
  }

  const exportFnMap: Record<ExportType, () => void | Promise<void>> = {
    layout: () => exportLayout(block, placements),
    model: () => exportModel(block, placements),
    shopping: () => exportShoppingXlsx(block, placements),
    all: () => exportAll(block, placements),
  }

  const openExportPreview = (type: ExportType) => {
    setPendingExportType(type)
    setExportPreviewOpen(true)
  }

  const handleConfirmExport = () => {
    setExportPreviewOpen(false)
    const exportFn = exportFnMap[pendingExportType]
    const result = validateLayout(placements, block)
    if (result.valid) {
      exportFn()
    } else {
      pendingExportRef.current = exportFn
      setValidationProblems(result.problems)
      setValidationDialogOpen(true)
    }
  }

  const handleOpenImportPicker = () => {
    importInputRef.current?.click()
  }

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.currentTarget.value = ""
    if (!file) return
    try {
      const layout = await parseImportedLayoutFile(file)
      const result = importLayout(layout)
      if (!result.ok) {
        toast.error("导入失败：未找到匹配框体")
        return
      }
      if (result.skipped > 0) {
        toast.success(`导入完成：已放置 ${result.applied} 项，跳过 ${result.skipped} 项`)
      } else {
        toast.success(`导入完成：已放置 ${result.applied} 项`)
      }
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : "文件格式错误"}`)
    }
  }

  if (mobile) return <MobileTopBar />

  const menus = (
    <>
      <NavigationMenu className="flex-none" sideOffset={14}>
        <NavigationMenuList className="justify-start">
          <NavigationMenuItem>
            <NavigationMenuTrigger id="tour-materials" className="h-8 px-2.5 text-xs">
              材质
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="flex flex-col gap-2 p-2">
                <div className="inline-flex rounded-md border border-border p-0.5">
                  <button
                    onClick={() => setMaterialTarget("block")}
                    className={cn(
                      "rounded-[5px] px-2 py-1 text-xs transition-colors",
                      materialTarget === "block"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    框体
                  </button>
                  <button
                    onClick={() => setMaterialTarget("item")}
                    className={cn(
                      "rounded-[5px] px-2 py-1 text-xs transition-colors",
                      materialTarget === "item"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    收纳件
                  </button>
                </div>
                <ColorPicker
                  value={materialTarget === "block" ? blockColorId : itemColorId}
                  onChange={materialTarget === "block" ? setBlockColor : setItemColor}
                />
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuTrigger id="tour-export" className="h-8 px-2.5 text-xs">
              导出
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="flex min-w-[180px] flex-col gap-1 p-2">
                <button
                  onClick={() => openExportPreview("layout")}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出布局（JSON）
                </button>
                <button
                  onClick={() => openExportPreview("model")}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出模型（ZIP）
                </button>
                <button
                  onClick={() => openExportPreview("shopping")}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出购物清单（XLSX）
                </button>
                <button
                  onClick={() => openExportPreview("all")}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  全部导出（ZIP）
                </button>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuTrigger id="tour-import" className="h-8 px-2.5 text-xs">
              导入
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="flex min-w-[180px] flex-col gap-1 p-2">
                <button
                  onClick={handleOpenImportPicker}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导入布局（JSON）
                </button>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      <NavigationMenu
        className="flex-none"
        sideOffset={14}
        positionerClassName="!left-(--preset-panel-left) !right-4 !w-auto max-w-none"
        popupClassName="!w-full"
      >
        <NavigationMenuList className="justify-start">
          <NavigationMenuItem>
            <NavigationMenuTrigger id="tour-presets" className="h-8 px-2.5 text-xs">
              套装
            </NavigationMenuTrigger>
            <NavigationMenuContent className="p-1">
              <PresetSelector
                onSelect={setActivePreset}
                maxWidth={presetPanelMaxWidth}
              />
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </>
  )

  return (
    <div
      ref={toolbarRef}
      data-viewport-chrome
      className={cn(
        VIEWPORT_CHROME,
        "flex w-full items-center gap-2 rounded-xl border border-border bg-background/80 px-1 py-1 backdrop-blur-md",
      )}
      onTouchStart={() => window.getSelection()?.removeAllRanges()}
    >
      <div className="flex min-w-0 flex-1 items-center">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {menus}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="default"
            onClick={() => setAboutOpen(true)}
            className="h-8 px-2.5 text-xs text-foreground hover:bg-accent hover:text-foreground"
            aria-label="关于"
          >
            <Info className="size-4" strokeWidth={2.2} />
            关于
          </Button>
          <Button
            id="tour-delete-btn"
            variant="ghost"
            size="default"
            onClick={handleDelete}
            disabled={!selectedPlacementId}
            className="h-8 px-2.5 text-xs text-foreground hover:bg-accent hover:text-foreground data-[disabled]:text-muted-foreground"
            title="删除选中"
            aria-label="删除选中"
          >
            <Trash2 className="size-4" strokeWidth={2.2} />
            删除
          </Button>
          <Button
            id="tour-clear-btn"
            variant="ghost"
            size="default"
            onClick={handleClear}
            disabled={count === 0}
            className="h-8 px-2.5 text-xs text-foreground hover:bg-accent hover:text-foreground data-[disabled]:text-muted-foreground"
          >
            <Eraser className="size-4" strokeWidth={2.2} />
            清空
          </Button>
        </div>
      </div>

      <PresetDialog
        preset={activePreset}
        open={!!activePreset}
        onOpenChange={(open) => !open && setActivePreset(null)}
      />
      <AboutLicenseDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      <DeleteConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={() => {
          if (selectedPlacementId) removePlacement(selectedPlacementId)
          setConfirmDeleteOpen(false)
        }}
      />

      <Dialog.Root open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-[10000] w-[calc(100%-2rem)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-xl">
            <div className="p-4">
              <Dialog.Title className="text-sm font-semibold">确认清空</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                确认清空当前布局吗？此操作不可撤销。
              </Dialog.Description>
            </div>
            <div className="border-t border-border p-4">
              <div className="flex gap-2">
                <Dialog.Close className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                  取消
                </Dialog.Close>
                <button
                  onClick={() => {
                    clearAll()
                    setConfirmClearOpen(false)
                  }}
                  className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  确认清空
                </button>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <ExportPreviewDialog
        open={exportPreviewOpen}
        onOpenChange={setExportPreviewOpen}
        exportType={pendingExportType}
        block={block}
        placements={placements}
        onConfirmExport={handleConfirmExport}
      />

      <ValidationWarningDialog
        open={validationDialogOpen}
        onOpenChange={setValidationDialogOpen}
        problems={validationProblems}
        onForceExport={() => {
          setValidationDialogOpen(false)
          pendingExportRef.current?.()
          pendingExportRef.current = null
        }}
        onHighlight={() => {
          setProblemPlacementIds(validationProblems.map((p) => p.placementId))
          setValidationDialogOpen(false)
          pendingExportRef.current = null
        }}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />
    </div>
  )
}

export function Viewport({ mobile }: { mobile?: boolean }) {
  const [fps, setFps] = useState<number | null>(null)
  const [memLabel, setMemLabel] = useState("--")
  const [draggingSku, setDraggingSku] = useState<string | null>(null)
  const [pointerPlacingActive, setPointerPlacingActive] = useState(false)
  const dragPlacedRef = useRef(false)
  const [blockLoadState, setBlockLoadState] = useState<{ loading: boolean; failed: boolean }>({
    loading: true,
    failed: false,
  })
  const { data: catalogData } = useCatalog()
  const setBlock = useEditorStore((s) => s.setBlock)
  const currentBlockSku = useEditorStore((s) => s.block.sku)
  const placementsCount = useEditorStore((s) => s.placements.length)
  const applyPreset = useEditorStore((s) => s.applyPreset)
  const selectedCatalogSku = useEditorStore((s) => s.selectedCatalogSku)
  const setHoveredCell = useEditorStore((s) => s.setHoveredCell)
  const placeItemBySku = useEditorStore((s) => s.placeItemBySku)
  const cameraRef = useRef<THREE.Camera | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const presetAppliedByQueryRef = useRef(false)
  const defaultBlockAppliedRef = useRef(false)
  const lastDragClientRef = useRef<{ x: number; y: number } | null>(null)
  const pointerPlaceStartRef = useRef<{ x: number; y: number } | null>(null)
  const pointerPlaceMovedRef = useRef(false)
  const viewportRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = viewportRootRef.current
    if (!root) return

    const blockNativeSelection = (event: Event) => {
      event.preventDefault()
    }

    root.addEventListener("selectstart", blockNativeSelection, true)
    root.addEventListener("contextmenu", blockNativeSelection, true)
    return () => {
      root.removeEventListener("selectstart", blockNativeSelection, true)
      root.removeEventListener("contextmenu", blockNativeSelection, true)
    }
  }, [])

  const bindSceneContext = (camera: THREE.Camera, canvas: HTMLCanvasElement) => {
    cameraRef.current = camera
    canvasRef.current = canvas
  }

  const handlePointerMissed = useCallback(() => {
    useEditorStore.getState().selectCatalogItem(null)
    useEditorStore.getState().selectPlacement(null)
  }, [])

  const resolveDropCell = useCallback((
    clientX: number,
    clientY: number,
    itemGridSize?: [number, number],
  ): [number, number] | null => {
    const camera = cameraRef.current
    const canvas = canvasRef.current
    if (!camera || !canvas) return null

    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = -((clientY - rect.top) / rect.height) * 2 + 1
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2)
    const point = new THREE.Vector3()
    const hit = raycaster.ray.intersectPlane(plane, point)
    if (!hit) return null

    const block = useEditorStore.getState().block
    const [innerW, innerD] = block.innerSize
    const [cols, rows] = block.cellGrid
    const ux = (point.x + innerW / 2) / CELL_SIZE
    const uz = (point.z + innerD / 2) / CELL_SIZE

    // Align by item centroid so dragged preview stays centered under pointer.
    const gw = itemGridSize?.[0] ?? 1
    const gd = itemGridSize?.[1] ?? 1
    const col = Math.round(ux - gw / 2)
    const row = Math.round(uz - gd / 2)
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null
    return [col, row]
  }, [])

  useEffect(() => {
    let activeSku: string | null = null
    let lastTouchClient: { x: number; y: number } | null = null
    let placedInCurrentDrag = false
    let mobileEndFallbackTimer: ReturnType<typeof setTimeout> | null = null

    const tryPlaceByClientPoint = (clientX: number, clientY: number) => {
      if (!activeSku || placedInCurrentDrag) return
      const item = findItemBySku(activeSku)
      const cell = resolveDropCell(clientX, clientY, item?.gridSize)
      logViewportDnD("tryPlaceByClientPoint", { activeSku, clientX, clientY, cell })
      if (!cell) return
      placeItemBySku(activeSku, cell[0], cell[1])
      placedInCurrentDrag = true
      dragPlacedRef.current = true
      logViewportDnD("placed", { sku: activeSku, cell, source: "client-point" })
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      if (!touch) return
      lastTouchClient = { x: touch.clientX, y: touch.clientY }
      const item = activeSku ? findItemBySku(activeSku) : undefined
      const cell = resolveDropCell(touch.clientX, touch.clientY, item?.gridSize)
      setHoveredCell(cell)
      logViewportDnD("touchmove", { x: touch.clientX, y: touch.clientY, cell })
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (mobileEndFallbackTimer) {
        clearTimeout(mobileEndFallbackTimer)
        mobileEndFallbackTimer = null
      }
      const endTouch = e.changedTouches[0]
      logViewportDnD("touchend", {
        activeSku,
        endTouch: endTouch ? { x: endTouch.clientX, y: endTouch.clientY } : null,
        lastTouchClient,
        hoveredCell: useEditorStore.getState().hoveredCell,
      })
      if (endTouch) {
        tryPlaceByClientPoint(endTouch.clientX, endTouch.clientY)
      } else if (lastTouchClient) {
        tryPlaceByClientPoint(lastTouchClient.x, lastTouchClient.y)
      } else {
        const hoveredCell = useEditorStore.getState().hoveredCell
        if (hoveredCell && activeSku && !placedInCurrentDrag) {
          placeItemBySku(activeSku, hoveredCell[0], hoveredCell[1])
          placedInCurrentDrag = true
          dragPlacedRef.current = true
        }
      }
      cleanupTouch()
      setDraggingSku(null)
      setHoveredCell(null)
    }

    const addTouchListeners = () => {
      window.addEventListener("touchmove", onTouchMove, { passive: false })
      window.addEventListener("touchend", onTouchEnd)
      window.addEventListener("touchcancel", onTouchEnd)
    }

    const cleanupTouch = () => {
      activeSku = null
      lastTouchClient = null
      if (mobileEndFallbackTimer) {
        clearTimeout(mobileEndFallbackTimer)
        mobileEndFallbackTimer = null
      }
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
      window.removeEventListener("touchcancel", onTouchEnd)
    }

    const onStart = (event: Event) => {
      const custom = event as CustomEvent<{ sku?: string }>
      if (custom.detail?.sku) {
        activeSku = custom.detail.sku
        placedInCurrentDrag = false
        dragPlacedRef.current = false
        lastTouchClient = null
        lastDragClientRef.current = null
        setDraggingSku(custom.detail.sku)
        addTouchListeners()
        logViewportDnD("dragItemStart event", { sku: custom.detail.sku, mobile })
      }
    }

    const onEnd = (event: Event) => {
      const custom = event as CustomEvent<{ clientX?: number; clientY?: number }>
      const endX = custom.detail?.clientX
      const endY = custom.detail?.clientY
      logViewportDnD("dragItemEnd event", {
        activeSku,
        endX,
        endY,
        lastDragClient: lastDragClientRef.current,
        lastTouchClient,
        placedInCurrentDrag,
        dragPlacedRef: dragPlacedRef.current,
        mobile,
      })

      const hasTouch = mobile || !!lastTouchClient
      if (hasTouch) {
        // Touch drag: dragend may fire before touchend; defer cleanup briefly.
        if (mobileEndFallbackTimer) clearTimeout(mobileEndFallbackTimer)
        mobileEndFallbackTimer = setTimeout(() => {
          if (
            !dragPlacedRef.current &&
            activeSku &&
            Number.isFinite(endX) &&
            Number.isFinite(endY)
          ) {
            tryPlaceByClientPoint(endX as number, endY as number)
          } else if (!dragPlacedRef.current && activeSku && lastDragClientRef.current) {
            tryPlaceByClientPoint(lastDragClientRef.current.x, lastDragClientRef.current.y)
          } else if (!dragPlacedRef.current && activeSku && lastTouchClient && !placedInCurrentDrag) {
            tryPlaceByClientPoint(lastTouchClient.x, lastTouchClient.y)
          }
          cleanupTouch()
          setDraggingSku(null)
          setHoveredCell(null)
        }, 120)
        return
      }
      cleanupTouch()
      setDraggingSku(null)
      setHoveredCell(null)
    }

    window.addEventListener(CUSTOM_EVENTS.dragItemStart, onStart as EventListener)
    window.addEventListener(CUSTOM_EVENTS.dragItemEnd, onEnd)
    return () => {
      window.removeEventListener(CUSTOM_EVENTS.dragItemStart, onStart as EventListener)
      window.removeEventListener(CUSTOM_EVENTS.dragItemEnd, onEnd)
      cleanupTouch()
    }
  }, [resolveDropCell, setHoveredCell, placeItemBySku, mobile])

  useEffect(() => {
    if (defaultBlockAppliedRef.current) return
    if (!catalogData || catalogData.blocks.length === 0) return

    const defaultBlock = catalogData.blocks.find((b) => b.isDefault) ?? catalogData.blocks[0]
    if (!defaultBlock) return

    // Initialize from backend-provided default block when editor is still empty.
    if (placementsCount === 0 && currentBlockSku !== defaultBlock.sku) {
      setBlock(defaultBlock)
    }
    defaultBlockAppliedRef.current = true
  }, [catalogData, currentBlockSku, placementsCount, setBlock])

  useEffect(() => {
    if (presetAppliedByQueryRef.current) return
    if (!catalogData) return
    presetAppliedByQueryRef.current = true

    const setParam = new URLSearchParams(window.location.search).get("set")
    if (!setParam) return

    const byId = catalogData.presets.find((p) => p.id === setParam)
    const index = Number(setParam)
    const byIndex = Number.isInteger(index) && index > 0
      ? catalogData.presets[index - 1]
      : undefined
    const target = byId ?? byIndex

    if (!target) {
      toast.error(`未找到套装：${setParam}`)
      return
    }
    applyPreset(target)
    setPresetQueryParam(target.id)
    toast.success(`已加载套装：${target.name}`)
  }, [applyPreset, catalogData])

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    lastDragClientRef.current = { x: e.clientX, y: e.clientY }
    const activeSku = draggingSku ||
      e.dataTransfer.getData(DATA_TRANSFER_TYPE) ||
      e.dataTransfer.getData("text/plain")
    const item = activeSku ? findItemBySku(activeSku) : undefined
    const cell = resolveDropCell(e.clientX, e.clientY, item?.gridSize)
    setHoveredCell(cell)
    logViewportDnD("dragover", { x: e.clientX, y: e.clientY, cell, draggingSku })
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const sku = draggingSku ||
      e.dataTransfer.getData(DATA_TRANSFER_TYPE) ||
      e.dataTransfer.getData("text/plain")
    if (!sku) {
      setHoveredCell(null)
      return
    }
    const item = findItemBySku(sku)
    const cell = resolveDropCell(e.clientX, e.clientY, item?.gridSize)
    logViewportDnD("drop", { sku, x: e.clientX, y: e.clientY, cell, draggingSku })
    if (!cell) {
      setHoveredCell(null)
      setDraggingSku(null)
      return
    }
    placeItemBySku(sku, cell[0], cell[1])
    dragPlacedRef.current = true
    logViewportDnD("placed", { sku, cell, source: "drop" })
    lastDragClientRef.current = null
    setHoveredCell(null)
    setDraggingSku(null)
  }

  const handleMobileGhostMove = useCallback((clientX: number, clientY: number) => {
    if (!mobile || !selectedCatalogSku || draggingSku) return
    const item = findItemBySku(selectedCatalogSku)
    const cell = resolveDropCell(clientX, clientY, item?.gridSize)
    setHoveredCell(cell)
  }, [mobile, selectedCatalogSku, draggingSku, resolveDropCell, setHoveredCell])

  const handleMobileGhostRelease = useCallback((clientX: number, clientY: number) => {
    if (!mobile || !selectedCatalogSku || draggingSku) return
    const item = findItemBySku(selectedCatalogSku)
    const cell = resolveDropCell(clientX, clientY, item?.gridSize)
    if (!cell) {
      setHoveredCell(null)
      return
    }
    placeItemBySku(selectedCatalogSku, cell[0], cell[1])
    setHoveredCell(null)
  }, [mobile, selectedCatalogSku, draggingSku, resolveDropCell, placeItemBySku, setHoveredCell])

  const cameraFov = mobile ? 50 : 45
  const cameraPosition: [number, number, number] = mobile
    ? [0, 260, 200]
    : [0, 360, 280]

  return (
    <div
      ref={viewportRootRef}
      id="tour-viewport"
      className={cn(
        "relative h-full w-full bg-[#faf9f7] dark:bg-[#1a1a1a]",
        "select-none touch-none [-webkit-touch-callout:none] [&_*]:select-none",
      )}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={() => setHoveredCell(null)}
      onMouseDown={(e) => {
        if (mobile) return
        if (e.button !== 0) return
        if (!selectedCatalogSku || draggingSku) return
        setPointerPlacingActive(true)
        pointerPlaceStartRef.current = { x: e.clientX, y: e.clientY }
        pointerPlaceMovedRef.current = false
      }}
      onMouseMove={(e) => {
        if (mobile) {
          if (e.buttons !== 1) return
          handleMobileGhostMove(e.clientX, e.clientY)
          return
        }
        if (!pointerPlacingActive || !selectedCatalogSku || draggingSku) return
        const start = pointerPlaceStartRef.current
        if (start) {
          const dx = e.clientX - start.x
          const dy = e.clientY - start.y
          if (dx * dx + dy * dy > 16) {
            pointerPlaceMovedRef.current = true
          }
        }
        if (!pointerPlaceMovedRef.current) return
        const item = selectedCatalogSku ? findItemBySku(selectedCatalogSku) : undefined
        const cell = resolveDropCell(e.clientX, e.clientY, item?.gridSize)
        setHoveredCell(cell)
      }}
      onMouseUp={(e) => {
        if (mobile) {
          handleMobileGhostRelease(e.clientX, e.clientY)
          return
        }
        if (!pointerPlacingActive) return
        if (pointerPlaceMovedRef.current && selectedCatalogSku && !draggingSku) {
          const item = findItemBySku(selectedCatalogSku)
          const cell = resolveDropCell(e.clientX, e.clientY, item?.gridSize)
          if (cell) {
            placeItemBySku(selectedCatalogSku, cell[0], cell[1])
          }
        }
        setPointerPlacingActive(false)
        pointerPlaceStartRef.current = null
        pointerPlaceMovedRef.current = false
        setHoveredCell(null)
      }}
      onMouseLeave={() => {
        if (mobile || !pointerPlacingActive) return
        setPointerPlacingActive(false)
        pointerPlaceStartRef.current = null
        pointerPlaceMovedRef.current = false
        setHoveredCell(null)
      }}
      onTouchStart={() => {
        window.getSelection()?.removeAllRanges()
      }}
      onTouchMove={(e) => {
        window.getSelection()?.removeAllRanges()
        if (!mobile) return
        const touch = e.touches[0]
        if (!touch) return
        handleMobileGhostMove(touch.clientX, touch.clientY)
      }}
      onTouchEnd={(e) => {
        if (!mobile) return
        const touch = e.changedTouches[0]
        if (!touch) return
        handleMobileGhostRelease(touch.clientX, touch.clientY)
      }}
    >
      <UnifiedPreviewCanvas
        camera={{ fov: cameraFov, position: cameraPosition, near: 10, far: 1200 }}
        onPointerMissed={handlePointerMissed}
      >
        <Scene
          previewSku={draggingSku}
          dragging={!!draggingSku || pointerPlacingActive}
          mobile={mobile}
          onBlockLoadStateChange={setBlockLoadState}
        />
        <SceneBridge onReady={bindSceneContext} />
        <FpsTracker onUpdate={(f, m) => { setFps(f); setMemLabel(m) }} />
      </UnifiedPreviewCanvas>
      {blockLoadState.loading && (
        <div className={cn(VIEWPORT_OVERLAY, "absolute inset-x-0 top-1/2 z-[90] flex -translate-y-1/2 justify-center")}>
          <div className="rounded-md bg-black/35 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
            框体加载中...
          </div>
        </div>
      )}
      {blockLoadState.failed && (
        <div className={cn(VIEWPORT_OVERLAY, "absolute inset-x-0 top-1/2 z-[90] flex -translate-y-1/2 justify-center")}>
          <div className="rounded-md bg-red-600/80 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
            框体加载失败，请刷新重试
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-3 top-3">
        <ViewportToolbar mobile={mobile} />
      </div>
      <ViewportHUD />
      <div className={cn(VIEWPORT_OVERLAY, "absolute top-15 right-4 text-[10px] text-muted-foreground/25")} inert>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span>FPS: {fps ?? "--"}</span>
          <span title="Chromium: JS heap MB; iOS Safari: WebGL texture/geo counts">Mem: {memLabel}</span>
          <span>{APP_PAGE_TITLE} by {APP_AUTHOR_NAME} · {APP_LICENSE_NAME}</span>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[10000] w-[calc(100%-2rem)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-xl">
          <div className="p-4">
            <Dialog.Title className="text-sm font-semibold">确认删除</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              确认删除选中的收纳件吗？
            </Dialog.Description>
          </div>
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <Dialog.Close className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                取消
              </Dialog.Close>
              <button
                onClick={onConfirm}
                className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                确认删除
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AboutLicenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[10000] flex max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          <div className="shrink-0 p-4 pb-0">
            <Dialog.Title className="text-sm font-semibold">关于与许可说明</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              模型文件采用 {APP_LICENSE_NAME} 许可协议，可商用，但需保留署名。
            </Dialog.Description>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-foreground/90">
            <div className="space-y-2">
              <p>你可以自由复制、分发、改编和商业使用模型文件。</p>
              <p>使用时请保留以下署名信息：</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>作者：{APP_AUTHOR_NAME}</li>
                <li>项目：{APP_PAGE_TITLE}</li>
                <li>许可协议：{APP_LICENSE_NAME}</li>
              </ul>
              <p className="text-muted-foreground">
                推荐署名文案：基于 {APP_PAGE_TITLE} 模型，作者 {APP_AUTHOR_NAME}，协议 {APP_LICENSE_NAME}。
              </p>
              <p className="text-muted-foreground">
                协议详情：
                <a
                  href={APP_LICENSE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 underline underline-offset-2"
                >
                  {APP_LICENSE_URL}
                </a>
              </p>
            </div>
          </div>
          <div className="shrink-0 border-t border-border p-4">
            <div className="flex justify-end">
              <Dialog.Close className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                我知道了
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ValidationWarningDialog({
  open,
  onOpenChange,
  problems,
  onForceExport,
  onHighlight,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  problems: LayoutProblem[]
  onForceExport: () => void
  onHighlight: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[10000] flex max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          <div className="shrink-0 p-4 pb-0">
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 text-amber-500" />
              导出前提醒
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              以下组件的增高件缺少足够的侧面支撑，物品放入后可能不够稳固，存在倾倒风险。如果这是你的设计意图，可以点击"仍然导出"。
            </Dialog.Description>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-2">
              {problems.map((p) => (
                <div
                  key={p.placementId}
                  className="rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                >
                  <span className="font-medium">{p.itemName}</span>
                  <div className="mt-0.5 text-amber-600 dark:text-amber-500">
                    {p.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 border-t border-border p-4">
            <div className="flex gap-2">
              <button
                onClick={onHighlight}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                查看问题组件
              </button>
              <button
                onClick={onForceExport}
                className="flex-1 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                仍然导出
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type ExportType = "layout" | "model" | "shopping" | "all"

const EXPORT_LABELS: Record<ExportType, string> = {
  layout: "导出布局（JSON）",
  model: "导出模型（ZIP）",
  shopping: "导出购物清单（XLSX）",
  all: "全部导出（ZIP）",
}

function ExportPreviewDialog({
  open,
  onOpenChange,
  exportType,
  block,
  placements,
  onConfirmExport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exportType: ExportType
  block: BlockCatalogItem
  placements: Placement[]
  onConfirmExport: () => void
}) {
  const shoppingList = useMemo(() => {
    const counter = new Map<string, number>()
    for (const p of placements) {
      counter.set(p.sku, (counter.get(p.sku) ?? 0) + 1)
    }
    return Array.from(counter.entries()).map(([sku, qty]) => ({
      sku,
      name: getItemNameBySku(sku),
      qty,
    }))
  }, [placements])

  const totalItems = placements.length

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[10000] flex max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          <div className="shrink-0 p-4 pb-0">
            <Dialog.Title className="text-sm font-semibold">
              {EXPORT_LABELS[exportType]}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-muted-foreground">
              请确认导出内容
            </Dialog.Description>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-medium">框体</span>
                <span className="text-xs text-muted-foreground">{block.display_name}</span>
              </div>
              <div className="px-3 py-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium">组件清单</span>
                  <span className="text-xs text-muted-foreground">共 {totalItems} 件</span>
                </div>
                {shoppingList.length === 0 ? (
                  <div className="py-2 text-center text-xs text-muted-foreground">暂无组件</div>
                ) : (
                  <div className="space-y-1">
                    {shoppingList.map((item) => (
                      <div key={item.sku} className="flex items-center justify-between text-xs">
                        <span className="text-foreground/80">{item.name}</span>
                        <span className="tabular-nums text-muted-foreground">×{item.qty}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-border p-4">
            <div className="flex gap-2">
              <Dialog.Close className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                取消
              </Dialog.Close>
              <button
                onClick={onConfirmExport}
                disabled={totalItems === 0}
                className="flex-1 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                确认导出
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ViewportHUD() {
  const block = useEditorStore((s) => s.block)
  const placements = useEditorStore((s) => s.placements)

  const totalCells = block.cellGrid[0] * block.cellGrid[1]
  const usedCells = placements.reduce(
    (sum, p) => sum + p.gridSize[0] * p.gridSize[1],
    0,
  )

  return (
    <div className={cn(VIEWPORT_OVERLAY, "absolute bottom-3 left-3")} inert>
      <div className="rounded-lg bg-white/80 px-3 py-2 text-xs backdrop-blur-sm dark:bg-black/60">
        <div className="font-medium text-foreground">{block.display_name}</div>
        <div className="text-muted-foreground">
          {block.innerSize[0]}×{block.innerSize[1]}mm · Cell {usedCells}/
          {totalCells}
        </div>
      </div>
    </div>
  )
}
