import { defineConfig, loadEnv } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

//Function form so we can read .env / .env.local via loadEnv - process.env
//doesn't carry those automatically at config-eval time.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const base = env.VITE_BASE_PATH || "/"
  //PROXY TARGET - if VITE_API_PROXY is set in .env / .env.local, forward
  ///api + /media there. Trailing slash stripped so http-proxy doesn't
  //build a "//media/foo" URL that express.static 404s on.
  const apiTarget = (env.VITE_API_PROXY || "http://localhost:3001").replace(/\/$/, "")
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
