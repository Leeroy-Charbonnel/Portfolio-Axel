import { defineConfig, loadEnv } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

//Vite reads VITE_API_BASE_URL from .env and proxies /api + /media to it.
//When the value points at prod, `bun dev:client` works transparently:
//the browser sees localhost URLs but everything is forwarded to prod.
//Falls back to the local Express at :3001 if the env var is unset.
export default defineConfig(({ mode }) => {
  const env       = loadEnv(mode, process.cwd(), "")
  const base      = env.VITE_BASE_PATH || "/"
  const apiTarget = (env.VITE_API_BASE_URL || "http://localhost:3001").replace(/\/$/, "")
  console.log(`[vite] proxying /api + /media -> ${apiTarget}`)

  return {
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
  }
})
