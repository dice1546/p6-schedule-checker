import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    // xer-checker/ is the original node:test project kept for reference.
    exclude: ["node_modules/**", ".next/**", "xer-checker/**"],
    passWithNoTests: true,
  },
});
