import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "icons/*.svg"],
      manifest: {
        name: "LaCuoca – My Recipes",
        short_name: "LaCuoca",
        description: "Store, scan, and discover your favourite recipes",
        theme_color: "#f97316",
        background_color: "#fff7ed",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", expiration: { maxAgeSeconds: 300 } },
          },
          {
            urlPattern: /^https?:\/\/.*\/uploads\//,
            handler: "CacheFirst",
            options: { cacheName: "images-cache", expiration: { maxAgeSeconds: 86400 } },
          },
        ],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": { target: process.env.VITE_API_URL || "http://localhost:8000", changeOrigin: true },
      "/uploads": { target: process.env.VITE_API_URL || "http://localhost:8000", changeOrigin: true },
    },
  },
});
