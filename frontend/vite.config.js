// Vite dev server. /api is proxied to the FastAPI process so the browser
// can call the backend without a cross-origin request during local development.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      // API_PROXY_TARGET overrides the default when the API is not on port 8000.
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
