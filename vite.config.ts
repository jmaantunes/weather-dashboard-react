import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built assets resolve correctly whether the site is
// hosted at the root of a domain or under a GitHub Pages project path
// (https://<user>.github.io/<repo>/).
export default defineConfig({
  plugins: [react()],
  base: "./"
});
