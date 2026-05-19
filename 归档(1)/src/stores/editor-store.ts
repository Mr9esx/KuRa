import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import type { BlockCatalogItem, Preset } from "@/types/catalog"
import type { Placement } from "@/types/editor"
import { findItemBySku, findBlockBySku } from "@/hooks/use-catalog"
import { CELL_SIZE } from "@/config/catalog"

const FALLBACK_BLOCK: BlockCatalogItem = {
  sku: "41001",
  name: "标准主框体",
  type: "block",
  categories: ["框体"],
  gridSize: [6, 4],
  height: 72,
  innerSize: [240, 160],
  cellGrid: [6, 4],
}

interface EditorState {
  block: BlockCatalogItem
  placements: Placement[]
  selectedCatalogSku: string | null
  hoveredCell: [number, number] | null
  materialColorId: string
}

interface EditorActions {
  setBlock: (block: BlockCatalogItem) => void
  selectCatalogItem: (sku: string | null) => void
  setHoveredCell: (cell: [number, number] | null) => void
  placeItem: (col: number, row: number) => void
  removePlacement: (id: string) => void
  clearAll: () => void
  setMaterialColor: (id: string) => void
  applyPreset: (preset: Preset) => void
}

function getOccupiedCells(placements: Placement[]): Set<string> {
  const set = new Set<string>()
  for (const p of placements) {
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
): boolean {
  const [bCols, bRows] = block.cellGrid
  if (col < 0 || row < 0) return false
  if (col + gridSize[0] > bCols || row + gridSize[1] > bRows) return false

  const occupied = getOccupiedCells(placements)
  for (let c = col; c < col + gridSize[0]; c++) {
    for (let r = row; r < row + gridSize[1]; r++) {
      if (occupied.has(`${c},${r}`)) return false
    }
  }
  return true
}

export { CELL_SIZE }

export const useEditorStore = create<EditorState & EditorActions>()(
  immer((set, get) => ({
    block: FALLBACK_BLOCK,
    placements: [],
    selectedCatalogSku: null,
    hoveredCell: null,
    materialColorId: "ivory",

    setBlock: (block) =>
      set((state) => {
        state.block = block
        state.placements = []
        state.hoveredCell = null
      }),

    selectCatalogItem: (sku) =>
      set((state) => {
        state.selectedCatalogSku =
          state.selectedCatalogSku === sku ? null : sku
      }),

    setHoveredCell: (cell) =>
      set((state) => {
        state.hoveredCell = cell
      }),

    placeItem: (col, row) => {
      const { selectedCatalogSku, block, placements } = get()
      if (!selectedCatalogSku) return

      const item = findItemBySku(selectedCatalogSku)
      if (!item) return
      if (!canPlace(col, row, item.gridSize, block, placements)) return

      set((state) => {
        state.placements.push({
          id: crypto.randomUUID(),
          sku: item.sku,
          cell: [col, row],
          gridSize: item.gridSize,
          height: item.height,
        })
      })
    },

    removePlacement: (id) =>
      set((state) => {
        state.placements = state.placements.filter((p) => p.id !== id)
      }),

    clearAll: () =>
      set((state) => {
        state.placements = []
        state.hoveredCell = null
      }),

    setMaterialColor: (id) =>
      set((state) => {
        state.materialColorId = id
      }),

    applyPreset: (preset) => {
      const block = findBlockBySku(preset.blockSku)
      if (!block) return

      set((state) => {
        state.block = block
        state.selectedCatalogSku = null
        state.hoveredCell = null
        state.placements = preset.items.map((p) => {
          const item = findItemBySku(p.sku)
          return {
            id: crypto.randomUUID(),
            sku: p.sku,
            cell: p.cell,
            gridSize: item?.gridSize ?? [1, 1],
            height: item?.height ?? 20,
          }
        })
      })
    },
  })),
)
