import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { useEditorStore } from "@/stores/editor-store"
import { useThemeStore } from "@/stores/theme-store"
import { useCatalog } from "@/hooks/use-catalog"
import { useTour } from "@/components/tour"
import { MobileActionBar } from "@/features/viewport"
import { Skeleton } from "@/components/ui/skeleton"
import { CircleHelp } from "lucide-react"
import { TOUR_STORAGE_KEY } from "@/config/tour"
import type { CatalogItem } from "@/types/catalog"
import { cn } from "@/lib/utils"

function groupByCategory(items: CatalogItem[], activeCategory: string) {
  const groups: { category: string; items: CatalogItem[] }[] = []
  const groupMap = new Map<string, CatalogItem[]>()
  for (const item of items) {
    const targetCategories =
      activeCategory === "全部" ? item.categories : [activeCategory]
    for (const category of targetCategories) {
      const existing = groupMap.get(category)
      if (existing) {
        existing.push(item)
      } else {
        const list = [item]
        groupMap.set(category, list)
        groups.push({ category, items: list })
      }
    }
  }
  return groups
}

const emptyDragImage = (() => {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  return canvas
})()

function ThemeToggleButton() {
  const isDark = useThemeStore((s) => s.mode) === "dark"
  return (
    <button
      onClick={() => {
        const { mode, setMode } = useThemeStore.getState()
        setMode(mode === "dark" ? "light" : "dark")
      }}
      title={isDark ? "切换为明亮" : "切换为暗黑"}
      className="-mr-1.5 rounded-md p-1 text-foreground transition-colors hover:bg-muted"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
        <path d="M12 3l0 18" />
        <path d="M12 9l4.65 -4.65" />
        <path d="M12 14.3l7.37 -7.37" />
        <path d="M12 19.6l8.85 -8.85" />
      </svg>
    </button>
  )
}

function TourReplayButton() {
  const { startTour, setIsTourCompleted, isActive } = useTour()
  return (
    <button
      id="tour-replay"
      onClick={() => {
        if (isActive) return
        localStorage.removeItem(TOUR_STORAGE_KEY)
        setIsTourCompleted(false)
        setTimeout(() => startTour("main"), 50)
      }}
      title="功能引导"
      className="rounded-md p-1 text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
      aria-label="功能引导"
    >
      <CircleHelp className="size-[18px]" />
    </button>
  )
}

export { ThemeToggleButton, TourReplayButton }

interface CatalogPanelProps {
  narrow?: boolean
  mobile?: boolean
}

export function CatalogPanel({ narrow, mobile }: CatalogPanelProps) {
  const [category, setCategory] = useState<string>("全部")
  const [mobileTab, setMobileTab] = useState<"items" | "block">("items")
  const selectedSku = useEditorStore((s) => s.selectedCatalogSku)
  const selectItem = useEditorStore((s) => s.selectCatalogItem)
  const block = useEditorStore((s) => s.block)
  const setBlock = useEditorStore((s) => s.setBlock)
  const { data, loading, error } = useCatalog()

  // ── Mobile long-press drag ──
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null)
  const didDragRef = useRef(false)

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressOriginRef.current = null
  }, [])

  useEffect(() => cancelLongPress, [cancelLongPress])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, sku: string) => {
      const touch = e.touches[0]
      longPressOriginRef.current = { x: touch.clientX, y: touch.clientY }
      didDragRef.current = false

      longPressTimerRef.current = setTimeout(() => {
        didDragRef.current = true
        longPressTimerRef.current = null
        selectItem(null)
        window.dispatchEvent(
          new CustomEvent("risu:drag-item-start", { detail: { sku } }),
        )
      }, 300)
    },
    [selectItem],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!longPressOriginRef.current || !longPressTimerRef.current) return
      const touch = e.touches[0]
      const dx = touch.clientX - longPressOriginRef.current.x
      const dy = touch.clientY - longPressOriginRef.current.y
      if (dx * dx + dy * dy > 100) {
        cancelLongPress()
      }
    },
    [cancelLongPress],
  )

  const handleTouchEnd = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const handleMobileItemClick = useCallback(
    (sku: string) => {
      if (didDragRef.current) {
        didDragRef.current = false
        return
      }
      selectItem(sku)
    },
    [selectItem],
  )

  const handleDragStart = (e: DragEvent<HTMLButtonElement>, sku: string) => {
    e.dataTransfer.effectAllowed = "copy"
    e.dataTransfer.setData("application/x-risu-sku", sku)
    e.dataTransfer.setData("text/plain", sku)
    e.dataTransfer.setDragImage(emptyDragImage, 0, 0)
    window.dispatchEvent(
      new CustomEvent("risu:drag-item-start", { detail: { sku } }),
    )
  }

  const handleDragEnd = () => {
    window.dispatchEvent(new Event("risu:drag-item-end"))
  }

  const filteredItems = useMemo(() => {
    if (!data) return []
    return category === "全部"
      ? data.items
      : data.items.filter((item) => item.categories.includes(category))
  }, [category, data])

  const groups = useMemo(() => {
    if (!data) return []
    return groupByCategory(filteredItems, category)
  }, [category, data])
  const cols = narrow ? 1 : 2

  if (loading) {
    if (mobile) {
      return (
        <div className="flex h-full flex-col overflow-hidden border-t border-border bg-background">
          <div className="flex items-center gap-2 px-4 pt-2 pb-1">
            <div className="grid min-w-0 flex-1 grid-cols-2 rounded-xl border border-border p-1">
              <Skeleton className="h-7 rounded-lg" />
              <Skeleton className="h-7 rounded-lg" />
            </div>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="size-9 rounded-md" />
              ))}
            </div>
          </div>
          <div className="flex gap-2 px-4 pt-3 pb-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-16 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="grid gap-2 px-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-2">
                <Skeleton className="mb-1.5 aspect-square w-full rounded-md" />
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="mt-1 h-2.5 w-1/2 rounded" />
              </div>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className={cn(
        "flex h-full flex-col border-r border-border bg-background",
        narrow ? "w-56" : "w-72",
      )}>
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-16 rounded" />
            <Skeleton className="size-7 rounded-md" />
          </div>
          <div className="mt-4">
            <Skeleton className="mb-2 h-3 w-12 rounded" />
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-14 rounded-md" />
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Skeleton className="mb-2 h-3 w-16 rounded" />
            <div className="flex gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-12 rounded-full" />
              ))}
            </div>
          </div>
        </div>
        <div className="px-4 pt-2">
          <Skeleton className="mb-2 h-3 w-10 rounded" />
          <div className={cn("grid gap-2", narrow ? "grid-cols-1" : "grid-cols-2")}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5">
                <Skeleton className="mb-2 aspect-square w-full rounded-md" />
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="mt-1 h-2.5 w-1/2 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={cn(
        "flex h-full items-center justify-center border-r border-border bg-background",
        mobile ? "w-full" : narrow ? "w-56" : "w-72",
      )}>
        <p className="text-xs text-destructive">目录加载失败</p>
      </div>
    )
  }

  const { blocks, categories } = data

  if (mobile) {
    return (
      <div className="flex h-full flex-col overflow-hidden border-t border-border bg-background">
        <div className="flex items-center gap-2 px-4 pt-2 pb-1">
          <div id="tour-m-block-picker" className="grid min-w-0 flex-1 grid-cols-2 rounded-xl border border-border p-1">
            <button
              onClick={() => setMobileTab("items")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                mobileTab === "items"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              收纳件
            </button>
            <button
              onClick={() => setMobileTab("block")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                mobileTab === "block"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              框体
            </button>
          </div>
          <MobileActionBar />
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div
            className={cn(
              "absolute inset-0 flex w-[200%] transition-transform duration-300 ease-out",
              mobileTab === "items" ? "translate-x-0" : "-translate-x-1/2",
            )}
          >
            <div className="flex w-1/2 flex-col">
              <div id="tour-m-categories" className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4 pb-3">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-colors",
                      category === cat
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div id="tour-m-catalog-items" className="catalog-scroll no-scrollbar flex-1 overflow-y-auto px-4 pb-4 pt-1">
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
                >
                  {filteredItems.map((item) => (
                    <button
                      key={item.sku}
                      onClick={() => handleMobileItemClick(item.sku)}
                      onTouchStart={(e) => handleTouchStart(e, item.sku)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      className={cn(
                        "group flex flex-col rounded-lg border p-2 text-left transition-all",
                        selectedSku === item.sku
                          ? "border-foreground bg-foreground/[0.03] ring-1 ring-foreground"
                          : "border-border hover:border-foreground/30 hover:bg-muted/50",
                      )}
                    >
                      <div className="mb-1.5 flex w-full aspect-square items-center justify-center rounded-md bg-muted/60">
                        <div
                          className={cn(
                            "rounded-sm transition-colors",
                            selectedSku === item.sku
                              ? "bg-foreground"
                              : "bg-foreground/20 group-hover:bg-foreground/30",
                          )}
                          style={{
                            width: `${Math.min(item.gridSize[0] * 18, 40)}px`,
                            height: `${Math.min(item.gridSize[1] * 18, 40)}px`,
                          }}
                        />
                      </div>
                      <div className="text-[11px] font-medium leading-tight">
                        {item.name}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {item.gridSize[0]}×{item.gridSize[1]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="catalog-scroll no-scrollbar w-1/2 overflow-y-auto px-4 pb-4">
              <div className="grid grid-cols-3 gap-2 pt-3">
                {blocks.map((b) => (
                  <button
                    key={b.sku}
                    onClick={() => setBlock(b)}
                    className={cn(
                      "rounded-lg border p-2 text-left transition-colors",
                      block.sku === b.sku
                        ? "border-foreground bg-foreground/[0.03] ring-1 ring-foreground"
                        : "border-border hover:border-foreground/30 hover:bg-muted/50",
                    )}
                  >
                    <div className="text-xs font-medium">{b.name}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {b.cellGrid[0]}×{b.cellGrid[1]}
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                切换框体会清空当前已放置的收纳件。
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "flex h-full flex-col border-r border-border bg-background transition-[width]",
      narrow ? "w-56" : "w-72",
    )}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">RiSu</span>
          <div className="flex items-center gap-0.5">
            <TourReplayButton />
            <ThemeToggleButton />
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">框体尺寸</div>
          <div id="tour-block-picker" className="inline-flex rounded-lg border border-border p-0.5">
            {blocks.map((b) => (
              <button
                key={b.sku}
                onClick={() => setBlock(b)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  block.sku === b.sku
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {b.cellGrid[0]}×{b.cellGrid[1]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">收纳件分类</div>
          <div id="tour-categories" className="no-scrollbar flex gap-1 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                  category === cat
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grouped items */}
      <div id="tour-catalog-items" className="catalog-scroll no-scrollbar flex-1 overflow-y-auto px-4 pb-4">
        {groups.map((group) => (
          <div key={group.category} className="mt-3 first:mt-1">
            <div className="pb-1.5 text-[11px] font-medium text-muted-foreground">
              {group.category}
            </div>
            <div className={cn("grid gap-2", cols === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {group.items.map((item) => (
                <button
                  key={item.sku}
                  onClick={() => selectItem(item.sku)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.sku)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "group flex flex-col rounded-lg border p-2.5 text-left transition-all",
                    selectedSku === item.sku
                      ? "border-foreground bg-foreground/[0.03] ring-1 ring-foreground"
                      : "border-border hover:border-foreground/30 hover:bg-muted/50",
                  )}
                >
                  <div className="mb-2 flex w-full aspect-square items-center justify-center rounded-md bg-muted/60">
                    <div
                      className={cn(
                        "rounded-sm transition-colors",
                        selectedSku === item.sku
                          ? "bg-foreground"
                          : "bg-foreground/20 group-hover:bg-foreground/30",
                      )}
                      style={{
                        width: `${Math.min(item.gridSize[0] * 24, 56)}px`,
                        height: `${Math.min(item.gridSize[1] * 24, 56)}px`,
                      }}
                    />
                  </div>
                  <div className="text-xs font-medium leading-tight">
                    {item.name}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {item.gridSize[0]}×{item.gridSize[1]} · H{item.height}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
