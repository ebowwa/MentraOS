import {defineConfig} from "vite"
import react from "@vitejs/plugin-react-swc"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import {nodePolyfills} from "vite-plugin-node-polyfills"

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), nodePolyfills()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "node:async_hooks": "rollup-plugin-node-polyfills/polyfills/async_hooks",
    },
  },
  optimizeDeps: {
    include: [
      "@supabase/supabase-js",
      "@supabase/auth-ui-react",
      "@supabase/auth-ui-shared",
      "recharts",
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: [
            "@supabase/supabase-js",
            "@supabase/auth-ui-react",
            "@supabase/auth-ui-shared",
          ],
          charts: ["recharts"],
        },
      },
    },
  },
})