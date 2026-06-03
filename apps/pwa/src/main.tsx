import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { resolveApiUrl } from "./lib/api";
import { configureStatusBar, hideSplashScreen, isNative } from "./lib/platform";
import "./index.css";

// BLOCKER-4 (Audit 2026-06-03): Globale Fehler-Auffang-Netze.
// Die React-ErrorBoundary fängt NUR Render-Fehler — Fehler aus async-Code,
// Event-Handlern, setInterval und Promise-Rejections (z. B. ein fehlgeschlagener
// fire-and-forget-Sync) liefen bisher lautlos ins Leere: kein Log, kein
// Feedback. Diese zwei Listener fangen sie ab und schicken sie best-effort ans
// Backend-Log, ohne die App zu crashen. Bewusst defensiv (try/catch um alles),
// damit der Fehler-Handler nie selbst zum Fehler wird.
function reportClientError(kind: string, detail: unknown): void {
  try {
    // eslint-disable-next-line no-console
    console.error(`[${kind}]`, detail);
    const token = localStorage.getItem("hotdoc.tabletToken");
    const msg =
      detail instanceof Error
        ? `${detail.name}: ${detail.message}`
        : typeof detail === "string"
          ? detail
          : JSON.stringify(detail);
    // best-effort, keine await/Fehlerbehandlung — darf den Boot nie blockieren.
    // resolveApiUrl macht den Pfad in der APK (Capacitor) absolut.
    void fetch(resolveApiUrl("/api/admin/client-error"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ kind, message: msg, at: new Date().toISOString() }),
    }).catch(() => {
      /* offline / kein Endpoint → egal, Console-Log bleibt */
    });
  } catch {
    /* niemals werfen */
  }
}

window.addEventListener("unhandledrejection", (e) => {
  reportClientError("unhandledrejection", e.reason);
});
window.addEventListener("error", (e) => {
  reportClientError("window.onerror", e.error ?? e.message);
});

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
