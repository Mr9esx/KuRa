import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { useEditorStore } from "@/stores/editor-store"
import { useThemeStore } from "@/stores/theme-store"
import { useCatalog } from "@/hooks/use-catalog"
import { MobileActionBar } from "@/features/viewport"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"
import { Dialog } from "@base-ui/react/dialog"
import { CircleHelp } from "lucide-react"
import { type BlockCatalogItem, type CatalogItem } from "@/types/catalog"
import { cn } from "@/lib/utils"
import { APP_PAGE_TITLE, APP_SOCIAL, CUSTOM_EVENTS, DATA_TRANSFER_TYPE } from "@/config/brand"
import { AppLogo } from "@/components/brand/app-logo"
import { TitleLogo } from "@/components/brand/title-logo"

const emptyDragImage = (() => {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  return canvas
})()

function logMobileDnD(...args: unknown[]) {
  if (!import.meta.env.DEV) return
  console.log("[catalog-mobile-dnd]", ...args)
}

function getItemImageSrc(item: CatalogItem): string | null {
  if (!item.imagePath) return null
  const base = import.meta.env.BASE_URL
  return `${base}${item.imagePath.replace(/^\//, "")}`
}

function getBlockImageSrc(block: BlockCatalogItem): string {
  const base = import.meta.env.BASE_URL
  return `${base}${block.imagePath.replace(/^\//, "")}`
}

function getSafeGridSize(item: CatalogItem): [number, number] {
  const x = Number(item.gridSize?.[0])
  const y = Number(item.gridSize?.[1])
  return [
    Number.isFinite(x) && x > 0 ? x : 1,
    Number.isFinite(y) && y > 0 ? y : 1,
  ]
}

function ThemeToggleButton() {
  const isDark = useThemeStore((s) => s.mode) === "dark"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            onClick={() => {
              const { mode, setMode } = useThemeStore.getState()
              setMode(mode === "dark" ? "light" : "dark")
            }}
            className="rounded-md p-1 text-foreground transition-colors hover:bg-muted"
          />
        }
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          <path d="M12 3l0 18" />
          <path d="M12 9l4.65 -4.65" />
          <path d="M12 14.3l7.37 -7.37" />
          <path d="M12 19.6l8.85 -8.85" />
        </svg>
      </TooltipTrigger>
      <TooltipContent>{isDark ? "切换为明亮" : "切换为暗黑"}</TooltipContent>
    </Tooltip>
  )
}

function TourReplayButton() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            id="tour-replay"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.tourReplay))
            }}
            className="rounded-md p-1 text-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="功能引导"
          />
        }
      >
        <CircleHelp className="size-[18px]" />
      </TooltipTrigger>
      <TooltipContent>功能引导</TooltipContent>
    </Tooltip>
  )
}

export { ThemeToggleButton, TourReplayButton }

interface CatalogPanelProps {
  narrow?: boolean
  mobile?: boolean
}

export function CatalogPanel({ narrow, mobile }: CatalogPanelProps) {
  const [category, setCategory] = useState<string>("全部")
  const [blockCategory, setBlockCategory] = useState<string>("全部")
  const [mobileTab, setMobileTab] = useState<"items" | "block">("items")
  const selectedSku = useEditorStore((s) => s.selectedCatalogSku)
  const selectItem = useEditorStore((s) => s.selectCatalogItem)
  const placementsCount = useEditorStore((s) => s.placements.length)
  const block = useEditorStore((s) => s.block)
  const setBlock = useEditorStore((s) => s.setBlock)
  const { data, loading, error } = useCatalog()
  const [confirmBlockChangeOpen, setConfirmBlockChangeOpen] = useState(false)
  const [pendingBlock, setPendingBlock] = useState<BlockCatalogItem | null>(null)
  const blockScrollRef = useRef<HTMLDivElement | null>(null)
  const [canScrollBlockLeft, setCanScrollBlockLeft] = useState(false)
  const [canScrollBlockRight, setCanScrollBlockRight] = useState(false)

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
      if (!touch) return
      logMobileDnD("touchstart", { sku, x: touch.clientX, y: touch.clientY })
      longPressOriginRef.current = { x: touch.clientX, y: touch.clientY }
      didDragRef.current = false

      longPressTimerRef.current = setTimeout(() => {
        didDragRef.current = true
        longPressTimerRef.current = null
        selectItem(null)
        logMobileDnD("longpress->dragItemStart", { sku })
        window.dispatchEvent(
          new CustomEvent(CUSTOM_EVENTS.dragItemStart, { detail: { sku } }),
        )
      }, 300)
    },
    [selectItem],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!longPressOriginRef.current || !longPressTimerRef.current) return
      const touch = e.touches[0]
      if (!touch) return
      const dx = touch.clientX - longPressOriginRef.current.x
      const dy = touch.clientY - longPressOriginRef.current.y
      if (dx * dx + dy * dy > 100) {
        logMobileDnD("touchmove cancel longpress", {
          x: touch.clientX,
          y: touch.clientY,
          dx,
          dy,
        })
        cancelLongPress()
      }
    },
    [cancelLongPress],
  )

  const handleTouchEnd = useCallback(() => {
    logMobileDnD("touchend")
    cancelLongPress()
  }, [cancelLongPress])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      if (!useEditorStore.getState().selectedCatalogSku) return
      useEditorStore.getState().selectCatalogItem(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

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
    e.dataTransfer.setData(DATA_TRANSFER_TYPE, sku)
    e.dataTransfer.setData("text/plain", sku)
    e.dataTransfer.setDragImage(emptyDragImage, 0, 0)
    window.dispatchEvent(
      new CustomEvent(CUSTOM_EVENTS.dragItemStart, { detail: { sku } }),
    )
    logMobileDnD("dragstart", { sku, x: e.clientX, y: e.clientY })
  }

  const handleDragEnd = (e: DragEvent<HTMLButtonElement>) => {
    logMobileDnD("dragend", { x: e.clientX, y: e.clientY })
    window.dispatchEvent(
      new CustomEvent(CUSTOM_EVENTS.dragItemEnd, {
        detail: { clientX: e.clientX, clientY: e.clientY },
      }),
    )
  }

  const handleBlockSelect = useCallback(
    (nextBlock: BlockCatalogItem) => {
      if (block.sku === nextBlock.sku) return
      if (placementsCount === 0) {
        setBlock(nextBlock)
        return
      }
      setPendingBlock(nextBlock)
      setConfirmBlockChangeOpen(true)
    },
    [block.sku, placementsCount, setBlock],
  )

  const confirmBlockChange = useCallback(() => {
    if (!pendingBlock) return
    setBlock(pendingBlock)
    setPendingBlock(null)
    setConfirmBlockChangeOpen(false)
  }, [pendingBlock, setBlock])

  const blockChangeDialog = (
    <Dialog.Root
      open={confirmBlockChangeOpen}
      onOpenChange={(open) => {
        setConfirmBlockChangeOpen(open)
        if (!open) setPendingBlock(null)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-4 shadow-xl">
          <Dialog.Title className="text-sm font-semibold">确认切换框体</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            你已摆放了一些收纳件。切换框体后，这些收纳件会被移除。确定继续吗？
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-muted">
              取消
            </Dialog.Close>
            <button
              onClick={confirmBlockChange}
              className="rounded-md bg-destructive px-4 py-2 text-sm text-white transition-opacity hover:opacity-90"
            >
              继续切换
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )

  const updateBlockScrollButtons = useCallback(() => {
    const el = blockScrollRef.current
    if (!el) return
    setCanScrollBlockLeft(el.scrollLeft > 4)
    setCanScrollBlockRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  const allItems = useMemo(() => {
    if (!data) return []
    return [...data.items, ...data.risers]
  }, [data])

  const filteredItems = useMemo(() => {
    if (!data) return []
    if (category === "全部") return allItems
    const skuSet = new Set(data.categoryIndex[category]?.itemAndRiserSkus ?? [])
    return allItems.filter((item) => skuSet.has(item.sku))
  }, [category, data, allItems])

  const groups = useMemo(() => {
    if (!data) return []
    if (category !== "全部") {
      return [{ category, items: filteredItems }]
    }
    const ordered = data.itemCategories.filter((cat) => cat !== "全部")
    return ordered
      .map((cat) => {
        const skuSet = new Set(data.categoryIndex[cat]?.itemAndRiserSkus ?? [])
        return {
          category: cat,
          items: allItems.filter((item) => skuSet.has(item.sku)),
        }
      })
      .filter((group) => group.items.length > 0)
  }, [allItems, category, data, filteredItems])

  const blockCategories = useMemo(() => {
    if (!data) return ["全部"]
    return data.blockCategories
  }, [data])

  const filteredBlocks = useMemo(() => {
    if (!data) return []
    if (blockCategory === "全部") return data.blocks
    const skuSet = new Set(data.categoryIndex[blockCategory]?.blockSkus ?? [])
    return data.blocks.filter((b) => skuSet.has(b.sku))
  }, [blockCategory, data])

  useEffect(() => {
    if (mobile) return
    updateBlockScrollButtons()
    const el = blockScrollRef.current
    if (!el) return
    const onScroll = () => updateBlockScrollButtons()
    el.addEventListener("scroll", onScroll, { passive: true })
    const observer = new ResizeObserver(updateBlockScrollButtons)
    observer.observe(el)
    return () => {
      el.removeEventListener("scroll", onScroll)
      observer.disconnect()
    }
  }, [filteredBlocks, mobile, updateBlockScrollButtons])

  const cols = narrow ? 1 : 2

  if (loading) {
    if (mobile) {
      return (
        <div className="flex flex-col overflow-hidden border-t border-border bg-background">
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
          <div className="h-[226px] px-4 pb-4 pt-2">
            <div className="flex gap-2 pb-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-16 shrink-0 rounded-full" />
              ))}
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border p-2">
                  <Skeleton className="mb-1.5 aspect-square w-full rounded-md" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                  <Skeleton className="mt-1 h-2.5 w-1/2 rounded" />
                </div>
              ))}
            </div>
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

  const { categories } = data

  if (mobile) {
    return (
      <div className="flex flex-col overflow-hidden border-t border-border bg-background">
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

        <div className="relative h-[226px] overflow-hidden">
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

              <div id="tour-m-catalog-items" className="no-scrollbar flex-1 overflow-x-auto overscroll-contain pl-4 pb-4 pt-1">
                <div className="flex h-full gap-2 pr-4">
                  {filteredItems.map((item, itemIndex) => (
                    (() => {
                      const imageSrc = getItemImageSrc(item)
                      const heightTag = Number.isFinite(item.height)
                        ? `高 ${(item.height / 10).toFixed(1).replace(/\.0$/, "")}cm`
                        : null
                      return (
                    <button
                      key={item.sku}
                      id={itemIndex === 0 ? "tour-first-item" : undefined}
                      onClick={() => handleMobileItemClick(item.sku)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item.sku)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, item.sku)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      className={cn(
                        "group flex h-full shrink-0 w-[110px] flex-col rounded-lg border p-2 text-left transition-all",
                        selectedSku === item.sku
                          ? "border-foreground bg-foreground/[0.03] ring-1 ring-foreground"
                          : "border-border hover:border-foreground/30 hover:bg-muted/50",
                      )}
                    >
                      <div className="relative mb-1.5 flex w-full aspect-square items-center justify-center rounded-md bg-muted/60">
                        {imageSrc ? (
                          <img
                            src={imageSrc}
                            alt={item.display_name}
                            className="h-full w-full rounded-md object-contain"
                            loading="lazy"
                          />
                        ) : (
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
                        )}
                        {heightTag ? (
                          <span className="pointer-events-none absolute right-1 bottom-1 rounded bg-background/90 px-1 py-0.5 text-[9px] font-medium leading-none text-muted-foreground/90 ring-1 ring-border/70 backdrop-blur-sm">
                            {heightTag}
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0 text-[11px] font-medium leading-tight">
                        {item.display_name}
                      </div>
                      {item.desc ? (
                        <div className="mt-0.5 min-h-[28px] line-clamp-2 text-[10px] leading-[1.35] text-muted-foreground/90">
                          {item.desc}
                        </div>
                      ) : null}
                    </button>
                      )
                    })()
                  ))}
                </div>
              </div>
            </div>

            <div className="catalog-scroll no-scrollbar w-1/2 overflow-y-auto overscroll-contain px-4 pb-4">
              <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-3">
                {blockCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setBlockCategory(cat)}
                    className={cn(
                      "shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-colors",
                      blockCategory === cat
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="no-scrollbar overflow-x-auto overscroll-contain px-0.5 py-1">
                <div className="flex gap-2">
                  {filteredBlocks.map((b) => (
                    (() => {
                      const imageSrc = getBlockImageSrc(b)
                      return (
                    <button
                      key={b.sku}
                      onClick={() => handleBlockSelect(b)}
                      className={cn(
                        "group flex shrink-0 w-[110px] flex-col rounded-lg border p-2 text-left transition-all",
                        block.sku === b.sku
                          ? "border-foreground bg-foreground/[0.03] ring-1 ring-foreground"
                          : "border-border hover:border-foreground/30 hover:bg-muted/50",
                      )}
                    >
                      <div className="mb-1.5 flex w-full aspect-square items-center justify-center rounded-md bg-muted/60">
                        <img
                          src={imageSrc}
                            alt={b.display_name}
                          className="h-full w-full rounded-md object-contain"
                          loading="lazy"
                        />
                      </div>
                      <div className="text-[11px] font-medium leading-tight">{b.display_name}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {b.cellGrid[0]}×{b.cellGrid[1]}
                      </div>
                    </button>
                      )
                    })()
                  ))}
                </div>
              </div>
              {filteredBlocks.length === 0 && (
                <div className="pt-3 text-[11px] text-muted-foreground">该分类暂无框体</div>
              )}
            </div>
          </div>
        </div>
        {blockChangeDialog}
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
          <div className="flex items-center gap-1.5">
            <AppLogo className="size-5" />
            <TitleLogo className="h-4 w-auto" />
          </div>
          <div className="flex items-center gap-0.5">
            <TourReplayButton />
            <ThemeToggleButton />
            <HoverCard>
              <HoverCardTrigger
                render={
                  <a
                    href="https://xhslink.com/m/4vWuwtptST2"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-mr-1.5 rounded-md p-1 transition-colors hover:bg-muted"
                    aria-label="小红书"
                  />
                }
              >
                <img src="/xiaohongshu.svg" alt="小红书" className="size-[18px]" />
              </HoverCardTrigger>
              <HoverCardContent side="bottom" align="end">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <img src="/xiaohongshu.svg" alt="小红书" className="size-8" />
                    <div>
                      <p className="text-sm font-semibold">{APP_SOCIAL.xiaohongshu.label}</p>
                      <p className="text-xs text-muted-foreground">{APP_SOCIAL.xiaohongshu.account}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    关注我们的小红书，获取最新的模型展示、搭配灵感和使用技巧！
                  </p>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">框体</div>
          <div className="no-scrollbar mb-2 flex gap-1 overflow-x-auto">
            {blockCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setBlockCategory(cat)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[11px] transition-colors",
                  blockCategory === cat
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          <div id="tour-block-picker" className="relative">
            <div
              ref={blockScrollRef}
              className="no-scrollbar overflow-x-auto overscroll-contain px-0.5 py-1"
            >
            <div className="flex gap-2">
              {filteredBlocks.map((b) => (
                (() => {
                  const imageSrc = getBlockImageSrc(b)
                  return (
                <button
                  key={b.sku}
                  onClick={() => handleBlockSelect(b)}
                  className={cn(
                    "group flex shrink-0 w-[120px] flex-col rounded-lg border p-2.5 text-left transition-all",
                    block.sku === b.sku
                      ? "border-foreground bg-foreground/[0.03] ring-1 ring-foreground"
                      : "border-border hover:border-foreground/30 hover:bg-muted/50",
                  )}
                >
                  <div className="mb-2 flex w-full aspect-square items-center justify-center rounded-md bg-muted/60">
                    <img
                      src={imageSrc}
                      alt={b.display_name}
                      className="h-full w-full rounded-md object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div className="line-clamp-1 text-[11px] font-medium leading-tight">{b.display_name}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {b.cellGrid[0]}×{b.cellGrid[1]} · {b.innerSize[0]}×{b.innerSize[1]}mm
                  </div>
                </button>
                  )
                })()
              ))}
            </div>
            </div>
            {canScrollBlockLeft && (
              <button
                type="button"
                onClick={() => blockScrollRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
                className="absolute top-1/2 left-1 z-10 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                aria-label="向左滚动框体"
              >
                <span className="text-base leading-none">‹</span>
              </button>
            )}
            {canScrollBlockRight && (
              <button
                type="button"
                onClick={() => blockScrollRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
                className="absolute top-1/2 right-1 z-10 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                aria-label="向右滚动框体"
              >
                <span className="text-base leading-none">›</span>
              </button>
            )}
          </div>
          {filteredBlocks.length === 0 && (
            <div className="mt-2 text-[11px] text-muted-foreground">该分类暂无框体</div>
          )}
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
      <div id="tour-catalog-items" className="catalog-scroll no-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {groups.map((group, groupIdx) => (
          <div key={group.category} className="mt-3 first:mt-1">
            <div className="pb-1.5 text-[11px] font-medium text-muted-foreground">
              {group.category}
            </div>
            <div className={cn("grid gap-2", cols === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {group.items.map((item, itemIdx) => (
                (() => {
                  const imageSrc = getItemImageSrc(item)
                  const [gridX, gridY] = getSafeGridSize(item)
                  const isFirstItem = groupIdx === 0 && itemIdx === 0
                  const heightTag = Number.isFinite(item.height)
                    ? `高 ${(item.height / 10).toFixed(1).replace(/\.0$/, "")}cm`
                    : null
                  return (
                <button
                  key={item.sku}
                  id={isFirstItem ? "tour-first-item" : undefined}
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
                  <div className="relative mb-2 flex w-full aspect-square items-center justify-center rounded-md bg-muted/60">
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={item.display_name}
                        className="h-full w-full rounded-md object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className={cn(
                          "rounded-sm transition-colors",
                          selectedSku === item.sku
                            ? "bg-foreground"
                            : "bg-foreground/20 group-hover:bg-foreground/30",
                        )}
                        style={{
                          width: `${Math.min(gridX * 24, 56)}px`,
                          height: `${Math.min(gridY * 24, 56)}px`,
                        }}
                      />
                    )}
                    {heightTag ? (
                      <span className="pointer-events-none absolute right-1 bottom-1 rounded bg-background/90 px-1 py-0.5 text-[9px] font-medium leading-none text-muted-foreground/90 ring-1 ring-border/70 backdrop-blur-sm">
                        {heightTag}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 text-xs font-medium leading-tight">
                    {item.display_name}
                  </div>
                  {item.desc ? (
                    <div className="mt-0.5 min-h-[28px] line-clamp-2 text-[10px] leading-tight text-muted-foreground/90">
                      {item.desc}
                    </div>
                  ) : null}
                </button>
                  )
                })()
              ))}
            </div>
          </div>
        ))}
      </div>
      {blockChangeDialog}
    </div>
  )
}
