import { type ReactNode, lazy, Suspense, useEffect, useState } from "react"
import { initTheme } from "@/stores/theme-store"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { useLayoutMode } from "@/hooks/use-layout-mode"

let themeInitialized = false
const InteractiveTour = lazy(() =>
  import("@/components/interactive-tour").then((mod) => ({ default: mod.InteractiveTour })),
)

export function Providers({ children }: { children: ReactNode }) {
  const mode = useLayoutMode()
  const [showTour, setShowTour] = useState(false)

  useEffect(() => {
    if (!themeInitialized) {
      initTheme()
      themeInitialized = true
    }
  }, [])

  useEffect(() => {
    const scheduleIdleWork =
      window.requestIdleCallback ??
      ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline), 200))

    const cancelIdleWork =
      window.cancelIdleCallback ??
      ((id: number) => {
        window.clearTimeout(id)
      })

    const id = scheduleIdleWork(() => setShowTour(true))
    return () => cancelIdleWork(id)
  }, [])

  return (
    <TooltipProvider>
      {children}
      <Toaster
        position={mode === "mobile" ? "top-center" : "bottom-center"}
        offset={{ top: "64px", bottom: "64px" }}
        mobileOffset={{ top: "64px" }}
      />
      {showTour ? (
        <Suspense fallback={null}>
          <InteractiveTour />
        </Suspense>
      ) : null}
    </TooltipProvider>
  )
}
