import { useEffect, useMemo } from "react"
import * as THREE from "three"
import type { ThreeEvent } from "@react-three/fiber"
import { useLoader } from "@react-three/fiber"
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js"
import type { BlockCatalogItem } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import { getRiserTotalHeight } from "@/types/editor"
import { cellToWorld } from "@/lib/coordinates"
import { CELL_SIZE } from "@/config/catalog"
import { findItemBySku } from "@/hooks/use-catalog"
import { useEditorStore, getRiserHeightAtCell } from "@/stores/editor-store"
import { RiserStack } from "./RiserStack"

interface PlacedItemsProps {
  block: BlockCatalogItem
  placements: Placement[]
  color: string
  roughness: number
  mobile?: boolean
  selectedPlacementId: string | null
  draggingPlacementId: string | null
  onSelectPlacement: (id: string | null) => void
  onMovePlacement: (id: string, col: number, row: number) => void
  onDragPlacementChange: (id: string | null) => void
}

interface PlacementEventHandlers {
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void
  onPointerUp: (e: ThreeEvent<PointerEvent>) => void
  onPointerCancel: (e: ThreeEvent<PointerEvent>) => void
  onClick: (e: ThreeEvent<MouseEvent>) => void
}

interface PlacedModelProps {
  modelPath: string
  modelRotation?: [number, number, number]
  placement: Placement
  worldX: number
  worldZ: number
  yOffset: number
  color: string
  roughness: number
  clippingPlanes: THREE.Plane[]
  selected: boolean
  problem: boolean
  events: PlacementEventHandlers
}

const BLOCK_WALL_CLEARANCE = 0
const BLOCK_FLOOR_THICKNESS = 4

function PlacedModel({
  modelPath,
  modelRotation,
  placement,
  worldX,
  worldZ,
  yOffset,
  color,
  roughness,
  clippingPlanes,
  selected,
  problem,
  events,
}: PlacedModelProps) {
  const modelUrl = useMemo(() => {
    const base = import.meta.env.BASE_URL
    return `${base}${modelPath.replace(/^\//, "")}`
  }, [modelPath])
  const loaded = useLoader(ThreeMFLoader, modelUrl)
  const rotation = useMemo<[number, number, number]>(() => {
    const [rx, ry, rz] = modelRotation ?? [0, 0, 0]
    return [
      THREE.MathUtils.degToRad(rx),
      THREE.MathUtils.degToRad(ry),
      THREE.MathUtils.degToRad(rz),
    ]
  }, [modelRotation])
  const model = useMemo(() => {
    const cloned = loaded.clone(true)
    cloned.rotation.set(rotation[0], rotation[1], rotation[2])
    return cloned
  }, [loaded, rotation])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: 0,
        clippingPlanes,
        clipShadows: true,
        emissive: selected ? "#7aa2ff" : problem ? "#ffaa00" : "#000000",
        emissiveIntensity: selected ? 0.35 : problem ? 0.5 : 0,
      }),
    [color, roughness, clippingPlanes, selected, problem],
  )
  const { center, minY, size } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)
    return { center, minY: box.min.y, size }
  }, [model])

  const scale = useMemo<[number, number, number]>(() => {
    const targetW = placement.gridSize[0] * CELL_SIZE
    const targetD = placement.gridSize[1] * CELL_SIZE
    const targetH = placement.height
    const sx = size.x > 0 ? targetW / size.x : 1
    const sy = size.y > 0 ? targetH / size.y : 1
    const sz = size.z > 0 ? targetD / size.z : 1
    return [
      Number.isFinite(sx) ? sx : 1,
      Number.isFinite(sy) ? sy : 1,
      Number.isFinite(sz) ? sz : 1,
    ]
  }, [placement.gridSize, placement.height, size.x, size.y, size.z])

  useEffect(() => {
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.material = material
      obj.castShadow = true
      obj.receiveShadow = true
    })
  }, [material, model])

  useEffect(() => {
    return () => material.dispose()
  }, [material])

  return (
    <group
      position={[worldX, yOffset, worldZ]}
      scale={scale}
      onPointerDown={events.onPointerDown}
      onPointerMove={events.onPointerMove}
      onPointerUp={events.onPointerUp}
      onPointerCancel={events.onPointerCancel}
      onClick={events.onClick}
    >
      <primitive
        object={model}
        position={[-center.x, -minY, -center.z]}
      />
    </group>
  )
}

export function PlacedItems({
  block,
  placements,
  color,
  roughness,
  mobile,
  selectedPlacementId,
  draggingPlacementId,
  onSelectPlacement,
  onMovePlacement,
  onDragPlacementChange,
}: PlacedItemsProps) {
  const problemPlacementIds = useEditorStore((s) => s.problemPlacementIds)
  const selectedCatalogSku = useEditorStore((s) => s.selectedCatalogSku)
  const [innerW, innerD] = block.innerSize
  const [cols, rows] = block.cellGrid
  const clippingPlanes = useMemo(() => {
    const minX = -innerW / 2 + BLOCK_WALL_CLEARANCE
    const maxX = innerW / 2 - BLOCK_WALL_CLEARANCE
    const minZ = -innerD / 2 + BLOCK_WALL_CLEARANCE
    const maxZ = innerD / 2 - BLOCK_WALL_CLEARANCE
    return [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -minX),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxX),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -minZ),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), maxZ),
    ]
  }, [innerW, innerD])

  const toCellFromRay = (ray: THREE.Ray): [number, number] | null => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2)
    const point = new THREE.Vector3()
    const hit = ray.intersectPlane(plane, point)
    if (!hit) return null
    const col = Math.floor((point.x + innerW / 2) / CELL_SIZE)
    const row = Math.floor((point.z + innerD / 2) / CELL_SIZE)
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null
    return [col, row]
  }

  return (
    <group>
      {placements.map((p) => {
        const catalogItem = findItemBySku(p.sku)
        const [rawWx, rawWz] = cellToWorld(
          p.cell[0],
          p.cell[1],
          innerW,
          innerD,
          p.gridSize[0],
          p.gridSize[1],
        )
        const w = p.gridSize[0] * CELL_SIZE
        const d = p.gridSize[1] * CELL_SIZE
        const minX = -innerW / 2 + w / 2 + BLOCK_WALL_CLEARANCE
        const maxX = innerW / 2 - w / 2 - BLOCK_WALL_CLEARANCE
        const minZ = -innerD / 2 + d / 2 + BLOCK_WALL_CLEARANCE
        const maxZ = innerD / 2 - d / 2 - BLOCK_WALL_CLEARANCE
        const wx = minX <= maxX ? THREE.MathUtils.clamp(rawWx, minX, maxX) : rawWx
        const wz = minZ <= maxZ ? THREE.MathUtils.clamp(rawWz, minZ, maxZ) : rawWz
        const selected = selectedPlacementId === p.id
        const isProblem = problemPlacementIds.includes(p.id)
        const dragging = draggingPlacementId === p.id
        const isRiserItem = findItemBySku(p.sku)?.type === "riser"
        const passThrough = isRiserItem && !!selectedCatalogSku
        const events: PlacementEventHandlers = {
          onPointerDown: (e: ThreeEvent<PointerEvent>) => {
            if (passThrough) return
            e.stopPropagation()
            if (e.pointerType === "mouse" && e.button !== 0) return
            onSelectPlacement(p.id)
            const allowImmediateDrag =
              e.pointerType === "mouse" || (!!mobile && e.pointerType !== "mouse")
            if (!selected && !allowImmediateDrag) return
            const target = e.target as EventTarget & {
              setPointerCapture?: (pointerId: number) => void
              hasPointerCapture?: (pointerId: number) => boolean
              releasePointerCapture?: (pointerId: number) => void
            }
            target.setPointerCapture?.(e.pointerId)
            onDragPlacementChange(p.id)
            useEditorStore.getState().setPlacementDragActive(true)
          },
          onPointerMove: (e: ThreeEvent<PointerEvent>) => {
            if (passThrough) return
            e.stopPropagation()
            if (!dragging) return
            if (e.pointerType === "mouse" && (e.buttons & 1) !== 1) return
            const cell = toCellFromRay(e.ray)
            if (!cell) return
            onMovePlacement(p.id, cell[0], cell[1])
          },
          onPointerUp: (e: ThreeEvent<PointerEvent>) => {
            if (passThrough) return
            e.stopPropagation()
            const target = e.target as EventTarget & {
              setPointerCapture?: (pointerId: number) => void
              hasPointerCapture?: (pointerId: number) => boolean
              releasePointerCapture?: (pointerId: number) => void
            }
            if (target.hasPointerCapture?.(e.pointerId)) {
              target.releasePointerCapture?.(e.pointerId)
            }
            onDragPlacementChange(null)
            useEditorStore.getState().setPlacementDragActive(false)
          },
          onPointerCancel: (e: ThreeEvent<PointerEvent>) => {
            if (passThrough) return
            e.stopPropagation()
            const target = e.target as EventTarget & {
              setPointerCapture?: (pointerId: number) => void
              hasPointerCapture?: (pointerId: number) => boolean
              releasePointerCapture?: (pointerId: number) => void
            }
            if (target.hasPointerCapture?.(e.pointerId)) {
              target.releasePointerCapture?.(e.pointerId)
            }
            onDragPlacementChange(null)
            useEditorStore.getState().setPlacementDragActive(false)
          },
          onClick: (e: ThreeEvent<MouseEvent>) => {
            if (passThrough) return
            e.stopPropagation()
            onSelectPlacement(p.id)
          },
        }

        const isRiser = catalogItem?.type === "riser"
        const embeddedRiserHeight = getRiserTotalHeight(p)
        const standaloneRiserHeight = isRiser
          ? 0
          : getRiserHeightAtCell(p.cell[0], p.cell[1], placements)
        const yBase = BLOCK_FLOOR_THICKNESS + embeddedRiserHeight + standaloneRiserHeight

        if (catalogItem?.modelPath) {
          return (
            <group key={p.id}>
              {embeddedRiserHeight > 0 && (
                <RiserStack
                  placement={p}
                  worldX={wx}
                  worldZ={wz}
                  baseY={BLOCK_FLOOR_THICKNESS}
                  color={color}
                  roughness={roughness}
                />
              )}
              <PlacedModel
                modelPath={catalogItem.modelPath}
                modelRotation={catalogItem.modelRotation}
                placement={p}
                worldX={wx}
                worldZ={wz}
                yOffset={yBase}
                color={color}
                roughness={roughness}
                clippingPlanes={clippingPlanes}
                selected={selected}
                problem={isProblem}
                events={events}
              />
            </group>
          )
        }

        return (
          <group key={p.id}>
            {embeddedRiserHeight > 0 && (
              <RiserStack
                placement={p}
                worldX={wx}
                worldZ={wz}
                baseY={BLOCK_FLOOR_THICKNESS}
                color={color}
                roughness={roughness}
              />
            )}
            <mesh
              position={[wx, yBase + p.height / 2, wz]}
              onPointerDown={events.onPointerDown}
              onPointerMove={events.onPointerMove}
              onPointerUp={events.onPointerUp}
              onPointerCancel={events.onPointerCancel}
              onClick={events.onClick}
            >
              <boxGeometry args={[w, p.height, d]} />
              <meshStandardMaterial
                color={color}
                roughness={roughness}
                metalness={0}
                clippingPlanes={clippingPlanes}
                clipShadows
                emissive={selected ? "#7aa2ff" : isProblem ? "#ffaa00" : "#000000"}
                emissiveIntensity={selected ? 0.35 : isProblem ? 0.5 : 0}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
