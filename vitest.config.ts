import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(root, "./src") },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/**/*.integration.test.ts", "e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.integration.test.ts", "src/**/*.functions.ts"],
      reporter: ["text", "html"],
    },
  },
});
