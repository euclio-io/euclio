import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Run test files serially: reconcile() processes ALL workflows in the DB,
    // so parallel test files would race on each other's test data.
    fileParallelism: false,
  },
});
