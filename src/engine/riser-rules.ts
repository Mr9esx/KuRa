import type { BlockCatalogItem } from "@/types/catalog"
import type { Placement, RiserLayer } from "@/types/editor"
import { getRiserTotalHeight } from "@/types/editor"
import { getDirectionConstraints } from "./direction-constraint"

export interface ValidationResult {
  valid: boolean
  reason?: string
}

/**
 * R7: Maximum allowed riser height for a placement (strict less-than).
 * Returns the min of the 4-direction constraints.
 */
export function getMaxRiserHeight(
  placement: Placement,
  placements: Placement[],
  block: BlockCatalogItem,
): number {
  const constraints = getDirectionConstraints(placement, placements, block)
  return constraints.min
}

/**
 * R5: Validate that a single riser layer fully covers the item's footprint
 * with no gaps, no overlaps, and all pieces at the same height.
 */
export function validateRiserLayer(
  layer: RiserLayer,
  placement: Placement,
): ValidationResult {
  if (layer.pieces.length === 0) {
    return { valid: false, reason: "增高层没有任何增高件" }
  }

  const heights = new Set(layer.pieces.map(() => layer.height))
  if (heights.size > 1) {
    return { valid: false, reason: "同层增高件必须等高" }
  }

  const [itemW, itemH] = placement.gridSize

  const neededCells = new Set<string>()
  for (let c = 0; c < itemW; c++) {
    for (let r = 0; r < itemH; r++) {
      neededCells.add(`${c},${r}`)
    }
  }

  const coveredCells = new Set<string>()
  for (const piece of layer.pieces) {
    for (let c = 0; c < piece.gridSize[0]; c++) {
      for (let r = 0; r < piece.gridSize[1]; r++) {
        const relCol = piece.cell[0] + c
        const relRow = piece.cell[1] + r
        const key = `${relCol},${relRow}`
        if (coveredCells.has(key)) {
          return { valid: false, reason: "增高件重叠" }
        }
        coveredCells.add(key)
      }
    }
  }

  for (const key of neededCells) {
    if (!coveredCells.has(key)) {
      return { valid: false, reason: "增高件未完全覆盖功能件底面" }
    }
  }
  for (const key of coveredCells) {
    if (!neededCells.has(key)) {
      return { valid: false, reason: "增高件超出功能件底面范围" }
    }
  }

  return { valid: true }
}

/**
 * Full R4-R8 validation for a placement's riser stack.
 */
export function validateRiserStack(
  placement: Placement,
  placements: Placement[],
  block: BlockCatalogItem,
): ValidationResult {
  if (placement.risers.length === 0) {
    return { valid: true }
  }

  // R5 + R6: each layer must fully cover and be internally valid
  for (const [i, layer] of placement.risers.entries()) {
    const result = validateRiserLayer(layer, placement)
    if (!result.valid) {
      return { valid: false, reason: `第 ${i + 1} 层: ${result.reason}` }
    }
  }

  // R7: total riser height < min(4-direction constraints)
  const totalHeight = getRiserTotalHeight(placement)
  const maxAllowed = getMaxRiserHeight(placement, placements, block)

  if (totalHeight >= maxAllowed) {
    return {
      valid: false,
      reason: `增高总高度 ${totalHeight}mm >= 约束值 ${maxAllowed.toFixed(1)}mm（需严格小于）`,
    }
  }

  return { valid: true }
}

/**
 * Find all placements whose riser validity depends on the target item.
 * Used to warn when removing/moving an item.
 */
export function getAffectedPlacements(
  targetId: string,
  placements: Placement[],
  block: BlockCatalogItem,
): Placement[] {
  const target = placements.find((p) => p.id === targetId)
  if (!target) return []

  const remaining = placements.filter((p) => p.id !== targetId)

  return remaining.filter((p) => {
    if (p.risers.length === 0) return false
    const result = validateRiserStack(p, remaining, block)
    return !result.valid
  })
}

/**
 * Auto-fill riser pieces to cover an item's footprint using 2x1 risers.
 * Pieces are placed in relative coordinates (0-based from item's origin).
 */
export function autoFillRiserPieces(
  _riserSku: string,
  riserGridSize: [number, number],
  itemGridSize: [number, number],
): { cell: [number, number]; gridSize: [number, number] }[] {
  const [itemW, itemH] = itemGridSize
  const [rW, rH] = riserGridSize
  const pieces: { cell: [number, number]; gridSize: [number, number] }[] = []
  const covered = new Set<string>()

  for (let r = 0; r < itemH; r += rH) {
    for (let c = 0; c < itemW; c += rW) {
      const fitW = Math.min(rW, itemW - c)
      const fitH = Math.min(rH, itemH - r)

      if (fitW === rW && fitH === rH) {
        pieces.push({ cell: [c, r], gridSize: [rW, rH] })
        for (let dc = 0; dc < rW; dc++) {
          for (let dr = 0; dr < rH; dr++) {
            covered.add(`${c + dc},${r + dr}`)
          }
        }
      }
    }
  }

  // Fill remaining cells with 1x1 equivalent (same sku, just size 1x1)
  for (let r = 0; r < itemH; r++) {
    for (let c = 0; c < itemW; c++) {
      if (!covered.has(`${c},${r}`)) {
        pieces.push({ cell: [c, r], gridSize: [1, 1] })
        covered.add(`${c},${r}`)
      }
    }
  }

  return pieces
}
