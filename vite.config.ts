import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const base = process.env.VITE_BASE_PATH ?? "/"

//PROXY TARGET - normally the local Express server, but if VITE_API_PROXY is
//set in .env.local we forward to that URL instead. Lets the dev hit the
//production /api + /media (uploads land on prod storage, files served from
//prod's mounted volume) without changing the rest of the stack.
const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:3001"

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
      "/api":   { target: apiTarget, changeOrigin: true, secure: false },
      "/media": { target: apiTarget, changeOrigin: true, secure: false },
    },
  },
})
