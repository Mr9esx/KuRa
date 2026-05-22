import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("three") || id.includes("@react-three")) return "three-vendor"
          if (id.includes("xlsx") || id.includes("jszip") || id.includes("file-saver")) return "export-vendor"
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion")) return "motion-vendor"
          if (id.includes("@base-ui") || id.includes("@floating-ui")) return "ui-vendor"
        },
      },
    },
  },
})
