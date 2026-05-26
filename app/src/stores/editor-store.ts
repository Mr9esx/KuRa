import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import type { BlockCatalogItem, Preset } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import { findBlockBySku, findItemBySku } from "@/hooks/use-catalog"
import { trackEvent } from "@/lib/analytics"

const FALLBACK_BLOCK: BlockCatalogItem = {
  sku: "41001",
  sku_name: "B-6x4-SHELL-框体",
  display_name: "6x4 标准框体",
  name: "B-6x4-SHELL-框体",
  type: "block",
  categories: ["基础框体"],
  gridSize: [6, 4],
  height: 72,
  innerSize: [240, 160],
  cellGrid: [6, 4],
  imagePath: "images/block/B-6x4-SHELL-框体.png",
  modelPath: "models/blocks/B-6x4-SHELL-框体.3mf",
  modelRotation: [90, 180, 0],
}

interface EditorState {
  block: BlockCatalogItem
  placements: Placement[]
  selectedCatalogSku: string | null
  selectedPlacementId: string | null
  placementDragActive: boolean
  hoveredCell: [number, number] | null
  materialColorId: string
  blockColorId: string
  itemColorId: string
  tourStepId: string | null
  problemPlacementIds: string[]
}

interface EditorActions {
  setBlock: (block: BlockCatalogItem) => void
  selectCatalogItem: (sku: string | null) => void
  selectPlacement: (id: string | null) => void
  setPlacementDragActive: (active: boolean) => void
  setHoveredCell: (cell: [number, number] | null) => void
  placeItem: (col: number, row: number) => void
  placeItemBySku: (sku: string, col: number, row: number) => void
  movePlacement: (id: string, col: number, row: number) => void
  removePlacement: (id: string) => void
  clearAll: () => void
  setMaterialColor: (id: string) => void
  setBlockColor: (id: string) => void
  setItemColor: (id: string) => void
  applyPreset: (preset: Preset) => void
  importLayout: (layout: {
    blockSku: string
    placements: Array<{ sku: string; cell: [number, number] }>
  }) => { ok: boolean; applied: number; skipped: number; reason?: string }
  setTourStepId: (id: string | null) => void
  setProblemPlacementIds: (ids: string[]) => void
}

function isRiserPlacement(p: Placement): boolean {
  const cat = findItemBySku(p.sku)
  return cat?.type === "riser"
}

function getOccupiedCells(placements: Placement[], excludeRisers = false): Set<string> {
  const set = new Set<string>()
  for (const p of placements) {
    if (excludeRisers && isRiserPlacement(p)) continue
    for (let c = 0; c < p.gridSize[0]; c++) {
      for (let r = 0; r < p.gridSize[1]; r++) {
        set.add(`${p.cell[0] + c},${p.cell[1] + r}`)
      }
    }
  }
  return set
}

export function canPlace(
  col: number,
  row: number,
  gridSize: [number, number],
  block: BlockCatalogItem,
  placements: Placement[],
  placingType?: "item" | "riser",
): boolean {
  const [bCols, bRows] = block.cellGrid
  if (col < 0 || row < 0) return false
  if (col + gridSize[0] > bCols || row + gridSize[1] > bRows) return false

  const isPlacingItem = placingType !== "riser"
  const occupied = getOccupiedCells(placements, isPlacingItem)
  for (let c = col; c < col + gridSize[0]; c++) {
    for (let r = row; r < row + gridSize[1]; r++) {
      if (occupied.has(`${c},${r}`)) return false
    }
  }
  return true
}

/**
 * Get the total riser height at a given cell from standalone riser placements.
 */
export function getRiserHeightAtCell(
  col: number,
  row: number,
  placements: Placement[],
): number {
  let total = 0
  for (const p of placements) {
    if (!isRiserPlacement(p)) continue
    const inCol = col >= p.cell[0] && col < p.cell[0] + p.gridSize[0]
    const inRow = row >= p.cell[1] && row < p.cell[1] + p.gridSize[1]
    if (inCol && inRow) total += p.height
  }
  return total
}

export const useEditorStore = create<EditorState & EditorActions>()(
  immer((set, get) => ({
    block: FALLBACK_BLOCK,
    placements: [],
    selectedCatalogSku: null,
    selectedPlacementId: null,
    placementDragActive: false,
    hoveredCell: null,
    materialColorId: "ivory",
    blockColorId: "ivory",
    itemColorId: "ivory",
    tourStepId: null,
    problemPlacementIds: [],

    setBlock: (block) =>
      set((state) => {
        const previousBlockSku = state.block.sku
        state.block = block
        state.placements = []
        state.hoveredCell = null
        state.selectedPlacementId = null
        state.placementDragActive = false
        if (previousBlockSku !== block.sku) {
          trackEvent("block_change", {
            from_block_sku: previousBlockSku,
            to_block_sku: block.sku,
          })
        }
      }),

    selectCatalogItem: (sku) =>
      set((state) => {
        const nextSku = state.selectedCatalogSku === sku ? null : sku
        state.selectedCatalogSku = nextSku
        if (state.selectedCatalogSku) {
          state.selectedPlacementId = null
          trackEvent("catalog_item_select", {
            sku: nextSku,
          })
        }
      }),

    selectPlacement: (id) =>
      set((state) => {
        state.selectedPlacementId = id
        if (id) {
          state.selectedCatalogSku = null
          const placement = state.placements.find((p) => p.id === id)
          if (placement) {
            trackEvent("placement_select", { sku: placement.sku })
          }
        }
      }),

    setPlacementDragActive: (active) =>
      set((state) => {
        state.placementDragActive = active
      }),

    setHoveredCell: (cell) =>
      set((state) => {
        state.hoveredCell = cell
      }),

    placeItem: (col, row) => {
      const { selectedCatalogSku, placeItemBySku } = get()
      if (!selectedCatalogSku) return
      placeItemBySku(selectedCatalogSku, col, row)
    },

    placeItemBySku: (sku, col, row) => {
      const { block, placements } = get()
      const item = findItemBySku(sku)
      if (!item) return
      const placingType = item.type === "riser" ? "riser" : "item"
      if (!canPlace(col, row, item.gridSize, block, placements, placingType)) return

      set((state) => {
        const id = crypto.randomUUID()
        state.placements.push({
          id,
          sku: item.sku,
          cell: [col, row],
          gridSize: item.gridSize,
          height: item.height,
          risers: [],
        })
        state.selectedPlacementId = id
        state.problemPlacementIds = []
      })
      trackEvent("item_place", {
        sku: item.sku,
        type: item.type,
        col,
        row,
        grid_cols: item.gridSize[0],
        grid_rows: item.gridSize[1],
      })
    },

    movePlacement: (id, col, row) => {
      const { block, placements } = get()
      const target = placements.find((p) => p.id === id)
      if (!target) return

      const others = placements.filter((p) => p.id !== id)
      const movingType = isRiserPlacement(target) ? "riser" : "item"
      if (!canPlace(col, row, target.gridSize, block, others, movingType)) return

      set((state) => {
        const current = state.placements.find((p) => p.id === id)
        if (!current) return
        current.cell = [col, row]
        state.problemPlacementIds = []
      })
      trackEvent("item_move", {
        placement_id: id,
        sku: target.sku,
        col,
        row,
      })
    },

    removePlacement: (id) =>
      set((state) => {
        const removed = state.placements.find((p) => p.id === id)
        state.placements = state.placements.filter((p) => p.id !== id)
        if (state.selectedPlacementId === id) {
          state.selectedPlacementId = null
        }
        state.placementDragActive = false
        state.problemPlacementIds = []
        if (removed) {
          trackEvent("item_remove", {
            placement_id: id,
            sku: removed.sku,
          })
        }
      }),

    clearAll: () =>
      set((state) => {
        const removedCount = state.placements.length
        state.placements = []
        state.hoveredCell = null
        state.selectedPlacementId = null
        state.placementDragActive = false
        state.problemPlacementIds = []
        if (removedCount > 0) {
          trackEvent("layout_clear", {
            removed_count: removedCount,
          })
        }
      }),

    setMaterialColor: (id) =>
      set((state) => {
        if (state.materialColorId !== id) {
          trackEvent("color_change", { target: "material", color_id: id })
        }
        state.materialColorId = id
      }),

    setBlockColor: (id) =>
      set((state) => {
        if (state.blockColorId !== id) {
          trackEvent("color_change", { target: "block", color_id: id })
        }
        state.blockColorId = id
      }),

    setItemColor: (id) =>
      set((state) => {
        if (state.itemColorId !== id) {
          trackEvent("color_change", { target: "item", color_id: id })
        }
        state.itemColorId = id
      }),

    applyPreset: (preset) => {
      const block = findBlockBySku(preset.blockSku)
      if (!block) return

      set((state) => {
        state.block = block
        state.selectedCatalogSku = null
        state.selectedPlacementId = null
        state.hoveredCell = null
        state.placements = preset.items.map((p) => {
          const item = findItemBySku(p.sku)
          return {
            id: crypto.randomUUID(),
            sku: p.sku,
            cell: p.cell,
            gridSize: item?.gridSize ?? [1, 1],
            height: item?.height ?? 20,
            risers: [],
          }
        })
      })
      const skuCounts: Record<string, number> = {}
      for (const p of preset.items) {
        skuCounts[p.sku] = (skuCounts[p.sku] ?? 0) + 1
      }
      trackEvent("preset_apply", {
        preset_id: preset.id,
        preset_name: preset.name,
        block_sku: preset.blockSku,
        items_count: preset.items.length,
        unique_skus: Object.keys(skuCounts).length,
        item_skus: skuCounts,
      })
    },

    importLayout: (layout) => {
      const block = findBlockBySku(layout.blockSku)
      if (!block) {
        return { ok: false, applied: 0, skipped: layout.placements.length, reason: "block-not-found" }
      }

      const nextPlacements: Placement[] = []
      let skipped = 0

      for (const p of layout.placements) {
        const item = findItemBySku(p.sku)
        if (!item) {
          skipped++
          continue
        }
        const placingType = item.type === "riser" ? "riser" : "item"
        if (!canPlace(p.cell[0], p.cell[1], item.gridSize, block, nextPlacements, placingType)) {
          skipped++
          continue
        }
        nextPlacements.push({
          id: crypto.randomUUID(),
          sku: item.sku,
          cell: p.cell,
          gridSize: item.gridSize,
          height: item.height,
          risers: [],
        })
      }

      set((state) => {
        state.block = block
        state.selectedCatalogSku = null
        state.selectedPlacementId = null
        state.hoveredCell = null
        state.placementDragActive = false
        state.problemPlacementIds = []
        state.placements = nextPlacements
      })

      const skuCounts: Record<string, number> = {}
      for (const p of nextPlacements) {
        skuCounts[p.sku] = (skuCounts[p.sku] ?? 0) + 1
      }
      trackEvent("layout_import", {
        block_sku: layout.blockSku,
        total_items: nextPlacements.length,
        unique_skus: Object.keys(skuCounts).length,
        item_skus: skuCounts,
        skipped_count: skipped,
      })

      return { ok: true, applied: nextPlacements.length, skipped }
    },

    setTourStepId: (id) =>
      set((state) => {
        state.tourStepId = id
      }),

    setProblemPlacementIds: (ids) =>
      set((state) => {
        state.problemPlacementIds = ids
      }),
  })),
)
