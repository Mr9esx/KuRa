import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import obfuscatorPlugin from "vite-plugin-javascript-obfuscator"
import path from "path"

export default defineConfig(({ command }) => {
  const isBuild = command === "build"

  return {
    plugins: [
      react(),
      tailwindcss(),
      isBuild &&
        obfuscatorPlugin({
          apply: "build",
          include: [/src\/(features\/viewport|stores|tools)\//],
          options: {
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.2,
            deadCodeInjection: false,
            identifierNamesGenerator: "hexadecimal",
            renameGlobals: false,
            simplify: true,
            splitStrings: true,
            splitStringsChunkLength: 8,
            stringArray: true,
            stringArrayEncoding: ["base64"],
            stringArrayThreshold: 0.75,
            unicodeEscapeSequence: false,
          },
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      chunkSizeWarningLimit: 800,
      sourcemap: false,
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return
            if (id.includes("three/examples/jsm/loaders/3MFLoader")) return "three-3mf-loader"
            if (id.includes("three/examples")) return "three-examples"
            if (id.includes("/three/")) return "three-core"
            if (id.includes("xlsx")) return "xlsx-vendor"
            if (id.includes("jszip") || id.includes("file-saver")) return "export-vendor"
            if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion")) return "motion-vendor"
            if (id.includes("@base-ui") || id.includes("@floating-ui")) return "ui-vendor"
          },
        },
      },
    },
  }
})
