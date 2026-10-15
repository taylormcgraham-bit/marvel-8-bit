import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  resolve: { alias: { "@shared": path.resolve(here, "../shared") } },
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true }, "/api": "http://localhost:8787" },
  },
  build: {
    outDir: path.resolve(here, "../dist/client"), emptyOutDir: true, target: "es2022",
    rollupOptions: { input: { main: path.resolve(here, "index.html"), legacy: path.resolve(here, "2d.html") } },
  },
});
