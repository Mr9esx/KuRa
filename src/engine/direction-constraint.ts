import type { BlockCatalogItem } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import {
  FRONT_BORDER_NET,
  BACK_BORDER_NET,
  getSideWallHeight,
} from "./border-height"

function buildOccupancyMap(
  placements: Placement[],
): Map<string, Placement> {
  const map = new Map<string, Placement>()
  for (const p of placements) {
    for (let c = 0; c < p.gridSize[0]; c++) {
      for (let r = 0; r < p.gridSize[1]; r++) {
        map.set(`${p.cell[0] + c},${p.cell[1] + r}`, p)
      }
    }
  }
  return map
}

/**
 * For a multi-row item touching the side wall, use the most
 * conservative (smallest) side wall height — which is the first
 * (frontmost) row's trailing edge.
 */
function sideWallForItem(placement: Placement, block: BlockCatalogItem): number {
  const firstRow = placement.cell[1]
  return getSideWallHeight(firstRow, block)
}

/**
 * Get the constraint value for a single direction.
 * Returns the minimum height that restricts riser stacking in that direction.
 */
function getDirectionConstraint(
  placement: Placement,
  direction: "front" | "back" | "left" | "right",
  occupancy: Map<string, Placement>,
  block: BlockCatalogItem,
): number {
  const [col, row] = placement.cell
  const [gw, gh] = placement.gridSize
  const [bCols, bRows] = block.cellGrid

  const outsideCells: [number, number][] = []

  switch (direction) {
    case "front":
      if (row === 0) return FRONT_BORDER_NET
      for (let c = col; c < col + gw; c++) outsideCells.push([c, row - 1])
      break
    case "back":
      if (row + gh >= bRows) return BACK_BORDER_NET
      for (let c = col; c < col + gw; c++) outsideCells.push([c, row + gh])
      break
    case "left":
      if (col === 0) return sideWallForItem(placement, block)
      for (let r = row; r < row + gh; r++) outsideCells.push([col - 1, r])
      break
    case "right":
      if (col + gw >= bCols) return sideWallForItem(placement, block)
      for (let r = row; r < row + gh; r++) outsideCells.push([col + gw, r])
      break
  }

  let minHeight = Infinity
  let hasAny = false

  for (const [cc, cr] of outsideCells) {
    const neighbor = occupancy.get(`${cc},${cr}`)
    if (neighbor && neighbor.id !== placement.id) {
      hasAny = true
      if (neighbor.height < minHeight) minHeight = neighbor.height
    }
  }

  if (!hasAny) {
    if (outsideCells.length === 0) return 0
    const hasEmpty = outsideCells.some(([cc, cr]) => {
      const n = occupancy.get(`${cc},${cr}`)
      return !n || n.id === placement.id
    })
    if (hasEmpty) return 0
  }

  return minHeight === Infinity ? 0 : minHeight
}

export interface DirectionConstraints {
  front: number
  back: number
  left: number
  right: number
  min: number
}

export function getDirectionConstraints(
  placement: Placement,
  placements: Placement[],
  block: BlockCatalogItem,
): DirectionConstraints {
  const occupancy = buildOccupancyMap(placements)

  const front = getDirectionConstraint(placement, "front", occupancy, block)
  const back = getDirectionConstraint(placement, "back", occupancy, block)
  const left = getDirectionConstraint(placement, "left", occupancy, block)
  const right = getDirectionConstraint(placement, "right", occupancy, block)

  return {
    front,
    back,
    left,
    right,
    min: Math.min(front, back, left, right),
  }
}
