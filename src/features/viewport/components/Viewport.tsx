import { useRef, useEffect, useCallback, useState, type DragEvent } from "react"
import * as THREE from "three"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { Dialog } from "@base-ui/react/dialog"
import JSZip from "jszip"
import { saveAs } from "file-saver"
import { useEditorStore } from "@/stores/editor-store"
import { useThemeStore } from "@/stores/theme-store"
import { getMaterialColor, MATERIAL_COLORS } from "@/config/materials"
import { CELL_SIZE } from "@/config/catalog"
import { findItemBySku, useCatalog } from "@/hooks/use-catalog"
import { cn } from "@/lib/utils"
import type { Preset } from "@/types/catalog"
import { Trash2, ChevronLeft, ChevronRight, Eraser, Pipette, Upload, Layers } from "lucide-react"
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "@/components/ui/navigation-menu"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PresetDialog } from "@/features/catalog/components/PresetDialog"
import { BlockMesh } from "./BlockMesh"
import { CellGrid } from "./CellGrid"
import { PlacedItems } from "./PlacedItems"
import { GhostPreview } from "./GhostPreview"
import { ViewCube, cameraTweenRef } from "./ViewCube"

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
}: {
  previewSku: string | null
  dragging: boolean
  mobile?: boolean
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

  const blockMat = getMaterialColor(blockColorId)
  const itemMat = getMaterialColor(itemColorId)
  const activeSku = previewSku ?? selectedSku
  const selectedItem = activeSku ? findItemBySku(activeSku) : undefined
  const inPlacementMode = mobile && !!selectedSku
  const controlsEnabled = !dragging && !draggingPlacementId && !inPlacementMode

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

      <ambientLight intensity={isDark ? 0.45 : 0.65} />
      <directionalLight position={[200, 400, 150]} intensity={isDark ? 0.7 : 0.85} />
      <directionalLight position={[-100, 200, -200]} intensity={0.3} />

      <OrbitControls
        makeDefault
        minPolarAngle={deg(10)}
        maxPolarAngle={deg(80)}
        minDistance={mobile ? 100 : 150}
        maxDistance={800}
        enableDamping
        dampingFactor={0.1}
        target={[0, 0, 0]}
        enabled={controlsEnabled}
      />

      {/* Ground reference */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -4.5, 0]}>
        <planeGeometry args={[256, 256]} />
        <meshStandardMaterial color={isDark ? "#2a2a2a" : "#f0eeeb"} roughness={1} />
      </mesh>

      <BlockMesh block={block} color={blockMat.hex} roughness={blockMat.roughness} />
      <CellGrid
        block={block}
        onCellHover={setHoveredCell}
        onCellClick={handleCellClick}
      />
      <PlacedItems
        block={block}
        placements={placements}
        color={itemMat.hex}
        roughness={itemMat.roughness}
        selectedPlacementId={selectedPlacementId}
        onSelectPlacement={selectPlacement}
        onMovePlacement={movePlacement}
        onDragPlacementChange={setDraggingPlacementId}
      />

      <ViewCube />

      {hoveredCell && selectedItem && (
        <GhostPreview
          block={block}
          cell={hoveredCell}
          item={selectedItem}
          placements={placements}
        />
      )}
    </>
  )
}

function FpsTracker({ onUpdate }: { onUpdate: (fps: number) => void }) {
  const frames = useRef(0)
  const lastTime = useRef(performance.now())

  useFrame(() => {
    frames.current++
    const now = performance.now()
    const elapsed = now - lastTime.current
    if (elapsed >= 1000) {
      const fps = Math.round((frames.current * 1000) / elapsed)
      onUpdate(fps)
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
      <div className="w-max px-3 py-2 text-xs text-muted-foreground" style={{ maxWidth }}>
        套装加载中…
      </div>
    )
  }

  if (error || presets.length === 0) {
    return (
      <div className="w-max px-3 py-2 text-xs text-muted-foreground" style={{ maxWidth }}>
        暂无可用套装
      </div>
    )
  }

  return (
    <div className="relative inline-block w-max" style={{ maxWidth }}>
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
        className="no-scrollbar flex w-fit max-w-full overflow-x-auto overflow-y-hidden px-11 py-2"
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
  return (
    <div className="pointer-events-auto flex w-full items-center justify-between rounded-xl border border-border bg-background/80 px-3 py-1.5 backdrop-blur-md">
      <span className="text-sm font-semibold tracking-tight">RiSu</span>
      <button
        onClick={() => {
          const { mode, setMode } = useThemeStore.getState()
          setMode(mode === "dark" ? "light" : "dark")
        }}
        className="rounded-md p-1 text-foreground transition-colors hover:bg-muted"
        aria-label="切换主题"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          <path d="M12 3l0 18" />
          <path d="M12 9l4.65 -4.65" />
          <path d="M12 14.3l7.37 -7.37" />
          <path d="M12 19.6l8.85 -8.85" />
        </svg>
      </button>
    </div>
  )
}

export function MobileActionBar() {
  const [activePreset, setActivePreset] = useState<Preset | null>(null)
  const [materialTarget, setMaterialTarget] = useState<"block" | "item">("block")
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
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
  const count = placements.length

  useEffect(() => {
    if (!barRef.current) return
    const update = () => {
      if (!barRef.current) return
      setPresetPanelMaxWidth(Math.max(320, barRef.current.clientWidth - 24))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(barRef.current)
    return () => observer.disconnect()
  }, [])

  const handleClear = () => {
    if (count === 0) return
    setConfirmClearOpen(true)
  }

  const exportModelMock = () => {
    const payload = {
      type: "model-mock",
      exportedAt: new Date().toISOString(),
      block,
      placements,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    saveAs(blob, `risu-model-mock-${Date.now()}.json`)
  }

  const exportShoppingList = () => {
    const counter = new Map<string, number>()
    for (const p of placements) {
      counter.set(p.sku, (counter.get(p.sku) ?? 0) + 1)
    }
    const list = Array.from(counter.entries()).map(([sku, qty]) => ({
      sku,
      name: findItemBySku(sku)?.name ?? sku,
      qty,
    }))
    const payload = {
      type: "shopping-list-mock",
      exportedAt: new Date().toISOString(),
      block: { sku: block.sku, name: block.name },
      items: list,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    saveAs(blob, `risu-shopping-list-${Date.now()}.json`)
  }

  const exportAllMock = async () => {
    const zip = new JSZip()
    const model = {
      type: "model-mock",
      exportedAt: new Date().toISOString(),
      block,
      placements,
    }
    const counter = new Map<string, number>()
    for (const p of placements) {
      counter.set(p.sku, (counter.get(p.sku) ?? 0) + 1)
    }
    const shopping = {
      type: "shopping-list-mock",
      exportedAt: new Date().toISOString(),
      block: { sku: block.sku, name: block.name },
      items: Array.from(counter.entries()).map(([sku, qty]) => ({
        sku,
        name: findItemBySku(sku)?.name ?? sku,
        qty,
      })),
    }
    zip.file("model.mock.json", JSON.stringify(model, null, 2))
    zip.file("shopping-list.mock.json", JSON.stringify(shopping, null, 2))
    const blob = await zip.generateAsync({ type: "blob" })
    saveAs(blob, `risu-export-${Date.now()}.zip`)
  }

  const iconTrigger =
    "inline-flex size-8 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground [&>svg+svg]:hidden"

  return (
    <div ref={barRef} className="flex items-center gap-0.5">
      <NavigationMenu className="flex-none" side="top" sideOffset={10}>
        <NavigationMenuList className="gap-0">
          <NavigationMenuItem>
            <NavigationMenuTrigger className={iconTrigger} aria-label="材质">
              <Pipette className="size-4" />
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
            <NavigationMenuTrigger className={iconTrigger} aria-label="导出">
              <Upload className="size-4" />
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="flex min-w-[180px] flex-col gap-1 p-2">
                <button
                  onClick={exportModelMock}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出模型（Mock）
                </button>
                <button
                  onClick={exportShoppingList}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出购物清单（Mock）
                </button>
                <button
                  onClick={exportAllMock}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  全部导出（Mock）
                </button>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuTrigger className={iconTrigger} aria-label="套装">
              <Layers className="size-4" />
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
        onClick={() => selectedPlacementId && removePlacement(selectedPlacementId)}
        disabled={!selectedPlacementId}
        className="inline-flex size-8 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        aria-label="删除选中"
      >
        <Trash2 className="size-4" />
      </button>
      <button
        onClick={handleClear}
        disabled={count === 0}
        className="inline-flex size-8 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
        aria-label="清空"
      >
        <Eraser className="size-4" />
      </button>

      <PresetDialog
        preset={activePreset}
        open={!!activePreset}
        onOpenChange={(open) => !open && setActivePreset(null)}
      />

      <Dialog.Root open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold">确认清空</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-muted-foreground">
              确认清空当前布局吗？此操作不可撤销。
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted">
                取消
              </Dialog.Close>
              <button
                onClick={() => {
                  clearAll()
                  setConfirmClearOpen(false)
                }}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
              >
                确认清空
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function ViewportToolbar({ mobile }: { mobile?: boolean }) {
  const [activePreset, setActivePreset] = useState<Preset | null>(null)
  const [materialTarget, setMaterialTarget] = useState<"block" | "item">("block")
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
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
  const count = useEditorStore((s) => s.placements.length)

  useEffect(() => {
    if (!toolbarRef.current) return

    const update = () => {
      const toolbarEl = toolbarRef.current
      if (!toolbarEl) return
      const width = toolbarEl.clientWidth
      setPresetPanelMaxWidth(Math.max(320, width - 24))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(toolbarRef.current)
    return () => observer.disconnect()
  }, [])

  const handleClear = () => {
    if (count === 0) return
    setConfirmClearOpen(true)
  }

  const exportModelMock = () => {
    const payload = {
      type: "model-mock",
      exportedAt: new Date().toISOString(),
      block,
      placements,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    saveAs(blob, `risu-model-mock-${Date.now()}.json`)
  }

  const exportShoppingList = () => {
    const counter = new Map<string, number>()
    for (const p of placements) {
      counter.set(p.sku, (counter.get(p.sku) ?? 0) + 1)
    }
    const list = Array.from(counter.entries()).map(([sku, qty]) => ({
      sku,
      name: findItemBySku(sku)?.name ?? sku,
      qty,
    }))
    const payload = {
      type: "shopping-list-mock",
      exportedAt: new Date().toISOString(),
      block: { sku: block.sku, name: block.name },
      items: list,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    saveAs(blob, `risu-shopping-list-${Date.now()}.json`)
  }

  const exportAllMock = async () => {
    const zip = new JSZip()
    const model = {
      type: "model-mock",
      exportedAt: new Date().toISOString(),
      block,
      placements,
    }
    const counter = new Map<string, number>()
    for (const p of placements) {
      counter.set(p.sku, (counter.get(p.sku) ?? 0) + 1)
    }
    const shopping = {
      type: "shopping-list-mock",
      exportedAt: new Date().toISOString(),
      block: { sku: block.sku, name: block.name },
      items: Array.from(counter.entries()).map(([sku, qty]) => ({
        sku,
        name: findItemBySku(sku)?.name ?? sku,
        qty,
      })),
    }
    zip.file("model.mock.json", JSON.stringify(model, null, 2))
    zip.file("shopping-list.mock.json", JSON.stringify(shopping, null, 2))
    const blob = await zip.generateAsync({ type: "blob" })
    saveAs(blob, `risu-export-${Date.now()}.zip`)
  }

  if (mobile) return <MobileTopBar />

  const menus = (
    <>
      <NavigationMenu className="flex-none" sideOffset={14}>
        <NavigationMenuList className="justify-start">
          <NavigationMenuItem>
            <NavigationMenuTrigger className="h-8 px-2.5 text-xs">
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
            <NavigationMenuTrigger className="h-8 px-2.5 text-xs">
              导出
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="flex min-w-[180px] flex-col gap-1 p-2">
                <button
                  onClick={exportModelMock}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出模型（Mock）
                </button>
                <button
                  onClick={exportShoppingList}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  导出购物清单（Mock）
                </button>
                <button
                  onClick={exportAllMock}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  全部导出（Mock）
                </button>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuTrigger className="h-8 px-2.5 text-xs">
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
      className="pointer-events-auto flex w-full items-center gap-2 rounded-xl border border-border bg-background/80 px-1 py-1 backdrop-blur-md"
    >
      <div className="flex min-w-0 flex-1 items-center">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 py-0.5">
          {menus}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-1 py-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => selectedPlacementId && removePlacement(selectedPlacementId)}
            disabled={!selectedPlacementId}
            className="px-2 text-xs text-foreground hover:bg-accent hover:text-foreground data-[disabled]:text-muted-foreground"
            title="删除选中"
            aria-label="删除选中"
          >
            <Trash2 className="size-3" />
            删除
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={handleClear}
            disabled={count === 0}
            className="px-2 text-xs text-foreground hover:bg-accent hover:text-foreground data-[disabled]:text-muted-foreground"
          >
            <Eraser className="size-3" />
            清空
          </Button>
        </div>
      </div>

      <PresetDialog
        preset={activePreset}
        open={!!activePreset}
        onOpenChange={(open) => !open && setActivePreset(null)}
      />

      <Dialog.Root open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold">确认清空</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-muted-foreground">
              确认清空当前布局吗？此操作不可撤销。
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted">
                取消
              </Dialog.Close>
              <button
                onClick={() => {
                  clearAll()
                  setConfirmClearOpen(false)
                }}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
              >
                确认清空
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

export function Viewport({ mobile }: { mobile?: boolean }) {
  const [fps, setFps] = useState<number | null>(null)
  const [draggingSku, setDraggingSku] = useState<string | null>(null)
  const setHoveredCell = useEditorStore((s) => s.setHoveredCell)
  const placeItemBySku = useEditorStore((s) => s.placeItemBySku)
  const cameraRef = useRef<THREE.Camera | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const bindSceneContext = (camera: THREE.Camera, canvas: HTMLCanvasElement) => {
    cameraRef.current = camera
    canvasRef.current = canvas
  }

  const resolveDropCell = useCallback((clientX: number, clientY: number): [number, number] | null => {
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
    const col = Math.floor((point.x + innerW / 2) / CELL_SIZE)
    const row = Math.floor((point.z + innerD / 2) / CELL_SIZE)
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null
    return [col, row]
  }, [])

  useEffect(() => {
    let activeSku: string | null = null

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      const cell = resolveDropCell(touch.clientX, touch.clientY)
      setHoveredCell(cell)
    }

    const onTouchEnd = () => {
      const hoveredCell = useEditorStore.getState().hoveredCell
      if (hoveredCell && activeSku) {
        placeItemBySku(activeSku, hoveredCell[0], hoveredCell[1])
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
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
      window.removeEventListener("touchcancel", onTouchEnd)
    }

    const onStart = (event: Event) => {
      const custom = event as CustomEvent<{ sku?: string }>
      if (custom.detail?.sku) {
        activeSku = custom.detail.sku
        setDraggingSku(custom.detail.sku)
        addTouchListeners()
      }
    }

    const onEnd = () => {
      cleanupTouch()
      setDraggingSku(null)
      setHoveredCell(null)
    }

    window.addEventListener("risu:drag-item-start", onStart as EventListener)
    window.addEventListener("risu:drag-item-end", onEnd)
    return () => {
      window.removeEventListener("risu:drag-item-start", onStart as EventListener)
      window.removeEventListener("risu:drag-item-end", onEnd)
      cleanupTouch()
    }
  }, [resolveDropCell, setHoveredCell, placeItemBySku])

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    const cell = resolveDropCell(e.clientX, e.clientY)
    setHoveredCell(cell)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const sku = draggingSku ||
      e.dataTransfer.getData("application/x-risu-sku") ||
      e.dataTransfer.getData("text/plain")
    if (!sku) {
      setHoveredCell(null)
      return
    }
    const cell = resolveDropCell(e.clientX, e.clientY)
    if (!cell) {
      setHoveredCell(null)
      setDraggingSku(null)
      return
    }
    placeItemBySku(sku, cell[0], cell[1])
    setHoveredCell(null)
    setDraggingSku(null)
  }

  const cameraFov = mobile ? 50 : 45
  const cameraPosition: [number, number, number] = mobile
    ? [200, 180, 200]
    : [280, 250, 280]

  return (
    <div
      className="relative h-full w-full bg-[#faf9f7] dark:bg-[#1a1a1a]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={() => setHoveredCell(null)}
    >
      <Canvas
        camera={{ fov: cameraFov, position: cameraPosition, near: 1, far: 2000 }}
        gl={{ antialias: true }}
      >
        <Scene previewSku={draggingSku} dragging={!!draggingSku} mobile={mobile} />
        <SceneBridge onReady={bindSceneContext} />
        <FpsTracker onUpdate={setFps} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-3 top-3">
        <ViewportToolbar mobile={mobile} />
      </div>
      <ViewportHUD />
      <div className="pointer-events-none absolute top-16 right-4 text-xs text-muted-foreground/25">
        FPS: {fps ?? "--"}
      </div>
    </div>
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
    <div className="pointer-events-none absolute bottom-3 left-3">
      <div className="rounded-lg bg-white/80 px-3 py-2 text-xs backdrop-blur-sm dark:bg-black/60">
        <div className="font-medium text-foreground">{block.name}</div>
        <div className="text-muted-foreground">
          {block.innerSize[0]}×{block.innerSize[1]}mm · Cell {usedCells}/
          {totalCells}
        </div>
      </div>
    </div>
  )
}
