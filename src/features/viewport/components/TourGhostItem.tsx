import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Mesh, MeshStandardMaterial } from "three"
import { useEditorStore } from "@/stores/editor-store"
import { findItemBySku } from "@/hooks/use-catalog"
import { cellToWorld } from "@/lib/coordinates"
import { CELL_SIZE } from "@/config/catalog"

function PulsingBox({
  position,
  args,
  color,
}: {
  position: [number, number, number]
  args: [number, number, number]
  color: string
}) {
  const meshRef = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as MeshStandardMaterial
    const t = clock.getElapsedTime()
    mat.opacity = 0.25 + Math.sin(t * 3) * 0.15
  })

  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </mesh>
  )
}

function PlaceItemGhost() {
  const selectedSku = useEditorStore((s) => s.selectedCatalogSku)
  const block = useEditorStore((s) => s.block)

  const item = selectedSku ? findItemBySku(selectedSku) : null
  if (!item) return null

  const [innerW, innerD] = block.innerSize
  const [bCols, bRows] = block.cellGrid
  const col = Math.floor((bCols - item.gridSize[0]) / 2)
  const row = Math.floor((bRows - item.gridSize[1]) / 2)
  const [wx, wz] = cellToWorld(col, row, innerW, innerD, item.gridSize[0], item.gridSize[1])
  const w = item.gridSize[0] * CELL_SIZE - 1.5
  const d = item.gridSize[1] * CELL_SIZE - 1.5

  return (
    <PulsingBox
      position={[wx, item.height / 2, wz]}
      args={[w, item.height, d]}
      color="#3b82f6"
    />
  )
}

function SelectPlacedGhost() {
  const placements = useEditorStore((s) => s.placements)
  const block = useEditorStore((s) => s.block)

  const placement = placements[0]
  if (!placement) return null

  const [innerW, innerD] = block.innerSize
  const [wx, wz] = cellToWorld(
    placement.cell[0],
    placement.cell[1],
    innerW,
    innerD,
    placement.gridSize[0],
    placement.gridSize[1],
  )
  const w = placement.gridSize[0] * CELL_SIZE + 2
  const d = placement.gridSize[1] * CELL_SIZE + 2
  const h = placement.height + 2

  return (
    <PulsingBox
      position={[wx, h / 2, wz]}
      args={[w, h, d]}
      color="#22c55e"
    />
  )
}

function MovePlacedGhost() {
  const placements = useEditorStore((s) => s.placements)
  const block = useEditorStore((s) => s.block)
  const snapshotRef = useRef<{
    pos: [number, number, number]
    size: [number, number, number]
  } | null>(null)

  const placement = placements[0]
  if (!placement) return null

  if (!snapshotRef.current) {
    const [innerW, innerD] = block.innerSize
    const [bCols, bRows] = block.cellGrid
    const [gw, gd] = placement.gridSize

    const midCol = (bCols - gw) / 2
    const midRow = (bRows - gd) / 2
    const targetCol = placement.cell[0] <= midCol
      ? Math.min(bCols - gw, placement.cell[0] + 2)
      : Math.max(0, placement.cell[0] - 2)
    const targetRow = placement.cell[1] <= midRow
      ? Math.min(bRows - gd, placement.cell[1] + 2)
      : Math.max(0, placement.cell[1] - 2)

    const [wx, wz] = cellToWorld(targetCol, targetRow, innerW, innerD, gw, gd)
    snapshotRef.current = {
      pos: [wx, placement.height / 2, wz],
      size: [gw * CELL_SIZE - 1.5, placement.height, gd * CELL_SIZE - 1.5],
    }
  }

  return (
    <PulsingBox
      position={snapshotRef.current.pos}
      args={snapshotRef.current.size}
      color="#f59e0b"
    />
  )
}

export function TourGhostItem() {
  const tourStepId = useEditorStore((s) => s.tourStepId)

  if (tourStepId === "place-item") return <PlaceItemGhost />
  if (tourStepId === "select-placed") return <SelectPlacedGhost />
  if (tourStepId === "move-placed") return <MovePlacedGhost />
  return null
}
