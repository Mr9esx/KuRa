import type { BlockCatalogItem } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import { findItemBySku } from "@/hooks/use-catalog"
import { getMaxRiserHeight } from "./riser-rules"
import { getRiserHeightAtCell } from "@/stores/editor-store"

export interface LayoutProblem {
  placementId: string
  itemName: string
  reason: string
}

export interface LayoutValidationResult {
  valid: boolean
  problems: LayoutProblem[]
}

function isRiserPlacement(p: Placement): boolean {
  const cat = findItemBySku(p.sku)
  return cat?.type === "riser"
}

function getItemDisplayName(sku: string): string {
  const cat = findItemBySku(sku)
  return cat?.display_name ?? cat?.sku_name ?? sku
}

/**
 * Validate the entire layout at export time.
 *
 * For every non-riser item that sits on standalone risers,
 * check R7 (riser height < min directional constraint).
 */
export function validateLayout(
  placements: Placement[],
  block: BlockCatalogItem,
): LayoutValidationResult {
  const problems: LayoutProblem[] = []

  for (const p of placements) {
    if (isRiserPlacement(p)) continue

    const riserHeight = getRiserHeightAtCell(p.cell[0], p.cell[1], placements)
    if (riserHeight === 0) continue

    const maxAllowed = getMaxRiserHeight(p, placements, block)

    if (maxAllowed === 0) {
      problems.push({
        placementId: p.id,
        itemName: getItemDisplayName(p.sku),
        reason: "周围没有相邻物品或边框支撑，放入物品后可能倾倒",
      })
    } else if (riserHeight >= maxAllowed) {
      problems.push({
        placementId: p.id,
        itemName: getItemDisplayName(p.sku),
        reason: `增高 ${riserHeight}mm，超出周围支撑高度（${maxAllowed.toFixed(0)}mm），物品会露出框体，容易滑落`,
      })
    }
  }

  return {
    valid: problems.length === 0,
    problems,
  }
}
