import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [svelte()],
  resolve: { alias: { "@pirc/api": fileURLToPath(new URL("../api/src/index.ts", import.meta.url)) } },
  server: { proxy: { "/api": { target: "http://localhost:8787", ws: true } }, fs: { allow: [".."] } },
});
