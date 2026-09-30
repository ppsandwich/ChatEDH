import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "card-library", test: /src\/data\// }],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        // Preserve the browser host so the API can enforce same-origin requests.
        changeOrigin: false,
      },
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
} as Parameters<typeof defineConfig>[0]);
