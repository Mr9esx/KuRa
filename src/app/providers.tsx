import { type ReactNode, useEffect } from "react"
import { initTheme } from "@/stores/theme-store"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { InteractiveTour } from "@/components/interactive-tour"
import { useLayoutMode } from "@/hooks/use-layout-mode"

let themeInitialized = false

export function Providers({ children }: { children: ReactNode }) {
  const mode = useLayoutMode()

  useEffect(() => {
    if (!themeInitialized) {
      initTheme()
      themeInitialized = true
    }
  }, [])

  return (
    <TooltipProvider>
      {children}
      <Toaster
        position={mode === "mobile" ? "top-center" : "bottom-center"}
        offset={{ top: "64px", bottom: "64px" }}
        mobileOffset={{ top: "64px" }}
      />
      <InteractiveTour />
    </TooltipProvider>
  )
}
