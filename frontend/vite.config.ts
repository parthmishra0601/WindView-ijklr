import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replace(/\\/g, "/");
          if (modulePath.includes("/node_modules/recharts/") || modulePath.includes("/node_modules/d3-")) {
            return "charts";
          }
          if (modulePath.includes("/node_modules/lucide-react/")) return "icons";
          if (modulePath.includes("/node_modules/react/") || modulePath.includes("/node_modules/react-dom/")) {
            return "react-vendor";
          }
        },
      },
    },
  },
});
