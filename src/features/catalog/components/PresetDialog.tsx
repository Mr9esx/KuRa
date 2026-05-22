import { useState } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { X, LayoutGrid, List } from "lucide-react"
import { getCatalogItemDisplayName, type Preset } from "@/types/catalog"
import { findItemBySku } from "@/hooks/use-catalog"
import { useEditorStore } from "@/stores/editor-store"
import { cn } from "@/lib/utils"

interface PresetDialogProps {
  preset: Preset | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PresetDialog({ preset, open, onOpenChange }: PresetDialogProps) {
  const applyPreset = useEditorStore((s) => s.applyPreset)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  if (!preset) return null

  const itemCounts = new Map<string, number>()
  for (const p of preset.items) {
    itemCounts.set(p.sku, (itemCounts.get(p.sku) ?? 0) + 1)
  }

  const itemList = Array.from(itemCounts.entries()).map(([sku, count]) => {
    const item = findItemBySku(sku)
    return { sku, count, name: item ? getCatalogItemDisplayName(item) : sku, gridSize: item?.gridSize }
  })

  const handleApply = () => {
    applyPreset(preset)
    const url = new URL(window.location.href)
    url.searchParams.set("set", preset.id)
    window.history.replaceState({}, "", url)
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          <div className="relative shrink-0">
            <div className="aspect-[16/10] w-full bg-muted">
              <img
                src={preset.image}
                alt={preset.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none"
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                方案预览
              </div>
            </div>

            <Dialog.Close className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-colors hover:bg-background">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Dialog.Title className="text-base font-semibold">{preset.name}</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-muted-foreground">
              {preset.description}
            </Dialog.Description>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">包含功能件</span>
                <div className="flex rounded-md border border-border">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-l-md transition-colors",
                      viewMode === "grid"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <LayoutGrid className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-r-md border-l border-border transition-colors",
                      viewMode === "list"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <List className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {viewMode === "grid" ? (
                <div className="grid grid-cols-3 gap-2">
                  {itemList.map(({ sku, count, name, gridSize }) => (
                    <div key={sku} className="flex flex-col rounded-lg border border-border p-2">
                      <div className="mb-1.5 flex aspect-square items-center justify-center rounded-md bg-muted/60">
                        <div
                          className="rounded-sm bg-foreground/20"
                          style={{
                            width: `${Math.min((gridSize?.[0] ?? 1) * 16, 40)}px`,
                            height: `${Math.min((gridSize?.[1] ?? 1) * 16, 40)}px`,
                          }}
                        />
                      </div>
                      <div className="text-xs font-semibold leading-tight">{name}</div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {gridSize?.[0]}×{gridSize?.[1]}
                        </span>
                        <span>×{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border">
                  <div className="flex items-center border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    <div className="w-8 shrink-0" />
                    <div className="flex-1 pl-3">名称</div>
                    <div className="w-10 text-center">尺寸</div>
                    <div className="w-8 text-right">数量</div>
                  </div>
                  {itemList.map(({ sku, count, name, gridSize }, i) => (
                    <div
                      key={sku}
                      className={cn(
                        "flex items-center px-3 py-2",
                        i < itemList.length - 1 && "border-b border-border",
                      )}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
                        <div
                          className="rounded-sm bg-foreground/20"
                          style={{
                            width: `${Math.min((gridSize?.[0] ?? 1) * 10, 24)}px`,
                            height: `${Math.min((gridSize?.[1] ?? 1) * 10, 24)}px`,
                          }}
                        />
                      </div>
                      <div className="flex-1 pl-3 text-xs font-semibold">{name}</div>
                      <div className="w-10 text-center text-xs text-muted-foreground">
                        {gridSize?.[0]}×{gridSize?.[1]}
                      </div>
                      <div className="w-8 text-right text-xs text-muted-foreground">
                        ×{count}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-border p-4">
            <div className="flex gap-2">
              <button
                onClick={() => {}}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                导出清单
              </button>
              <button
                onClick={handleApply}
                className="flex-1 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                应用方案
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
