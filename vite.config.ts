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
  const base = env.VITE_BASE_PATH || "/"
  //PROXY TARGET - normally the local Express server, but if VITE_API_PROXY
  //is set in .env / .env.local we forward to that URL instead. Lets the
  //dev hit the production /api + /media (uploads land on prod storage,
  //files served from prod's mounted volume) without changing the stack.
  //
  //Trailing slash MUST be stripped: http-proxy concatenates target + path
  //and prod express.static then sees "//media/foo" - which normalises
  //differently from "/media/foo" and 404s on the static file. /api worked
  //in spite of this because express routers strip leading slashes; static
  //middleware does not.
  const apiTarget = (env.VITE_API_PROXY || "http://localhost:3001").replace(/\/$/, "")
  console.log(`[vite] proxying /api + /media -> ${apiTarget}`)

  //Build the proxy config once so /api and /media share the SAME options
  //+ error / response logging - silent failures were what made the original
  //"works in prod, not in dev" hard to diagnose.
  const makeProxy = (label: string) => ({
    target: apiTarget,
    changeOrigin: true,
    secure: false,
    configure: (proxy: { on: (ev: string, cb: (...args: any[]) => void) => void }) => {
      proxy.on("error", (err: Error, req: { url?: string }) => {
        console.error(`[proxy ${label}] ${req.url} ERROR: ${err.message}`)
      })
      proxy.on("proxyRes", (proxyRes: { statusCode?: number }, req: { url?: string }) => {
        if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
          console.warn(`[proxy ${label}] ${req.url} -> ${proxyRes.statusCode}`)
        }
      })
    },
  })

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
        "/api":   makeProxy("api"),
        "/media": makeProxy("media"),
      },
    },
  }
})
