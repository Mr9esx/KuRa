import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/styles/globals.css"
import App from "./App"
import ItemCardTool from "@/tools/item-card-tool"

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
