import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { configureStatusBar, hideSplashScreen, isNative } from "./lib/platform";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root-Element #root nicht gefunden");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Native-Boot-Hooks — nur in der APK relevant, im Browser-Build no-op.
// StatusBar konfigurieren bevor das erste Frame rendert, Splash erst
// danach ausblenden damit der User keinen weissen Flash sieht.
if (isNative()) {
  void (async () => {
    try {
      await configureStatusBar();
    } catch {
      // egal
    }
    // Kurz warten bis React den ersten Frame gerendert hat
    setTimeout(() => {
      void hideSplashScreen();
    }, 400);
  })();
}
