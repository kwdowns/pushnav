/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "/static/",
  build: { outDir: "dist", assetsDir: "" },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/ws":         { target: "ws://localhost:8780", ws: true },
      "/frame.mjpg": "http://localhost:8780",
      "/frame.jpg":  "http://localhost:8780",
      "/api":        "http://localhost:8780",
      "/sounds":     "http://localhost:8780",
      "/assets":     "http://localhost:8780",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
