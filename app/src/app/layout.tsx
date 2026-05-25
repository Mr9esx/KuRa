import type { ReactNode } from "react"

export function Layout({ children }: { children: ReactNode }) {
  return <div className="flex h-full w-full flex-col">{children}</div>
}
