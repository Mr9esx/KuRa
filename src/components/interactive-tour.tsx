import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { useEditorStore } from "@/stores/editor-store"
import { useLayoutMode } from "@/hooks/use-layout-mode"
import { useCatalog } from "@/hooks/use-catalog"
import { AppLogo } from "@/components/brand/app-logo"
import { STORAGE_KEYS, CUSTOM_EVENTS, APP_PAGE_TITLE } from "@/config/brand"

const STORAGE_KEY = STORAGE_KEYS.tourCompleted

interface TourStep {
  id: string
  title: string
  desc: string
  targetId: string
  position: "top" | "bottom" | "left" | "right" | "inside"
  waitFor: () => boolean
  hintStatusText?: string
  showHintStatus?: boolean
  primaryActionLabel?: string
  onEnter?: () => void
  showOverlay?: boolean
}

let initialCell: [number, number] | null = null
let countBeforeDelete = 0
let selectedInDeleteStep = false

function getSteps(mobile: boolean): TourStep[] {
  return [
    {
      id: "select-item",
      title: "选择这个收纳件",
      desc: "点击它试试。",
      targetId: "tour-first-item",
      position: mobile ? "top" : "right",
      waitFor: () => useEditorStore.getState().selectedCatalogSku !== null,
    },
    {
      id: "place-item",
      title: "放置到框体中",
      desc: "点击网格中的任意位置，把它放进去。",
      targetId: "tour-viewport",
      position: mobile ? "bottom" : "inside",
      waitFor: () => useEditorStore.getState().placements.length > 0,
    },
    {
      id: "select-placed",
      title: "选中已放置的收纳件",
      desc: "点击它，试试选中它。",
      targetId: "tour-viewport",
      position: mobile ? "bottom" : "inside",
      onEnter: () => {
        useEditorStore.getState().selectPlacement(null)
        useEditorStore.getState().selectCatalogItem(null)
      },
      waitFor: () => useEditorStore.getState().selectedPlacementId !== null,
    },
    {
      id: "move-placed",
      title: "移动它的位置",
      desc: mobile
        ? "按住它拖动到其他网格位置，松手即可放置。"
        : "按住并拖动它到其他网格位置。",
      targetId: "tour-viewport",
      position: mobile ? "bottom" : "inside",
      onEnter: () => {
        const p = useEditorStore.getState().placements[0]
        initialCell = p ? [p.cell[0], p.cell[1]] : null
        useEditorStore.getState().setPlacementDragActive(false)
      },
      waitFor: () => {
        if (!initialCell) return false
        const s = useEditorStore.getState()
        const p = s.placements[0]
        if (!p) return false
        const moved = p.cell[0] !== initialCell[0] || p.cell[1] !== initialCell[1]
        return moved && !s.placementDragActive
      },
    },
    {
      id: "delete-item",
      title: "删除收纳件",
      desc: mobile
        ? "选中刚才放置的收纳件，然后点击下方工具栏的 🗑️ 删除按钮。"
        : "选中刚才放置的收纳件，然后点击工具栏中的「删除」按钮。也可以用 Delete 键删除。",
      targetId: mobile ? "tour-m-delete-btn" : "tour-delete-btn",
      position: "bottom",
      showOverlay: false,
      onEnter: () => {
        // 强制用户在本步骤重新完成“选中 -> 删除”的完整动作
        useEditorStore.getState().selectPlacement(null)
        useEditorStore.getState().selectCatalogItem(null)
        selectedInDeleteStep = false
        countBeforeDelete = useEditorStore.getState().placements.length
      },
      waitFor: () => {
        const s = useEditorStore.getState()
        if (s.selectedPlacementId) {
          selectedInDeleteStep = true
        }
        return selectedInDeleteStep && s.placements.length < countBeforeDelete
      },
    },
    {
      id: "find-export",
      title: "导入导出入口在这里",
      desc: mobile
        ? "下方工具栏这个图标就是导入导出入口，之后随时可以在这里导出或导入布局。"
        : "工具栏左侧这里就是导入导出入口，之后随时可以在这里导出或导入布局。",
      targetId: mobile ? "tour-m-export" : "tour-export",
      position: mobile ? "top" : "bottom",
      showHintStatus: false,
      primaryActionLabel: "完成引导",
      waitFor: () => false,
    },
  ]
}

function HintCard({
  step,
  stepIndex,
  total,
  onSkip,
  onPrimaryAction,
  className,
  style,
}: {
  step: TourStep
  stepIndex: number
  total: number
  onSkip: () => void
  onPrimaryAction?: () => void
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-background p-4 shadow-xl ${className ?? ""}`}
      style={style}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {stepIndex + 1} / {total}
        </span>
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          跳过引导
        </button>
      </div>
      <div className="text-sm font-medium">{step.title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{step.desc}</div>
      {step.showHintStatus !== false && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
          </span>
          <span className="text-[11px] text-blue-500">{step.hintStatusText ?? "等待你的操作…"}</span>
        </div>
      )}
      {step.primaryActionLabel && onPrimaryAction && (
        <button
          onClick={onPrimaryAction}
          className="mt-3 w-full rounded-lg bg-foreground py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
        >
          {step.primaryActionLabel}
        </button>
      )}
    </div>
  )
}

function Hint({
  step,
  stepIndex,
  total,
  onSkip,
  onPrimaryAction,
}: {
  step: TourStep
  stepIndex: number
  total: number
  onSkip: () => void
  onPrimaryAction?: () => void
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const update = () => {
      const el = document.getElementById(step.targetId)
      if (el) setRect(el.getBoundingClientRect())
    }
    update()
    const timer = setInterval(update, 500)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update)
    return () => {
      clearInterval(timer)
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update)
    }
  }, [step.targetId])

  if (!rect) return null

  const isInside = step.position === "inside"
  const pad = 8

  if (isInside) {
    return (
      <>
        {/* Card rendered inside the target element */}
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        >
          <div className="pointer-events-auto absolute bottom-6 left-1/2 w-[280px] -translate-x-1/2">
            <HintCard
              step={step}
              stepIndex={stepIndex}
              total={total}
              onSkip={onSkip}
              onPrimaryAction={onPrimaryAction}
              className="backdrop-blur-sm bg-background/95"
            />
          </div>
        </div>
      </>
    )
  }

  const highlightStyle: React.CSSProperties = {
    position: "fixed",
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 12,
    pointerEvents: "none",
  }

  const cardWidth = 280
  const cardStyle: React.CSSProperties = { position: "fixed", width: cardWidth }
  const gap = 16

  if (step.position === "top") {
    cardStyle.left = Math.max(12, rect.left + rect.width / 2 - cardWidth / 2)
    cardStyle.bottom = window.innerHeight - rect.top + gap
  } else if (step.position === "bottom") {
    cardStyle.left = Math.max(12, rect.left + rect.width / 2 - cardWidth / 2)
    cardStyle.top = rect.bottom + gap
  } else if (step.position === "left") {
    cardStyle.right = window.innerWidth - rect.left + gap
    cardStyle.top = Math.max(12, rect.top + rect.height / 2 - 60)
  } else {
    cardStyle.left = rect.right + gap
    cardStyle.top = Math.max(12, rect.top + rect.height / 2 - 60)
  }

  if (typeof cardStyle.left === "number") {
    cardStyle.left = Math.min(cardStyle.left, window.innerWidth - cardWidth - 12)
  }

  const showOverlay = step.showOverlay !== false

  return (
    <>
      {showOverlay && (
        <div className="fixed inset-0 z-[9998]" style={{ pointerEvents: "none" }}>
          <svg className="size-full">
            <defs>
              <mask id="tour-interactive-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={rect.left - pad}
                  y={rect.top - pad}
                  width={rect.width + pad * 2}
                  height={rect.height + pad * 2}
                  rx={12}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.45)"
              mask="url(#tour-interactive-mask)"
            />
          </svg>
        </div>
      )}

      {/* Highlight border */}
      <div
        className="z-[9999] animate-pulse"
        style={{
          ...highlightStyle,
          boxShadow: "0 0 0 2px rgba(59,130,246,0.5), 0 0 20px rgba(59,130,246,0.15)",
        }}
      />

      {/* Instruction card */}
      <HintCard
        step={step}
        stepIndex={stepIndex}
        total={total}
        onSkip={onSkip}
        onPrimaryAction={onPrimaryAction}
        className="z-[9999]"
        style={cardStyle}
      />
    </>
  )
}

function WelcomeDialog({
  open,
  onStart,
  onSkip,
}: {
  open: boolean
  onStart: () => void
  onSkip: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.7, filter: "blur(10px)" }}
            animate={{
              scale: 1,
              filter: "blur(0px)",
              y: [0, -6, 0],
            }}
            transition={{
              duration: 0.4,
              ease: "easeOut",
              y: {
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              },
            }}
          >
            <AppLogo className="size-12" />
          </motion.div>
          <h2 className="mt-3 text-lg font-semibold">欢迎使用 {APP_PAGE_TITLE}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            跟着引导一起操作，3 步快速上手收纳布局。
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={onStart}
            className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            开始体验
          </button>
          <button
            onClick={onSkip}
            className="w-full rounded-lg py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            我已经会了，跳过
          </button>
        </div>
      </div>
    </div>
  )
}


export function InteractiveTour() {
  const mode = useLayoutMode()
  const isMobile = mode === "mobile"
  const { loading } = useCatalog()

  const [phase, setPhase] = useState<"idle" | "welcome" | "active" | "done">("idle")
  const [stepIndex, setStepIndex] = useState(0)

  const steps = useMemo(() => getSteps(isMobile), [isMobile])
  const currentStep = phase === "active" ? steps[stepIndex] : null

  useEffect(() => {
    useEditorStore.getState().setTourStepId(currentStep?.id ?? null)
    return () => {
      useEditorStore.getState().setTourStepId(null)
    }
  }, [currentStep?.id])

  useEffect(() => {
    if (loading) return
    const completed = localStorage.getItem(STORAGE_KEY) === "true"
    if (!completed) {
      setPhase("welcome")
    }
  }, [loading])

  useEffect(() => {
    const handleReplay = () => {
      localStorage.removeItem(STORAGE_KEY)
      useEditorStore.getState().clearAll()
      useEditorStore.getState().selectCatalogItem(null)
      setStepIndex(0)
      setPhase("welcome")
    }
    window.addEventListener(CUSTOM_EVENTS.tourReplay, handleReplay)
    return () => window.removeEventListener(CUSTOM_EVENTS.tourReplay, handleReplay)
  }, [])

  const complete = useCallback(() => {
    setPhase("done")
    localStorage.setItem(STORAGE_KEY, "true")
    toast.success("引导完成，开始你的创作吧！")
  }, [])

  const skip = useCallback(() => {
    setPhase("done")
    localStorage.setItem(STORAGE_KEY, "true")
  }, [])

  const advanceStep = useCallback(() => {
    const next = stepIndex + 1
    if (next >= steps.length) {
      complete()
      return
    }
    setStepIndex(next)
  }, [complete, stepIndex, steps.length])

  const startTour = useCallback(() => {
    useEditorStore.getState().clearAll()
    useEditorStore.getState().selectCatalogItem(null)
    setStepIndex(0)
    setPhase("active")
  }, [])

  useEffect(() => {
    if (phase !== "active" || !currentStep) return
    currentStep.onEnter?.()
  }, [phase, currentStep])

  // Subscribe to store changes to detect step completion
  useEffect(() => {
    if (phase !== "active" || !currentStep) return

    let handled = false
    const check = () => {
      if (handled) return true
      if (currentStep.waitFor()) {
        handled = true
        advanceStep()
        return true
      }
      return false
    }

    if (check()) return

    const unsub = useEditorStore.subscribe(() => {
      check()
    })
    return unsub
  }, [phase, currentStep, stepIndex, steps.length, advanceStep])

  if (phase === "idle" || phase === "done") return null

  return (
    <>
      <WelcomeDialog
        open={phase === "welcome"}
        onStart={startTour}
        onSkip={skip}
      />
      {currentStep && (
        <Hint
          step={currentStep}
          stepIndex={stepIndex}
          total={steps.length}
          onSkip={skip}
          onPrimaryAction={currentStep.primaryActionLabel ? advanceStep : undefined}
        />
      )}
    </>
  )
}
