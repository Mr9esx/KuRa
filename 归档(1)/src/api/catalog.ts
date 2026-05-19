import type { BlockCatalogItem, CatalogItem, Preset } from "@/types/catalog"

const BASE = import.meta.env.BASE_URL

export async function fetchBlocks(): Promise<BlockCatalogItem[]> {
  const res = await fetch(`${BASE}data/blocks.json`)
  if (!res.ok) throw new Error(`Failed to fetch blocks: ${res.status}`)
  return res.json()
}

export async function fetchItems(): Promise<CatalogItem[]> {
  const res = await fetch(`${BASE}data/items.json`)
  if (!res.ok) throw new Error(`Failed to fetch items: ${res.status}`)
  return res.json()
}

export async function fetchPresets(): Promise<Preset[]> {
  const res = await fetch(`${BASE}data/presets.json`)
  if (!res.ok) throw new Error(`Failed to fetch presets: ${res.status}`)
  return res.json()
}

export interface CatalogData {
  blocks: BlockCatalogItem[]
  items: CatalogItem[]
  categories: string[]
  presets: Preset[]
}

export async function fetchCatalog(): Promise<CatalogData> {
  const [blocks, items, presets] = await Promise.all([
    fetchBlocks(),
    fetchItems(),
    fetchPresets(),
  ])
  const categories = [
    "全部",
    ...new Set(items.flatMap((i) => i.categories)),
  ]
  return { blocks, items, categories, presets }
}
