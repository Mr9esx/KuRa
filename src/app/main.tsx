import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/styles/globals.css"
import { APP_TAB_TITLE } from "@/config/brand"

document.title = APP_TAB_TITLE

async function resolveEntry() {
  if (window.location.pathname === "/tools/item-card") {
    const { default: ItemCardTool } = await import("@/tools/item-card-tool")
    return ItemCardTool
  }
  if (window.location.pathname === "/tools/item-card-r3f") {
    const { default: ItemCardR3FTool } = await import("@/tools/item-card-r3f-tool")
    return ItemCardR3FTool
  }
  const { default: App } = await import("./App")
  return App
}

void resolveEntry().then((Entry) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Entry />
    </StrictMode>,
  )
})
