import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor-Config fuer die HotDoc-Android-APK.
 *
 * Strategie: das gesamte Vite-Build-Output (dist/) wird in die APK gepackt.
 * Beim App-Start laedt der Webview die `index.html` direkt vom Geraet —
 * keine Network-Abhaengigkeit, kein Service-Worker noetig, kein Cache-Bug.
 * API-Calls gehen weiter ueber https://hotdoc-api.fly.dev.
 *
 * APP-ID matcht das PWA-Manifest (at.ff-eberstalzell.hotdoc) — bei einem
 * spaeteren Wechsel auf Play Store oder MDM bleibt das stabil.
 */
const config: CapacitorConfig = {
  // Android-Package-ID darf keine Dashes haben (Java-Convention) — daher
  // `ffeberstalzell` statt `ff-eberstalzell`. Das PWA-Manifest behaelt
  // seine ID wie sie ist; beide Namespaces sind unabhaengig voneinander.
  appId: "at.ffeberstalzell.hotdoc",
  appName: "HotDoc",
  webDir: "dist",

  // Android-spezifisch:
  android: {
    // allowMixedContent NICHT aktivieren — alle Backend-Calls laufen ueber TLS.
    allowMixedContent: false,
    // captureInput=true → Hardware-Tastatur-Events erreichen die App
    captureInput: true,
    // Webview-Hintergrundfarbe bevor JS lautet — matcht das Dark-Theme.
    backgroundColor: "#0B1220",
  },

  // Plugin-Konfiguration
  plugins: {
    SplashScreen: {
      // Wir steuern den Splash selber im Code, kein Auto-Hide.
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0B1220",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Statusbar matcht das FF-Rot des App-Headers (auf Topbar reduziert).
      backgroundColor: "#C8102E",
      style: "DARK",
      overlaysWebView: false,
    },
    // Geolocation: native High-Accuracy fuer Einsatz-Routing.
    Geolocation: {
      // Berechtigungen werden zur Laufzeit angefragt.
    },
    // Preferences: native EncryptedSharedPreferences fuer Auth-Token.
    Preferences: {
      group: "hotdoc.secure",
    },
  },

  // Server-Config: in Produktion null (lokales Bundle), im Dev kann hier
  // die lokale Vite-URL gesetzt werden um Hot-Reload zu nutzen.
  server: {
    androidScheme: "https",
    // url: "http://192.168.178.XX:5173",  // Nur fuer lokale Entwicklung
    // cleartext: true,                     // Nur fuer lokale Entwicklung
  },
};

export default config;
