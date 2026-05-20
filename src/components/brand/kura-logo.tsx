import { cn } from "@/lib/utils"

interface KuRaLogoProps {
  className?: string
}

export function KuRaLogo({ className }: KuRaLogoProps) {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-primary", className)}
      aria-label="KuRa logo"
      role="img"
    >
      <title>KuRa Logo</title>
      <path
        d="M20 44L72 24L108 40L56 60L20 44Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M20 44L56 60V100L20 84V44Z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M108 40L56 60V100L108 80V40Z"
        fill="currentColor"
        opacity="0.08"
      />
      <path
        d="M20 44L72 24L108 40L56 60L20 44ZM20 44V84L56 100L108 80V40M56 60V100"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
