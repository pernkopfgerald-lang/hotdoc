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
          // Issue 25 (Einsatz-Test 2026-06-02): basemap.at-Tiles vorhalten.
          // CacheFirst damit der Tablet-Browser im Funkloch (Sturm-Einsatz
          // ohne LTE, schwacher Empfang im Tal) die zuletzt geladenen Tiles
          // weiter zeigt. 7 Tage Lebensdauer + 500 Eintraege (~ 5 Layers
          // bei ~100 Tiles je Einsatzort).
          {
            urlPattern: /^https:\/\/maps\d*\.wien\.gv\.at\/basemap\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "basemap-at-tiles",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
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
    // "hidden" (Audit KISS P-3): Sourcemaps werden erzeugt (für die
    // Symbolisierung der via /api/admin/client-error gemeldeten Field-
    // Crash-Stacks), aber NICHT mehr per //# sourceMappingURL im Bundle
    // referenziert — schlankeres, nicht selbst-exponierendes Auslieferungs-JS.
    sourcemap: "hidden",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        // Manuelles Chunk-Splitting fuer das Initial-Load-Budget:
        // grosse Libs ziehen wir in eigene Vendor-Chunks raus, damit das
        // Main-Bundle klein bleibt und die Vendor-Chunks zwischen Releases
        // gecached werden koennen (Hash aendert sich nur bei echtem
        // Library-Update).
        //
        // Funktionale Variante statt Object-Map, weil Rollup bei Object-Map
        // die Chunks in deklarierter Reihenfolge zuordnet und transitive
        // React-Module sonst in den ersten Vendor-Chunk wandern (z. B.
        // landet React/ReactDOM bei react-leaflet im vendor-leaflet).
        // Hier pruefen wir den Modul-ID-Pfad und routen React explizit zuerst.
        //
        // Lazy-geladene Pages (Setup, FlorianMapPopout, VorschauModal) bekommen
        // automatisch eigene Chunks ueber React.lazy() — die brauchen hier
        // keinen Eintrag.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // React zuerst — verhindert dass scheduler/jsx-runtime
          // in einem peer-dependenten Chunk landet.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
          if (
            id.includes("node_modules/leaflet/") ||
            id.includes("node_modules/react-leaflet/") ||
            id.includes("node_modules/@react-leaflet/")
          ) {
            return "vendor-leaflet";
          }
          if (id.includes("node_modules/pouchdb-")) {
            return "vendor-pouchdb";
          }
          if (id.includes("node_modules/qrcode.react/")) {
            return "vendor-qrcode";
          }
          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          return undefined;
        },
      },
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
