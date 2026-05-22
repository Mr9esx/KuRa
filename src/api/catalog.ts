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
  const rawItems = (await res.json()) as CatalogItem[]
  return rawItems
    .map((item, index) => ({
      ...item,
      order: Number.isFinite(item.order) ? item.order : index + 1,
    }))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.sku.localeCompare(b.sku))
}

export async function fetchPresets(): Promise<Preset[]> {
  const res = await fetch(`${BASE}data/presets.json`)
  if (!res.ok) throw new Error(`Failed to fetch presets: ${res.status}`)
  return res.json()
}

export async function fetchRisers(): Promise<CatalogItem[]> {
  const res = await fetch(`${BASE}data/risers.json`)
  if (!res.ok) throw new Error(`Failed to fetch risers: ${res.status}`)
  return res.json()
}

export interface CatalogData {
  blocks: BlockCatalogItem[]
  items: CatalogItem[]
  risers: CatalogItem[]
  categories: string[]
  presets: Preset[]
}

const MOCK_DELAY_MS = 300

export async function fetchCatalog(): Promise<CatalogData> {
  const [blocks, items, risers, presets] = await Promise.all([
    fetchBlocks(),
    fetchItems(),
    fetchRisers(),
    fetchPresets(),
    new Promise((r) => setTimeout(r, MOCK_DELAY_MS)),
  ])
  const categories = ["全部", ...new Set([...items, ...risers].flatMap((i) => i.categories))]
  return { blocks, items, risers, categories, presets }
}
