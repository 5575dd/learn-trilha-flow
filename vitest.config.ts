/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      exclude: [
        "dist/**",
        ".output/**",
        "coverage/**",
        "reports/**",
        "node_modules/**",
        "src/routeTree.gen.ts",
        "src/routes/**",
        "src/components/**",
        "**/*.config.*",
      ],
      reportsDirectory: "coverage",
    },
  },
});
