import { useEffect, useState } from "react"
import { fetchCatalog, type CatalogData } from "@/api/catalog"
import type { BlockCatalogItem, CatalogItem, Preset } from "@/types/catalog"

let cache: CatalogData | null = null
let pending: Promise<CatalogData> | null = null

function load(): Promise<CatalogData> {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = fetchCatalog().then((data) => {
      cache = data
      pending = null
      return data
    })
  }
  return pending
}

export function useCatalog() {
  const [data, setData] = useState<CatalogData | null>(cache)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (cache) {
      setData(cache)
      return
    }
    let cancelled = false
    load()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e))
    return () => {
      cancelled = true
    }
  }, [])

  return { data, loading: !data && !error, error }
}

export function findItemBySku(sku: string): CatalogItem | undefined {
  return cache?.items.find((i) => i.sku === sku)
    ?? cache?.risers.find((r) => r.sku === sku)
}

export function findBlockBySku(sku: string): BlockCatalogItem | undefined {
  return cache?.blocks.find((b) => b.sku === sku)
}

export function findRiserBySku(sku: string): CatalogItem | undefined {
  return cache?.risers.find((r) => r.sku === sku)
}

export function getRisers(): CatalogItem[] {
  return cache?.risers ?? []
}

export function getPresets(): Preset[] {
  return cache?.presets ?? []
}

export async function preloadCatalog(): Promise<CatalogData> {
  return load()
}
