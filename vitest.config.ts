import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // "server-only" throws outside Next's server bundle; it's a no-op in tests.
      "server-only": path.resolve(import.meta.dirname, "src/lib/__tests__/empty.ts"),
    },
  },
  // Database test files share one database, so run files one at a time.
  test: { environment: "node", include: ["src/**/*.test.ts"], fileParallelism: false },
});
