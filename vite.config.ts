import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the same build works from a GitHub Pages project subpath
// (/<repo>/) as well as from a domain root.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
