import type { BlockCatalogItem } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import { cellToWorld } from "@/lib/coordinates"
import { CELL_SIZE } from "@/config/catalog"

interface PlacedItemsProps {
  block: BlockCatalogItem
  placements: Placement[]
  color: string
  roughness: number
}

export function PlacedItems({
  block,
  placements,
  color,
  roughness,
}: PlacedItemsProps) {
  const [innerW, innerD] = block.innerSize

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
          <mesh key={p.id} position={[wx, p.height / 2, wz]}>
            <boxGeometry args={[w, p.height, d]} />
            <meshStandardMaterial
              color={color}
              roughness={roughness}
              metalness={0}
            />
          </mesh>
        )
      })}
    </group>
  )
}
