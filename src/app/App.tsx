import { Providers } from "./providers"
import { Layout } from "./layout"
import { Viewport } from "@/features/viewport"
import { CatalogPanel } from "@/features/catalog"
import { useLayoutMode } from "@/hooks/use-layout-mode"
import { preloadCatalog } from "@/hooks/use-catalog"

preloadCatalog()

function DesktopLayout({ narrow }: { narrow?: boolean }) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <CatalogPanel narrow={narrow} />
      <Viewport />
    </div>
  )
}

function MobileLayout() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1">
        <Viewport mobile />
      </div>
      <div style={{ height: "55dvh" }} className="shrink-0">
        <CatalogPanel mobile />
      </div>
    </div>
  )
}

export default function App() {
  const mode = useLayoutMode()

  return (
    <Providers>
      <Layout>
        {mode === "mobile" ? (
          <MobileLayout />
        ) : (
          <DesktopLayout narrow={mode === "narrow"} />
        )}
      </Layout>
    </Providers>
  )
}
