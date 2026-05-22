import type { BlockCatalogItem } from "@/types/catalog"

const BOTTOM_THICKNESS = 4
const SHELL_THICKNESS = 4
const FRONT_BORDER_TOTAL = 12
const BACK_BORDER_TOTAL = 72
const SLOPE_RANGE = BACK_BORDER_TOTAL - FRONT_BORDER_TOTAL // 60

export const FRONT_BORDER_NET = FRONT_BORDER_TOTAL - BOTTOM_THICKNESS // 8mm
export const BACK_BORDER_NET = BACK_BORDER_TOTAL - BOTTOM_THICKNESS // 68mm

/**
 * Side wall net height at a given row's trailing edge.
 *
 * Formula from design spec §2.4:
 *   inner width W = rows * 40 (mm)
 *   outer width  = W + 2 * SHELL_THICKNESS
 *   position d   = (row + 1) * 40 + SHELL_THICKNESS
 *   H_total      = FRONT_BORDER_TOTAL + SLOPE_RANGE / outerWidth * d
 *   H_net        = H_total - BOTTOM_THICKNESS
 */
export function getSideWallHeight(row: number, block: BlockCatalogItem): number {
  const innerWidth = block.cellGrid[1] * 40
  const outerWidth = innerWidth + 2 * SHELL_THICKNESS
  const d = (row + 1) * 40 + SHELL_THICKNESS
  const hTotal = FRONT_BORDER_TOTAL + (SLOPE_RANGE / outerWidth) * d
  return hTotal - BOTTOM_THICKNESS
}
