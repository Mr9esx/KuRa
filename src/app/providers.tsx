import { type ReactNode, useEffect, useState } from "react"
import { initTheme } from "@/stores/theme-store"
import { TourProvider, TourAlertDialog, useTour } from "@/components/tour"
import { useLayoutMode } from "@/hooks/use-layout-mode"
import { getTourSteps, TOUR_STORAGE_KEY } from "@/config/tour"
import { useCatalog } from "@/hooks/use-catalog"
import { TooltipProvider } from "@/components/ui/tooltip"

let themeInitialized = false

function TourDialog() {
  const { setIsTourCompleted } = useTour()
  const { loading } = useCatalog()
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    const completed = localStorage.getItem(TOUR_STORAGE_KEY) === "true"
    if (!completed) {
      setDialogOpen(true)
    }
  }, [loading])

  useEffect(() => {
    const handleReplay = () => {
      localStorage.removeItem(TOUR_STORAGE_KEY)
      setIsTourCompleted(false)
      setDialogOpen(true)
    }
    window.addEventListener("kura-tour-replay", handleReplay)
    return () => window.removeEventListener("kura-tour-replay", handleReplay)
  }, [setIsTourCompleted])

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      localStorage.setItem(TOUR_STORAGE_KEY, "true")
    }
  }

  return <TourAlertDialog isOpen={dialogOpen} setIsOpen={handleDialogChange} tourId="main" />
}

function TourWrapper({ children }: { children: ReactNode }) {
  const mode = useLayoutMode()
  const isMobile = mode === "mobile"

  const completed = typeof window !== "undefined" && localStorage.getItem(TOUR_STORAGE_KEY) === "true"
  const steps = getTourSteps(isMobile)

  return (
    <TourProvider
      isTourCompleted={completed}
      tours={[{ id: "main", steps }]}
      closeable
      onComplete={() => localStorage.setItem(TOUR_STORAGE_KEY, "true")}
      onSkip={() => localStorage.setItem(TOUR_STORAGE_KEY, "true")}
    >
      {children}
      <TourDialog />
    </TourProvider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!themeInitialized) {
      initTheme()
      themeInitialized = true
    }
  }, [])

  return (
    <TooltipProvider>
      <TourWrapper>{children}</TourWrapper>
    </TooltipProvider>
  )
}
