import { Providers } from "./providers"
import { Layout } from "./layout"
import { Viewport } from "@/features/viewport"
import { CatalogPanel } from "@/features/catalog"
import { Toolbar } from "@/features/toolbar"
import { preloadCatalog } from "@/hooks/use-catalog"

preloadCatalog()

export default function App() {
  return (
    <Providers>
      <Layout>
        <div className="flex flex-1 overflow-hidden">
          <CatalogPanel />
          <Viewport />
        </div>
        <Toolbar />
      </Layout>
    </Providers>
  )
}
