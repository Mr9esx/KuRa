import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/styles/globals.css"
import { APP_NAME } from "@/config/brand"
import App from "./App"
import ItemCardTool from "@/tools/item-card-tool"

document.title = APP_NAME

function getEntryElement() {
  if (window.location.pathname === "/tools/item-card") {
    return <ItemCardTool />
  }
  return <App />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {getEntryElement()}
  </StrictMode>,
)
