export interface MaterialColor {
  id: string
  name: string
  hex: string
  roughness: number
  metalness: number
}

export const MATERIAL_COLORS: MaterialColor[] = [
  { id: "ivory", name: "象牙白", hex: "#F5F0E8", roughness: 0.9, metalness: 0 },
  { id: "gray", name: "浅灰", hex: "#C8C4BC", roughness: 0.9, metalness: 0 },
  { id: "black", name: "黑", hex: "#2A2A2A", roughness: 0.9, metalness: 0 },
  { id: "pink", name: "粉", hex: "#E8C4C4", roughness: 0.9, metalness: 0 },
  { id: "blue", name: "蓝", hex: "#B4C8D8", roughness: 0.9, metalness: 0 },
  { id: "green", name: "绿", hex: "#B8D4C0", roughness: 0.9, metalness: 0 },
]

export function getMaterialColor(id: string): MaterialColor {
  return MATERIAL_COLORS.find((c) => c.id === id) ?? MATERIAL_COLORS[0]!
}
