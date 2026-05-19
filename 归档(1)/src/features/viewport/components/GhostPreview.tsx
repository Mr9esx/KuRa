import type { CatalogItem, BlockCatalogItem } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import { cellToWorld } from "@/lib/coordinates"
import { canPlace } from "@/stores/editor-store"
import { CELL_SIZE } from "@/config/catalog"

interface GhostPreviewProps {
  block: BlockCatalogItem
  cell: [number, number]
  item: CatalogItem
  placements: Placement[]
}

export function GhostPreview({
  block,
  cell,
  item,
  placements,
}: GhostPreviewProps) {
  const [innerW, innerD] = block.innerSize
  const valid = canPlace(cell[0], cell[1], item.gridSize, block, placements)

  const [wx, wz] = cellToWorld(
    cell[0],
    cell[1],
    innerW,
    innerD,
    item.gridSize[0],
    item.gridSize[1],
  )
  const w = item.gridSize[0] * CELL_SIZE - 1.5
  const d = item.gridSize[1] * CELL_SIZE - 1.5

  return (
    <mesh position={[wx, item.height / 2, wz]}>
      <boxGeometry args={[w, item.height, d]} />
      <meshStandardMaterial
        color={valid ? "#22c55e" : "#ef4444"}
        transparent
        opacity={valid ? 0.45 : 0.3}
        depthWrite={false}
      />
    </mesh>
  )
}
