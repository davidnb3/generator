import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH to that. Locally it is /.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: { dedupe: ["alien-signals", "react", "react-dom"] },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
