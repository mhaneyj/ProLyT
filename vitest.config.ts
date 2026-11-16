import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Same JSX runtime and "@/" alias as the app, so tests can render components and import like the source does.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
