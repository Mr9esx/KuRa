import { cn } from "@/lib/utils"
import appLogoUrl from "./assets/app-logo.svg"

interface AppLogoProps {
  className?: string
}

export function AppLogo({ className }: AppLogoProps) {
  return (
    <img
      src={appLogoUrl}
      alt="Logo"
      draggable={false}
      className={cn("block object-contain select-none [-webkit-user-drag:none]", className)}
    />
  )
}
