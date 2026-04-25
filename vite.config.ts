import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        legacy: "first_person_snake_3_d.html"
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 51920,
    strictPort: true
  }
});
