import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 15000,
    hookTimeout: 120000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.js", "models/**/*.js"],
      exclude: ["src/server.js"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
