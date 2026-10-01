import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [svelte()],
  resolve: { alias: { "@pirc/api": fileURLToPath(new URL("../api/src/index.ts", import.meta.url)) } },
  server: { proxy: { "/api": { target: "http://localhost:8787", ws: true } }, fs: { allow: [".."] } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", exclude: ["**/node_modules/**", "src/routes/GodMode.test.ts", "src/components/entries/tools/ToolCallView.test.ts"] },
      },
      {
        extends: true,
        resolve: { conditions: ["browser"] },
        ssr: { resolve: { conditions: ["browser"] } },
        test: { name: "ui", include: ["src/routes/GodMode.test.ts", "src/components/entries/tools/ToolCallView.test.ts"], environment: "jsdom" },
      },
    ],
  },
});
