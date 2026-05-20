import { type ReactNode, useEffect, useState } from "react"
import { initTheme } from "@/stores/theme-store"
import { TourProvider, TourAlertDialog, useTour } from "@/components/tour"
import { useLayoutMode } from "@/hooks/use-layout-mode"
import { getTourSteps, TOUR_STORAGE_KEY } from "@/config/tour"
import { useCatalog } from "@/hooks/use-catalog"

let themeInitialized = false

function TourDialog() {
  const { setIsTourCompleted } = useTour()
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY) === "true"
    if (!completed) {
      setDialogOpen(true)
    }
  }, [])

  useEffect(() => {
    const handleReplay = () => {
      localStorage.removeItem(TOUR_STORAGE_KEY)
      setIsTourCompleted(false)
      setDialogOpen(true)
    }
    window.addEventListener("risu-tour-replay", handleReplay)
    return () => window.removeEventListener("risu-tour-replay", handleReplay)
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
  const { loading } = useCatalog()

  const completed = typeof window !== "undefined" && localStorage.getItem(TOUR_STORAGE_KEY) === "true"
  const steps = getTourSteps(isMobile)

  if (loading) {
    return <>{children}</>
  }

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

  return <TourWrapper>{children}</TourWrapper>
}
