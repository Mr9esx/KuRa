import { type ReactNode, useEffect } from "react"
import { initTheme } from "@/stores/theme-store"

let themeInitialized = false

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!themeInitialized) {
      initTheme()
      themeInitialized = true
    }
  }, [])

  return <>{children}</>
}
