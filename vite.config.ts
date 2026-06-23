import { defineConfig, loadEnv } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

//SPLIT PROXY - /api and /media can target different upstreams. Common
//case: run the local Express for auth (Google OAuth needs the callback
//to come back to localhost) but pull /media from prod's volume so the
//browser sees the real images + .glb files.
//
//  VITE_API_BASE_URL    - default upstream for both, e.g. "https://prod"
//  VITE_MEDIA_BASE_URL  - optional override for /media only
//
//Unset both = everything goes to the local Express at :3001.
export default defineConfig(({ mode }) => {
  const env  = loadEnv(mode, process.cwd(), "")
  const base = env.VITE_BASE_PATH || "/"
  const apiTarget   = (env.VITE_API_BASE_URL   || "http://localhost:3001").replace(/\/$/, "")
  const mediaTarget = (env.VITE_MEDIA_BASE_URL || env.VITE_API_BASE_URL || "http://localhost:3001").replace(/\/$/, "")
  console.log(`[vite] /api   -> ${apiTarget}`)
  console.log(`[vite] /media -> ${mediaTarget}`)

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
        "/api":   { target: apiTarget,   changeOrigin: true, secure: false },
        "/media": { target: mediaTarget, changeOrigin: true, secure: false },
      },
    },
  }
})
