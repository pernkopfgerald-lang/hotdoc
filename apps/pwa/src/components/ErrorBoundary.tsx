import { AlertTriangle, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
  errorStack?: string;
  errorCount: number;
  /** C-13: zweistufige Bestätigung für "Lokale Daten löschen". */
  confirmWipe: boolean;
  wiping: boolean;
}

/** localStorage-Präfixe, die beim harten Reset weg müssen (Drafts, Abschluss-States). */
const LOCAL_PREFIXES = ["hotdoc.draft.", "hotdoc.report-state."];
/** Einzel-Keys, die beim harten Reset weg müssen (Token, Handoff, Update-Merker). */
const LOCAL_KEYS = ["hotdoc.tabletToken", "hotdoc.handoffInfo", "hotdoc.update.dismissed"];

/**
 * C-13 (Audit 2026-09): Harter lokaler Reset — letzte Rettung, wenn die App
 * wiederholt crasht oder die lokale Datenbank nicht mehr lesbar ist.
 *
 *  1. Drafts + Abschluss-States + Token aus localStorage
 *  2. PouchDB "hotdoc-local" zerstören (Fahrzeug-Konfig, Fotos, Outboxen)
 *     — bevorzugt über db.destroy(); wenn das Modul selbst nicht mehr
 *     lädt, direkt die IndexedDB hinter PouchDB löschen
 *  3. /reset.html → Service-Worker + Caches weg, dann frische App-Shell
 *
 * Wird auch vom Setup-Screen (Grund "boot-failed") über Über HotDoc → Reset
 * benutzt. Wirft nie; jeder Schritt ist best-effort.
 */
export async function hardResetLocalData(): Promise<void> {
  // 1) localStorage
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && LOCAL_PREFIXES.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    for (const k of [...toRemove, ...LOCAL_KEYS]) localStorage.removeItem(k);
  } catch {
    // Private-Mode / Storage gesperrt — egal, weiter
  }
  // 2) PouchDB
  let destroyed = false;
  try {
    const { db } = await import("../db/pouch");
    await db.destroy();
    destroyed = true;
  } catch (err) {
    console.warn("[reset] db.destroy() fehlgeschlagen, lösche IndexedDB direkt:", err);
  }
  if (!destroyed) {
    try {
      // PouchDB-IndexedDB-Adapter prefixt den Namen mit "_pouch_".
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("_pouch_hotdoc-local");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    } catch {
      // egal — reset.html räumt den Rest
    }
  }
  // 3) Service-Worker + Caches über reset.html, danach frische App
  window.location.href = "/reset.html";
}

/**
 * Catch-all-Error-Boundary für die PWA.
 *
 * Wenn eine ungefangene Exception in einer React-Komponente fliegt
 * (z. B. „Cannot read properties of undefined"), zeigen wir statt
 * einer weißen Seite einen aufgeräumten Recovery-Screen mit:
 *  - Knopf „Neu laden" (window.location.reload)
 *  - Knopf „Tablet zurücksetzen" (löscht Token + Fahrzeug-Konfig)
 *  - Stack-Trace im Detail (nur für Funktionäre nützlich)
 *
 * Wichtig für den FF-Alltag: ein Tablet darf NIE „weiß" sein wenn
 * ein Funkrufname-Krachen passiert — der Mann am Wagen kann sonst
 * nichts mehr machen außer das Tablet neu zu starten.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorCount: 0, confirmWipe: false, wiping: false };

  static getDerivedStateFromError(err: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: err.message,
      ...(err.stack ? { errorStack: err.stack } : {}),
    };
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    // Best-effort: an Server schicken damit Funktionär später debuggen kann.
    // Kein Block — wenn das Backend down ist, wollen wir den Recovery-Screen
    // trotzdem zeigen.
    try {
      const token = localStorage.getItem("hotdoc.tabletToken");
      // Capacitor-Webview hat Origin localhost — relativ schlaegt fehl.
      // Cheap inline-resolution damit ErrorBoundary keine Module-Imports braucht
      // (kann passieren wenn das Module-Loading selber kaputt ist).
      const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      const errorUrl = cap?.isNativePlatform?.()
        ? "https://hotdoc-api.fly.dev/api/admin/client-error"
        : "/api/admin/client-error";
      void fetch(errorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: err.message,
          stack: err.stack?.slice(0, 2000),
          componentStack: info.componentStack?.slice(0, 2000),
          ua: navigator.userAgent.slice(0, 200),
          url: window.location.href,
          at: new Date().toISOString(),
        }),
      }).catch(() => {
        /* silent */
      });
    } catch {
      // egal — wir haben gerade einen Crash, kein Drama wenn Logging fehlschlägt
    }
    this.setState((s) => ({ errorCount: s.errorCount + 1 }));
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", err, info);
  }

  reset = (): void => {
    try {
      localStorage.removeItem("hotdoc.tabletToken");
      localStorage.removeItem("hotdoc.handoffInfo");
    } catch {
      // egal
    }
    window.location.href = "/";
  };

  reload = (): void => {
    window.location.reload();
  };

  /** C-13: harter Reset — erst nach zweitem Klick. */
  wipe = (): void => {
    if (this.state.wiping) return;
    this.setState({ wiping: true });
    void hardResetLocalData();
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background:
            "radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--red) 8%, var(--bg)) 0%, var(--bg) 60%)",
        }}
      >
        <div
          style={{
            width: "min(540px, 100%)",
            background: "var(--surface)",
            borderRadius: 18,
            border: "1px solid var(--border-strong)",
            padding: 28,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            boxShadow: "0 24px 64px -24px rgba(15,23,42,0.45)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 48,
                height: 48,
                borderRadius: 12,
                background:
                  "linear-gradient(135deg, var(--red) 0%, color-mix(in srgb, var(--red) 60%, #000) 100%)",
                color: "#fff",
              }}
            >
              <AlertTriangle size={26} />
            </span>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 27.5,
                  fontWeight: 800,
                  color: "var(--fg)",
                  letterSpacing: "-0.01em",
                }}
              >
                Unerwarteter Fehler
              </h1>
              <p
                style={{
                  margin: "4px 0 0",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
                }}
              >
                HotDoc · Recovery-Screen
              </p>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 17.5, lineHeight: 1.55, color: "var(--fg-2)" }}>
            Die App ist auf einen unerwarteten Fehler gestoßen und kann an dieser Stelle nicht
            weiterarbeiten. Deine Daten sind sicher im Backend gespeichert (alle Änderungen die
            du gespeichert hast sind nicht weg).
          </p>

          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              color: "var(--red)",
              overflow: "auto",
              maxHeight: 120,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {this.state.errorMessage ?? "Unbekannter Fehler"}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={this.reload}
              style={{
                flex: "1 1 200px",
                padding: "12px 18px",
                borderRadius: 12,
                border: 0,
                background:
                  "linear-gradient(180deg, var(--info) 0%, color-mix(in srgb, var(--info) 70%, #000) 100%)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 17.5,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 4px 12px rgba(37,99,235,0.32)",
              }}
            >
              <RefreshCw size={15} />
              Neu laden (empfohlen)
            </button>
            <button
              type="button"
              onClick={this.reset}
              style={{
                flex: "1 1 200px",
                padding: "12px 18px",
                borderRadius: 12,
                border: "1px solid var(--border-strong)",
                background: "var(--surface-2)",
                color: "var(--fg)",
                fontWeight: 600,
                fontSize: 17.5,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <RotateCcw size={15} />
              Tablet zurücksetzen
            </button>
          </div>

          {this.state.errorStack ? (
            <details style={{ marginTop: 4 }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
                }}
              >
                Technische Details (für Funktionär)
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 8,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  color: "var(--fg-2)",
                  overflow: "auto",
                  maxHeight: 200,
                  whiteSpace: "pre-wrap",
                }}
              >
                {this.state.errorStack}
              </pre>
              {this.state.errorCount > 1 ? (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12.5,
                    color: "var(--warn)",
                  }}
                >
                  {this.state.errorCount} Fehler in dieser Sitzung — Tablet zurücksetzen empfohlen
                </p>
              ) : null}
            </details>
          ) : null}

          {/* C-13: ab dem zweiten Crash in dieser Sitzung die letzte Rettung
              anbieten — lokale Daten komplett löschen (Drafts, PouchDB,
              Service-Worker). Zweistufig, weil unwiderruflich. */}
          {this.state.errorCount >= 2 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: "var(--red-tint)",
                border: "1px solid var(--red-border)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--fg-2)" }}>
                <strong style={{ color: "var(--red)" }}>Wiederholter Absturz.</strong> Wenn „Neu
                laden“ nicht hilft, sind wahrscheinlich die lokalen Daten auf diesem Gerät
                beschädigt. „Lokale Daten löschen“ entfernt Bericht-Entwürfe, die lokale
                Datenbank und den App-Cache — das Tablet startet danach wie neu (Fahrzeug
                wählen, PIN). Alles bereits Gesendete bleibt am Server.
              </div>
              {!this.state.confirmWipe ? (
                <button
                  type="button"
                  onClick={() => this.setState({ confirmWipe: true })}
                  style={{
                    alignSelf: "flex-start",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--red-border)",
                    background: "transparent",
                    color: "var(--red)",
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: "pointer",
                    minHeight: 44,
                  }}
                >
                  <Trash2 size={15} />
                  Lokale Daten löschen …
                </button>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 15.5, color: "var(--red)", fontWeight: 600, flex: 1, minWidth: 180 }}>
                    Wirklich alle lokalen Daten löschen?
                  </span>
                  <button
                    type="button"
                    onClick={() => this.setState({ confirmWipe: false })}
                    disabled={this.state.wiping}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--fg)",
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                      minHeight: 40,
                    }}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={this.wipe}
                    disabled={this.state.wiping}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: 0,
                      background: "var(--red)",
                      color: "#fff",
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: this.state.wiping ? "wait" : "pointer",
                      minHeight: 40,
                    }}
                  >
                    <Trash2 size={14} />
                    {this.state.wiping ? "Lösche …" : "Ja, alles löschen"}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <p
            style={{
              marginTop: 0,
              padding: 12,
              borderRadius: 10,
              background: "var(--info-tint)",
              border: "1px dashed var(--blue-border)",
              fontSize: 15,
              lineHeight: 1.5,
              color: "var(--fg-2)",
            }}
          >
            <strong>„Tablet zurücksetzen"</strong> löscht nur den Login-Token von diesem Gerät —
            Entwürfe bleiben erhalten. Du kannst dich danach mit der Fahrzeug-PIN wieder
            einloggen.
          </p>
        </div>
      </div>
    );
  }
}
