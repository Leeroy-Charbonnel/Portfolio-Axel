import { defineConfig, loadEnv } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

//Use the function form of defineConfig so we can call loadEnv. Without
//this, .env / .env.local values do NOT flow into `process.env` at the
//time the config is evaluated, so VITE_API_PROXY was silently undefined
//and the dev proxy fell back to http://localhost:3001 - which is dead in
//`dev:remote` mode (no local Express running).
export default defineConfig(({ mode }) => {
  //Pass an empty prefix so loadEnv returns ALL keys, not just VITE_*
  const env = loadEnv(mode, process.cwd(), "")
  const base      = env.VITE_BASE_PATH || "/"
  //PROXY TARGET - normally the local Express server, but if VITE_API_PROXY
  //is set in .env / .env.local we forward to that URL instead. Lets the
  //dev hit the production /api + /media (uploads land on prod storage,
  //files served from prod's mounted volume) without changing the stack.
  const apiTarget = env.VITE_API_PROXY || "http://localhost:3001"
  //Log the resolved target on startup so it's obvious whether the proxy
  //is pointing at prod or local - silent fallbacks were what made the
  //"I can't fetch from localhost" issue hard to spot.
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
