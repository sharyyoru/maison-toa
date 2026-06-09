import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/lib/__tests__/*.test.ts",
      "src/utils/__tests__/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/utils/**/*.ts"],
      exclude: [
        "src/lib/supabaseClient.ts",
        "src/lib/supabaseAdmin.ts",
        "src/lib/supabaseDemo.ts",
      ],
    },
  },
});
