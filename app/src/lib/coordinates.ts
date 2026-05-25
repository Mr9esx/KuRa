import { CELL_SIZE } from "@/config/catalog"

export function cellToWorld(
  col: number,
  row: number,
  innerWidth: number,
  innerDepth: number,
  gridWidth: number = 1,
  gridDepth: number = 1,
): [number, number] {
  const x = (col + gridWidth / 2) * CELL_SIZE - innerWidth / 2
  const z = (row + gridDepth / 2) * CELL_SIZE - innerDepth / 2
  return [x, z]
}

export function worldToCell(
  wx: number,
  wz: number,
  innerWidth: number,
  innerDepth: number,
): [number, number] | null {
  const col = Math.floor((wx + innerWidth / 2) / CELL_SIZE)
  const row = Math.floor((wz + innerDepth / 2) / CELL_SIZE)
  if (col < 0 || row < 0) return null
  return [col, row]
}
