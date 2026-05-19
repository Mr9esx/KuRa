import * as THREE from "three"
import type { ThreeEvent } from "@react-three/fiber"
import type { BlockCatalogItem } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import { cellToWorld } from "@/lib/coordinates"
import { CELL_SIZE } from "@/config/catalog"

interface PlacedItemsProps {
  block: BlockCatalogItem
  placements: Placement[]
  color: string
  roughness: number
  selectedPlacementId: string | null
  onSelectPlacement: (id: string | null) => void
  onMovePlacement: (id: string, col: number, row: number) => void
  onDragPlacementChange: (id: string | null) => void
}

export function PlacedItems({
  block,
  placements,
  color,
  roughness,
  selectedPlacementId,
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

        return (
          <mesh
            key={p.id}
            position={[wx, p.height / 2, wz]}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              e.target.setPointerCapture(e.pointerId)
              onSelectPlacement(p.id)
              onDragPlacementChange(p.id)
            }}
            onPointerMove={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              const cell = toCellFromRay(e.ray)
              if (!cell) return
              onMovePlacement(p.id, cell[0], cell[1])
            }}
            onPointerUp={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              e.target.releasePointerCapture(e.pointerId)
              onDragPlacementChange(null)
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onSelectPlacement(p.id)
            }}
          >
            <boxGeometry args={[w, p.height, d]} />
            <meshStandardMaterial
              color={color}
              roughness={roughness}
              metalness={0}
              emissive={selectedPlacementId === p.id ? "#7aa2ff" : "#000000"}
              emissiveIntensity={selectedPlacementId === p.id ? 0.35 : 0}
            />
          </mesh>
        )
      })}
    </group>
  )
}
