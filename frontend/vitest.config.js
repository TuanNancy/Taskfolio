import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{js,jsx}"],
    setupFiles: ["./tests/setup.js"],
    coverage: {
      provider: "v8",
      include: ["src/hooks/**", "src/context/**", "src/services/**", "src/components/{AuthForm,TodoApp,TaskForm,TaskItem,Pagination,FilterBar,ProtectedRoute}.jsx", "src/pages/{LoginPage,RegisterPage}.jsx"],
      exclude: ["**/*.test.*"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
}));
