import { useEditorStore } from "@/stores/editor-store"
import { useThemeStore } from "@/stores/theme-store"
import { MATERIAL_COLORS } from "@/config/materials"
import { cn } from "@/lib/utils"
import { Trash2, Sun, Moon, Monitor } from "lucide-react"

function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)

  const next = () => {
    const cycle = { light: "dark", dark: "system", system: "light" } as const
    setMode(cycle[mode])
  }

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor
  const label = mode === "light" ? "明亮" : mode === "dark" ? "暗黑" : "跟随系统"

  return (
    <button
      onClick={next}
      title={label}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

export function Toolbar() {
  const colorId = useEditorStore((s) => s.materialColorId)
  const setColor = useEditorStore((s) => s.setMaterialColor)
  const clearAll = useEditorStore((s) => s.clearAll)
  const count = useEditorStore((s) => s.placements.length)

  return (
    <div className="flex h-12 items-center justify-between border-t border-border bg-background px-4">
      <div className="w-[100px]" aria-hidden />

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
        <ThemeToggle />
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
