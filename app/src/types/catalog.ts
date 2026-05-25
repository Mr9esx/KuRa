export interface CatalogItem {
  sku: string
  sku_name: string
  display_name?: string
  desc?: string
  order?: number
  /** @deprecated use sku_name/display_name instead */
  display?: string
  /** @deprecated use sku_name/display_name instead */
  name?: string
  type: "block" | "item" | "riser"
  categories: string[]
  gridSize: [number, number] // [cols, rows]
  height: number // mm
  modelPath?: string
  modelRotation?: [number, number, number] // Euler degrees [x, y, z]
  imagePath?: string
}

export interface BlockCatalogItem extends CatalogItem {
  type: "block"
  isDefault?: boolean
  innerSize: [number, number] // [width, depth] mm
  cellGrid: [number, number] // [cols, rows]
  modelPath: string
  imagePath: string
  /**
   * Extra back protrusion on the model (e.g. wall hook), in mm.
   * This part is excluded when fitting model depth to logical block depth.
   */
  modelBackHookDepth?: number
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
