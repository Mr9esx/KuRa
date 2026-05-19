export interface CatalogItem {
  sku: string
  name: string
  type: "block" | "item" | "riser"
  categories: string[]
  gridSize: [number, number] // [cols, rows]
  height: number // mm
}

export interface BlockCatalogItem extends CatalogItem {
  type: "block"
  innerSize: [number, number] // [width, depth] mm
  cellGrid: [number, number] // [cols, rows]
}

export interface PresetPlacement {
  sku: string
  cell: [number, number]
}

export interface Preset {
  id: string
  name: string
  description: string
  image: string
  blockSku: string
  items: PresetPlacement[]
}
