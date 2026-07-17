import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./mobile", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("./mobile-dist", import.meta.url)),
    emptyOutDir: true,
  },
});
