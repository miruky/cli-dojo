import { defineConfig } from "vite";

// GitHub Pages のサブパス配信に合わせる: https://miruky.github.io/cli-dojo/
export default defineConfig({
  base: "/cli-dojo/",
  server: {
    open: true,
  },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
  },
});
