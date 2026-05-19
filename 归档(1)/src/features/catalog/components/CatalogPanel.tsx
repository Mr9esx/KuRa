import { useState } from "react"
import { useEditorStore } from "@/stores/editor-store"
import { useCatalog } from "@/hooks/use-catalog"
import { cn } from "@/lib/utils"
import type { Preset } from "@/types/catalog"
import { PresetDialog } from "./PresetDialog"

export function CatalogPanel() {
  const [category, setCategory] = useState<string>("全部")
  const [activePreset, setActivePreset] = useState<Preset | null>(null)
  const selectedSku = useEditorStore((s) => s.selectedCatalogSku)
  const selectItem = useEditorStore((s) => s.selectCatalogItem)
  const block = useEditorStore((s) => s.block)
  const setBlock = useEditorStore((s) => s.setBlock)

  const { data, loading, error } = useCatalog()

  if (loading) {
    return (
      <div className="flex h-full w-72 items-center justify-center border-r border-border bg-background">
        <p className="text-xs text-muted-foreground">加载目录中…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full w-72 items-center justify-center border-r border-border bg-background">
        <p className="text-xs text-destructive">目录加载失败</p>
      </div>
    )
  }

  const { blocks, items, categories, presets } = data

  const filtered =
    category === "全部"
      ? items
      : items.filter((i) => i.categories.includes(category))

  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-background">
      {/* Block selector */}
      <div className="border-b border-border p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          框体
        </div>
        <div className="flex gap-1.5">
          {blocks.map((b) => (
            <button
              key={b.sku}
              onClick={() => setBlock(b)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                block.sku === b.sku
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted",
              )}
            >
              {b.cellGrid[0]}×{b.cellGrid[1]}
            </button>
          ))}
        </div>
      </div>

      {/* Presets */}
      {presets.length > 0 && (
        <div className="border-b border-border p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            推荐方案
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setActivePreset(preset)}
                className="group flex w-[120px] shrink-0 flex-col rounded-lg border border-border p-2 text-left transition-all hover:border-foreground/30 hover:bg-muted/50"
              >
                <div className="mb-1.5 aspect-[4/3] w-full overflow-hidden rounded-md bg-muted/60">
                  <img
                    src={preset.image}
                    alt={preset.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                </div>
                <div className="text-[11px] font-medium leading-tight">
                  {preset.name}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {preset.items.length} 件
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-1 overflow-x-auto border-b border-border p-3">
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

      {/* Item list */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((item) => (
            <button
              key={item.sku}
              onClick={() => selectItem(item.sku)}
              className={cn(
                "group flex flex-col rounded-lg border p-2.5 text-left transition-all",
                selectedSku === item.sku
                  ? "border-foreground bg-foreground/[0.03] ring-1 ring-foreground"
                  : "border-border hover:border-foreground/30 hover:bg-muted/50",
              )}
            >
              {/* Visual representation */}
              <div className="mb-2 flex aspect-square items-center justify-center rounded-md bg-muted/60">
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

      {/* Hint */}
      <div className="border-t border-border p-3">
        <p className="text-center text-[11px] text-muted-foreground">
          {selectedSku
            ? "点击 3D 视口中的网格放置"
            : "选择一个功能件开始配置"}
        </p>
      </div>

      <PresetDialog
        preset={activePreset}
        open={!!activePreset}
        onOpenChange={(open) => !open && setActivePreset(null)}
      />
    </div>
  )
}
