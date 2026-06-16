import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const base = process.env.VITE_BASE_PATH ?? "/"

export default defineConfig({
  base,
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api":   "http://localhost:3001",
      "/media": "http://localhost:3001",
    },
  },
})
