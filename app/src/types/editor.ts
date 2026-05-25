export interface RiserPiece {
  sku: string
  cell: [number, number]
  gridSize: [number, number]
}

export interface RiserLayer {
  height: number
  pieces: RiserPiece[]
}

export interface Placement {
  id: string
  sku: string
  cell: [number, number] // [col, row]
  gridSize: [number, number]
  height: number // mm
  risers: RiserLayer[]
}

export function getRiserTotalHeight(placement: Placement): number {
  return placement.risers.reduce((sum, layer) => sum + layer.height, 0)
}
