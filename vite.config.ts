import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["alien-signals", "react", "react-dom"] },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
