import type { BlockCatalogItem, CatalogItem, Preset } from "@/types/catalog"

const API_BASE = import.meta.env.VITE_API_BASE || ""

export async function fetchBlocks(): Promise<BlockCatalogItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/blocks`)
  if (!res.ok) throw new Error(`Failed to fetch blocks: ${res.status}`)
  return res.json()
}

export async function fetchItems(): Promise<CatalogItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/items`)
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
  const res = await fetch(`${API_BASE}/api/v1/presets`)
  if (!res.ok) throw new Error(`Failed to fetch presets: ${res.status}`)
  return res.json()
}

export async function fetchRisers(): Promise<CatalogItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/risers`)
  if (!res.ok) throw new Error(`Failed to fetch risers: ${res.status}`)
  return res.json()
}

export interface ItemCategoryConfig {
  name: string
  order: number
  items?: string[]
  risers?: string[]
}

export interface BlockCategoryConfig {
  name: string
  order: number
  blocks?: string[]
}

export async function fetchItemCategories(): Promise<ItemCategoryConfig[]> {
  const res = await fetch(`${API_BASE}/api/v1/categories?type=item`)
  if (!res.ok) throw new Error(`Failed to fetch item categories: ${res.status}`)
  return res.json()
}

export async function fetchBlockCategories(): Promise<BlockCategoryConfig[]> {
  const res = await fetch(`${API_BASE}/api/v1/categories?type=block`)
  if (!res.ok) throw new Error(`Failed to fetch block categories: ${res.status}`)
  return res.json()
}

export interface CatalogCategoryIndex {
  itemAndRiserSkus: string[]
  blockSkus: string[]
}

export interface CatalogData {
  blocks: BlockCatalogItem[]
  items: CatalogItem[]
  risers: CatalogItem[]
  categories: string[]
  itemCategories: string[]
  blockCategories: string[]
  categoryIndex: Record<string, CatalogCategoryIndex>
  presets: Preset[]
}

export async function fetchCatalog(): Promise<CatalogData> {
  const [blocks, items, risers, presets, itemCategoryConfigs, blockCategoryConfigs] = await Promise.all([
    fetchBlocks(),
    fetchItems(),
    fetchRisers(),
    fetchPresets(),
    fetchItemCategories(),
    fetchBlockCategories(),
  ])

  const itemSkus = new Set(items.map((i) => i.sku))
  const riserSkus = new Set(risers.map((r) => r.sku))
  const blockSkus = new Set(blocks.map((b) => b.sku))

  const itemCategoryIndexMap = new Map<
    string,
    { order: number; itemSkus: string[]; riserSkus: string[] }
  >()
  const blockCategoryIndexMap = new Map<
    string,
    { order: number; blockSkus: string[] }
  >()

  const ensureItemCategory = (name: string, order = Number.MAX_SAFE_INTEGER) => {
    const existing = itemCategoryIndexMap.get(name)
    if (existing) {
      if (order < existing.order) existing.order = order
      return existing
    }
    const next = { order, itemSkus: [] as string[], riserSkus: [] as string[] }
    itemCategoryIndexMap.set(name, next)
    return next
  }

  const ensureBlockCategory = (name: string, order = Number.MAX_SAFE_INTEGER) => {
    const existing = blockCategoryIndexMap.get(name)
    if (existing) {
      if (order < existing.order) existing.order = order
      return existing
    }
    const next = { order, blockSkus: [] as string[] }
    blockCategoryIndexMap.set(name, next)
    return next
  }

  for (const item of items) {
    for (const cat of item.categories) ensureItemCategory(cat).itemSkus.push(item.sku)
  }
  for (const riser of risers) {
    for (const cat of riser.categories) ensureItemCategory(cat).riserSkus.push(riser.sku)
  }
  for (const block of blocks) {
    for (const cat of block.categories) ensureBlockCategory(cat).blockSkus.push(block.sku)
  }

  for (const cfg of itemCategoryConfigs) {
    const entry = ensureItemCategory(cfg.name, cfg.order)
    entry.order = cfg.order
    if (cfg.items) entry.itemSkus = cfg.items.filter((sku) => itemSkus.has(sku))
    if (cfg.risers) entry.riserSkus = cfg.risers.filter((sku) => riserSkus.has(sku))
  }

  for (const cfg of blockCategoryConfigs) {
    const entry = ensureBlockCategory(cfg.name, cfg.order)
    entry.order = cfg.order
    if (cfg.blocks) entry.blockSkus = cfg.blocks.filter((sku) => blockSkus.has(sku))
  }

  const orderedItemCategories = Array.from(itemCategoryIndexMap.entries())
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
  const orderedBlockCategories = Array.from(blockCategoryIndexMap.entries())
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))

  const allCategoryNames = new Set([
    ...orderedItemCategories.map(([name]) => name),
    ...orderedBlockCategories.map(([name]) => name),
  ])

  const categoryIndex: Record<string, CatalogCategoryIndex> = {}
  for (const name of allCategoryNames) {
    const itemEntry = itemCategoryIndexMap.get(name)
    const blockEntry = blockCategoryIndexMap.get(name)
    const itemAndRiserSkus = Array.from(
      new Set([...(itemEntry?.itemSkus ?? []), ...(itemEntry?.riserSkus ?? [])]),
    )
    categoryIndex[name] = {
      itemAndRiserSkus,
      blockSkus: Array.from(new Set(blockEntry?.blockSkus ?? [])),
    }
  }

  const itemCategories = [
    "全部",
    ...orderedItemCategories
      .filter(([, entry]) => entry.itemSkus.length > 0 || entry.riserSkus.length > 0)
      .map(([name]) => name),
  ]
  const blockCategories = [
    "全部",
    ...orderedBlockCategories
      .filter(([, entry]) => entry.blockSkus.length > 0)
      .map(([name]) => name),
  ]

  return {
    blocks,
    items,
    risers,
    categories: itemCategories,
    itemCategories,
    blockCategories,
    categoryIndex,
    presets,
  }
}
