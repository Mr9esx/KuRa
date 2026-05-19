import { create } from "zustand"

type ThemeMode = "light" | "dark" | "system"

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

const STORAGE_KEY = "risu-theme"

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
  document.documentElement.classList.toggle("dark", effective === "dark")
}

export const useThemeStore = create<ThemeState>()((set) => ({
  mode: getInitialMode(),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode)
    applyTheme(mode)
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
