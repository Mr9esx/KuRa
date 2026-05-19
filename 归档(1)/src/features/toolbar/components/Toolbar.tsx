import { useEditorStore } from "@/stores/editor-store"
import { MATERIAL_COLORS } from "@/config/materials"
import { cn } from "@/lib/utils"
import { Trash2 } from "lucide-react"

export function Toolbar() {
  const colorId = useEditorStore((s) => s.materialColorId)
  const setColor = useEditorStore((s) => s.setMaterialColor)
  const clearAll = useEditorStore((s) => s.clearAll)
  const count = useEditorStore((s) => s.placements.length)

  return (
    <div className="flex h-12 items-center justify-between border-t border-border bg-background px-4">
      {/* Left: logo */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">Risu</span>
        <span className="text-xs text-muted-foreground">收纳编辑器</span>
      </div>

      {/* Center: color picker */}
      <div className="flex items-center gap-1.5">
        {MATERIAL_COLORS.map((c) => (
          <button
            key={c.id}
            onClick={() => setColor(c.id)}
            title={c.name}
            className={cn(
              "size-6 rounded-full border-2 transition-transform hover:scale-110",
              colorId === c.id
                ? "border-foreground scale-110"
                : "border-transparent",
            )}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={clearAll}
          disabled={count === 0}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
          清空
        </button>
      </div>
    </div>
  )
}
