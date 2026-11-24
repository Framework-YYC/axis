import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Never inline assets as data: URIs: the CSP only allows same-origin fonts and images.
  build: { outDir: "dist/client", sourcemap: false, assetsInlineLimit: 0 },
});
