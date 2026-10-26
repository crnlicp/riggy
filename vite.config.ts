import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { icpBindgen } from "@icp-sdk/bindgen/plugins/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    react(),
    icpBindgen({
      didFile: "./backend/backend.did",
      outDir: "./src/bindings",
    }),
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        play: resolve(__dirname, "play.html"),
      },
    },
  },
});
