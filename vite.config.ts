import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project URL: https://jmaantunes.github.io/weather-dashboard-react/
export default defineConfig({
  plugins: [react()],
  base: "/weather-dashboard-react/"
});
