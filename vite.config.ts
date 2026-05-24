import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import obfuscatorPlugin from "vite-plugin-javascript-obfuscator"
import path from "path"

export default defineConfig(({ command }) => {
  const isBuild = command === "build"
  const enableObfuscation = isBuild && process.env.ENABLE_OBFUSCATION === "true"

  return {
    plugins: [
      react(),
      tailwindcss(),
      enableObfuscation &&
        obfuscatorPlugin({
          apply: "build",
          // Keep obfuscation away from modules using dynamic import(),
          // otherwise bundler may fail to rewrite chunk URLs (e.g. /assets/BlockMesh 404).
          include: [/src\/(stores|engine)\//],
          options: {
            compact: true,
            controlFlowFlattening: false,
            deadCodeInjection: false,
            identifierNamesGenerator: "hexadecimal",
            renameGlobals: false,
            simplify: true,
            splitStrings: false,
            stringArray: true,
            stringArrayEncoding: [],
            stringArrayThreshold: 0.3,
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
      target: "es2018",
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
