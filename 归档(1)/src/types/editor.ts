export interface Placement {
  id: string
  sku: string
  cell: [number, number] // [col, row]
  gridSize: [number, number]
  height: number // mm
}
