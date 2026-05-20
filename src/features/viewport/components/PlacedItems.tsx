import { useEffect, useMemo } from "react"
import * as THREE from "three"
import type { ThreeEvent } from "@react-three/fiber"
import { useLoader } from "@react-three/fiber"
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js"
import type { BlockCatalogItem } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import { cellToWorld } from "@/lib/coordinates"
import { CELL_SIZE } from "@/config/catalog"
import { findItemBySku } from "@/hooks/use-catalog"

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
  onClick: (e: ThreeEvent<MouseEvent>) => void
}

interface PlacedModelProps {
  modelPath: string
  modelRotation?: [number, number, number]
  placement: Placement
  worldX: number
  worldZ: number
  color: string
  roughness: number
  selected: boolean
  events: PlacementEventHandlers
}

function PlacedModel({
  modelPath,
  modelRotation,
  placement,
  worldX,
  worldZ,
  color,
  roughness,
  selected,
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
        emissive: selected ? "#7aa2ff" : "#000000",
        emissiveIntensity: selected ? 0.35 : 0,
      }),
    [color, roughness, selected],
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
    const targetW = placement.gridSize[0] * CELL_SIZE - 1.5
    const targetD = placement.gridSize[1] * CELL_SIZE - 1.5
    const targetH = placement.height
    const sx = size.x > 0 ? targetW / size.x : Infinity
    const sy = size.y > 0 ? targetH / size.y : Infinity
    const sz = size.z > 0 ? targetD / size.z : Infinity
    const uniformScale = Math.min(sx, sy, sz)
    const safeScale = Number.isFinite(uniformScale) && uniformScale > 0
      ? uniformScale
      : 1
    return [safeScale, safeScale, safeScale]
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
      position={[worldX, 0, worldZ]}
      scale={scale}
      onPointerDown={events.onPointerDown}
      onPointerMove={events.onPointerMove}
      onPointerUp={events.onPointerUp}
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
  const [innerW, innerD] = block.innerSize
  const [cols, rows] = block.cellGrid

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
        const [wx, wz] = cellToWorld(
          p.cell[0],
          p.cell[1],
          innerW,
          innerD,
          p.gridSize[0],
          p.gridSize[1],
        )
        const w = p.gridSize[0] * CELL_SIZE - 1.5
        const d = p.gridSize[1] * CELL_SIZE - 1.5
        const selected = selectedPlacementId === p.id
        const dragging = draggingPlacementId === p.id
        const events: PlacementEventHandlers = {
          onPointerDown: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            if (e.pointerType === "mouse" && e.button !== 0) return
            onSelectPlacement(p.id)
            const allowImmediateDrag =
              e.pointerType === "mouse" || (!!mobile && e.pointerType !== "mouse")
            if (!selected && !allowImmediateDrag) return
            e.target.setPointerCapture(e.pointerId)
            onDragPlacementChange(p.id)
          },
          onPointerMove: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            if (!dragging) return
            if (e.pointerType === "mouse" && (e.buttons & 1) !== 1) return
            const cell = toCellFromRay(e.ray)
            if (!cell) return
            onMovePlacement(p.id, cell[0], cell[1])
          },
          onPointerUp: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            if (e.target.hasPointerCapture(e.pointerId)) {
              e.target.releasePointerCapture(e.pointerId)
            }
            onDragPlacementChange(null)
          },
          onClick: (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            onSelectPlacement(p.id)
          },
        }

        if (catalogItem?.modelPath) {
          return (
            <PlacedModel
              key={p.id}
              modelPath={catalogItem.modelPath}
              modelRotation={catalogItem.modelRotation}
              placement={p}
              worldX={wx}
              worldZ={wz}
              color={color}
              roughness={roughness}
              selected={selected}
              events={events}
            />
          )
        }

        return (
          <mesh
            key={p.id}
            position={[wx, p.height / 2, wz]}
            onPointerDown={events.onPointerDown}
            onPointerMove={events.onPointerMove}
            onPointerUp={events.onPointerUp}
            onClick={events.onClick}
          >
            <boxGeometry args={[w, p.height, d]} />
            <meshStandardMaterial
              color={color}
              roughness={roughness}
              metalness={0}
              emissive={selected ? "#7aa2ff" : "#000000"}
              emissiveIntensity={selected ? 0.35 : 0}
            />
          </mesh>
        )
      })}
    </group>
  )
}
