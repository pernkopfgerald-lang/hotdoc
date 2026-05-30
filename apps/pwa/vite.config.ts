import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "ff-eberstalzell-logo.png",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-192-maskable.png",
        "pwa-512-maskable.png",
      ],
      manifest: {
        // id MUSS stabil sein — Chrome verwendet ihn zur Identifikation
        // der installierten App; Aendern triggert eine separate Installation.
        id: "at.ff-eberstalzell.hotdoc",
        name: "HotDoc — FF Eberstalzell",
        short_name: "HotDoc",
        description: "Digitale Einsatzberichte für die Freiwillige Feuerwehr Eberstalzell",
        lang: "de-AT",
        dir: "ltr",
        theme_color: "#C8102E",
        background_color: "#0B1220",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        // Tablets werden mal hoch, mal quer gehalten — "any" zwingt sie nicht
        // in eine Ausrichtung. War vorher portrait, was auf KDO-Querformat-
        // Tablets den Install-Prompt unterdrueckt hat.
        orientation: "any",
        start_url: "/",
        scope: "/",
        categories: ["productivity", "utilities"],
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/pwa-192-maskable.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Archiv",
            short_name: "Archiv",
            description: "Abgeschlossene Einsatzberichte durchsuchen",
            url: "/?archiv=1",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/\{?[a-z]\}?\.?tile\.openstreetmap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles",
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "gfonts", expiration: { maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: {
      // PouchDB-browser importiert intern `events` (Node-Builtin) für
      // EventEmitter. Vite externalisiert das im Browser-Build zu einem
      // leeren Stub — und dann scheitert `class X extends EventEmitter`
      // mit "Class extends value #<Object> is not a constructor or null".
      // Der npm-Polyfill `events` ist API-kompatibel und browser-ready.
      events: "events",
    },
  },
  optimizeDeps: {
    include: ["pouchdb-browser", "events"],
  },
});
