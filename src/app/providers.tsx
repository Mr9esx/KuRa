import { type ReactNode, useEffect, useState } from "react"
import { initTheme } from "@/stores/theme-store"
import { TourProvider, TourAlertDialog } from "@/components/tour"
import { useLayoutMode } from "@/hooks/use-layout-mode"
import { getTourSteps, TOUR_STORAGE_KEY } from "@/config/tour"
import { useCatalog } from "@/hooks/use-catalog"

let themeInitialized = false

function TourWrapper({ children }: { children: ReactNode }) {
  const mode = useLayoutMode()
  const isMobile = mode === "mobile"
  const { loading } = useCatalog()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [completed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(TOUR_STORAGE_KEY) === "true"
  )

  const steps = getTourSteps(isMobile)

  useEffect(() => {
    if (!loading && !completed) {
      setDialogOpen(true)
    }
  }, [loading, completed])

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      localStorage.setItem(TOUR_STORAGE_KEY, "true")
    }
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
      <TourAlertDialog isOpen={dialogOpen} setIsOpen={handleDialogChange} tourId="main" />
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
