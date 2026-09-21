import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Building as a library-friendly single bundle keeps it easy to embed via
// a script tag on another site (see README "Embedding" section) while still
// running as a normal Vite app for local dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
