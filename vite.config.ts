import { defineConfig, loadEnv } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

//defineConfig as a function so loadEnv can pull .env / .env.local. With
//VITE_API_BASE_URL set, the client issues absolute fetches straight to
//prod; the dev proxy below is only used when running against a local
//Express (`bun dev`) - it forwards /api + /media to localhost:3001.
export default defineConfig(({ mode }) => {
  const env  = loadEnv(mode, process.cwd(), "")
  const base = env.VITE_BASE_PATH || "/"

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
        "/api":   { target: "http://localhost:3001", changeOrigin: true, secure: false },
        "/media": { target: "http://localhost:3001", changeOrigin: true, secure: false },
      },
    },
  }
})
