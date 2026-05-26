import { create } from "zustand"
import { STORAGE_KEYS } from "@/config/brand"
import { trackEvent } from "@/lib/analytics"

type ThemeMode = "light" | "dark" | "system"

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

const STORAGE_KEY = STORAGE_KEYS.theme

function getInitialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "light" || stored === "dark" || stored === "system") return stored
  return "system"
}

function getEffectiveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(mode: ThemeMode) {
  const effective = getEffectiveTheme(mode)
  const doc = document.documentElement
  doc.classList.add("no-transitions")
  doc.classList.toggle("dark", effective === "dark")
  // force reflow so the class change paints without transitions
  doc.offsetHeight // eslint-disable-line @typescript-eslint/no-unused-expressions
  doc.classList.remove("no-transitions")
}

export const useThemeStore = create<ThemeState>()((set) => ({
  mode: getInitialMode(),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode)
    applyTheme(mode)
    trackEvent("theme_change", { mode })
    set({ mode })
  },
}))

export function initTheme() {
  const mode = useThemeStore.getState().mode
  applyTheme(mode)

  const mq = window.matchMedia("(prefers-color-scheme: dark)")
  mq.addEventListener("change", () => {
    const current = useThemeStore.getState().mode
    if (current === "system") applyTheme("system")
  })
}
