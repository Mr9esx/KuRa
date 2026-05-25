import { useSyncExternalStore } from "react"

type LayoutMode = "desktop" | "narrow" | "mobile"

const NARROW_BREAKPOINT = 900
const MOBILE_BREAKPOINT = 640

function getLayoutMode(): LayoutMode {
  const w = window.innerWidth
  if (w < MOBILE_BREAKPOINT) return "mobile"
  if (w < NARROW_BREAKPOINT) return "narrow"
  return "desktop"
}

let currentMode: LayoutMode = typeof window !== "undefined" ? getLayoutMode() : "desktop"
const listeners = new Set<() => void>()

if (typeof window !== "undefined") {
  window.addEventListener("resize", () => {
    const next = getLayoutMode()
    if (next !== currentMode) {
      currentMode = next
      listeners.forEach((fn) => fn())
    }
  })
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot() {
  return currentMode
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, getSnapshot, () => "desktop")
}
