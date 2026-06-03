import { lazy, Suspense, useEffect, useState } from "react";
import { HandoffClaim } from "./components/HandoffClaim";
import { QrClaim } from "./components/QrClaim";
import { UpdateBanner } from "./components/UpdateBanner";
import { db, getFahrzeugConfig } from "./db/pouch";
import { apiCall, ApiError, getTabletToken, TOKEN_KEY } from "./lib/api";
import { registerDevice } from "./lib/device-register";
import { flushOutbox } from "./lib/einsatz-outbox";
import { flushRequestOutbox } from "./lib/request-outbox";
import { clearHandoffLocal, getHandoffInfo, isHandoffExpired } from "./lib/handoff";
import { clearReportStates } from "./lib/report-state";
import { BerichtPage } from "./pages/BerichtPage";
import { ZentralePage } from "./pages/ZentralePage";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

// Lazy-Loaded Pages — Setup wird nur beim Erst-Login gebraucht (nicht beim
// Daily-Boot), FlorianMapPopout nur wenn die ZentralePage ein zweites
// Fenster oeffnet. Spart auf dem Standard-Tablet ~30 kB JS beim First-Paint.
// React.lazy() lost den Default-Export auf — beide Module exportieren
// named, deshalb der `.then`-Wrapper.
const Setup = lazy(() => import("./pages/Setup").then((m) => ({ default: m.Setup })));
const FlorianMapPopout = lazy(() =>
  import("./pages/FlorianMapPopout").then((m) => ({ default: m.FlorianMapPopout })),
);

type State =
  | { kind: "loading" }
  | { kind: "setup" }
  | { kind: "handoff-claim"; code: string }
  | { kind: "qr-claim"; token: string }
  | { kind: "ready"; fahrzeugId: FahrzeugId };

/**
 * Liest den Handoff-Code aus der URL `/handoff/<code>` falls vorhanden.
 * Returnt `null` wenn die URL keine Handoff-Übergabe ist.
 */
function readHandoffCodeFromUrl(): string | null {
  const m = /^\/handoff\/([A-Z0-9]{8})\/?$/i.exec(window.location.pathname);
  return m?.[1] ? m[1].toUpperCase() : null;
}

/**
 * Liest den QR-Anker-Token aus der URL `/qr/<token>` falls vorhanden.
 * Der Token ist ein JWT, daher kommt er base64-ähnlich mit Punkten
 * vor — wir akzeptieren ein großzügiges Charset und prüfen ihn dann
 * serverseitig.
 */
function readQrTokenFromUrl(): string | null {
  const m = /^\/qr\/([A-Za-z0-9_.-]{20,800})\/?$/.exec(window.location.pathname);
  return m?.[1] ?? null;
}

/**
 * Kleiner Fallback fuer Lazy-Loaded Routen — bewusst minimal, damit der
 * Browser ihn ohne weitere Chunk-Loads rendern kann. Gleicher Look wie der
 * Loading-State weiter unten, damit der User keinen Bruch wahrnimmt.
 */
function LazyFallback() {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        color: "var(--fg-3)",
        fontFamily: "var(--font-mono)",
        fontSize: 15,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      lädt …
    </div>
  );
}

export function App() {
  // Pop-Out-Route: wird via window.open('/florian-map') aus ZentralePage
  // geoeffnet. Eigene Toplevel-Page ohne State-Machine, eigenes Polling.
  // Bypassed Setup/Handoff/QR-Routing — wenn kein Token vorhanden, zeigt
  // FlorianMapPopout eine eigene Fehlermeldung.
  if (window.location.pathname === "/florian-map") {
    return (
      <Suspense fallback={<LazyFallback />}>
        <FlorianMapPopout />
      </Suspense>
    );
  }
  const [state, setState] = useState<State>({ kind: "loading" });
  // Re-Boot-Generation: erhoeht sich wenn der Watchdog erkennt dass das
  // Tablet lange weg war. Dadurch laeuft boot() erneut und holt frische Daten.
  const [bootGen, setBootGen] = useState(0);

  useEffect(() => {
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootGen]);

  // Inaktivitaets-Watchdog — Symptom war: Tablet haengt nach Stunden im Standby
  // mit weissem Screen oder einem alten UI-Stand. Ursache: Browser parkt JS-
  // Engine im Hintergrund (Memory-Pressure auf Android), Service-Worker-State
  // friert ein, setIntervals laufen nicht mehr, Token kann expired sein.
  //
  // Strategie:
  //   * visibilitychange beobachten + Zeitstempel des Hidden-Beginns merken
  //   * Beim Wieder-Visible: wenn > 5 min weg → Re-Boot (Token-Check + Data)
  //   * Wenn > 60 min weg → Full-Reload (Service-Worker-Bundle aktualisieren)
  //   * Bei BFCache-Restore (pageshow event.persisted=true) ebenfalls re-boot
  //   * Bei Online-Wechsel: re-boot, weil offline-Period oft die Auth verliert
  useEffect(() => {
    let hiddenSince: number | null = null;
    const VIS_REBOOT_MIN = 5;
    const VIS_RELOAD_MIN = 60;

    const handleResume = (reason: string, elapsedMin: number): void => {
      console.info(
        `[watchdog] resume reason=${reason} elapsedMin=${elapsedMin.toFixed(1)}`,
      );
      if (elapsedMin > VIS_RELOAD_MIN) {
        try {
          window.location.reload();
        } catch {
          setBootGen((g) => g + 1);
        }
      } else if (elapsedMin > VIS_REBOOT_MIN) {
        setBootGen((g) => g + 1);
      }
    };

    const onVisChange = (): void => {
      if (document.visibilityState === "hidden") {
        hiddenSince = Date.now();
        return;
      }
      if (document.visibilityState === "visible" && hiddenSince) {
        const elapsedMin = (Date.now() - hiddenSince) / 60_000;
        hiddenSince = null;
        handleResume("visibilitychange", elapsedMin);
      }
    };

    // Safari/iOS schiesst pageshow event.persisted=true wenn die Seite aus
    // dem BFCache wiederbelebt wird — dort ist die JS-Welt eingefroren
    // gewesen, Tokens muessen revalidiert werden.
    const onPageShow = (e: PageTransitionEvent): void => {
      if (e.persisted) handleResume("bfcache", VIS_REBOOT_MIN + 1);
    };

    const onOnline = (): void => handleResume("online", VIS_REBOOT_MIN + 1);

    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Background-Worker fuer die Einsatz-Outbox: alle 30 s versuchen wir
  // wartende Einsatz-Anlagen ins Backend zu schieben. Zusaetzlich triggert
  // ein Wechsel auf "online" einen Sofort-Flush.
  useEffect(() => {
    const tick = (): void => {
      void flushOutbox().catch((err) => {
        console.warn("[outbox] flush failed", err);
      });
      // BLOCKER-2b+3 (Audit 2026-06-03): auch die generische Request-Outbox
      // flushen (gepufferte Fahrzeugbericht-Abschlüsse + Einsatz-Abschlüsse,
      // die im Funkloch nicht durchkamen).
      void flushRequestOutbox().catch((err) => {
        console.warn("[request-outbox] flush failed", err);
      });
    };
    tick();
    const t = setInterval(tick, 30_000);
    const onOnline = (): void => tick();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  async function boot() {
    // Notfall-Übergabe: URL `/handoff/<code>` hat Priorität vor allem anderen.
    // Der Empfänger braucht keinen vorherigen Tablet-Setup — Token kommt
    // direkt vom Backend nach Claim. Nach erfolgreichem Claim wird das
    // Quell-Fahrzeug aus der API-Antwort übernommen und der Setup
    // übersprungen.
    const handoffCode = readHandoffCodeFromUrl();
    if (handoffCode) {
      setState({ kind: "handoff-claim", code: handoffCode });
      return;
    }
    // QR-Sticker-Auto-Login: URL `/qr/<token>` triggert sofortigen Login
    // als das Fahrzeug, das im signierten Token steht. Multi-Device-fähig —
    // mehrere Tablets/Handys können denselben QR scannen ohne dass die
    // anderen abgemeldet werden.
    const qrToken = readQrTokenFromUrl();
    if (qrToken) {
      setState({ kind: "qr-claim", token: qrToken });
      return;
    }
    // Auto-Release-Check: Hat eine Handoff-Sitzung ihre 24h überschritten?
    // Dann lokales Token + handoffInfo löschen — der User landet im Setup,
    // und das eigentliche Tablet kann sich wieder mit PIN einloggen.
    const handoffInfo = getHandoffInfo();
    if (handoffInfo && isHandoffExpired(handoffInfo)) {
      clearHandoffLocal();
      // Fahrzeug-Konfig auch entfernen — das hier ist ein Handy nach
      // Auto-Release, soll nicht weiter als „Pumpe Eberstalzell" auftreten.
      const fc = await getFahrzeugConfig();
      if (fc) {
        try {
          await db.remove(fc._id, fc._rev);
        } catch {
          // egal
        }
      }
      setState({ kind: "setup" });
      return;
    }
    const doc = await getFahrzeugConfig();
    if (doc?.fahrzeugId) {
      // Token-Drift-Check: Wenn dieses Tablet als "zentrale" konfiguriert ist,
      // muss der vorhandene Token die Rolle einsatzleiter (oder höher) tragen.
      // Hintergrund: bis zum 27.05.2026 wurde die Rolle beim PIN-Login hart auf
      // "mannschaft" gemappt — auch für zentrale. Nach dem Backend-Fix tragen
      // bestehende Tokens noch die alte Rolle und stoßen beim Abschluss auf 403.
      // Statt den User auf den Fehler laufen zu lassen, erkennen wir den Drift
      // beim Boot und zwingen einen frischen PIN-Login.
      // Token-Validity-Check für ALLE Fahrzeuge (nicht nur zentrale): wenn der
      // Token aus irgendeinem Grund tot ist (Server-Restart, JWT-Secret-Rotation,
      // localStorage-Race auf iOS-Safari im PWA-Mode), liefert /api/auth/me 401
      // und wir müssen sofort zurück zum Setup — sonst läuft die App in einen
      // 401-Folge-Schauer ohne Auto-Recovery.
      if (getTabletToken()) {
        try {
          const me = await apiCall<{ ok: true; rolle: string; fahrzeugId?: string }>(
            "/api/auth/me",
          );
          // Token-Drift: Zentrale-Tablet mit alter mannschaft-Rolle → Re-Auth.
          if (doc.fahrzeugId === "zentrale" && me.rolle === "mannschaft") {
            try {
              localStorage.removeItem(TOKEN_KEY);
              sessionStorage.setItem("hotdoc.setupReason", "role-stale");
            } catch {
              // egal
            }
            setState({ kind: "setup" });
            return;
          }
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            // Token ist tot — sauber zum Setup, mit erklärendem Hinweis.
            try {
              localStorage.removeItem(TOKEN_KEY);
              localStorage.removeItem("hotdoc.handoffInfo");
              sessionStorage.setItem("hotdoc.setupReason", "auth-failed");
            } catch {
              // egal
            }
            setState({ kind: "setup" });
            return;
          }
          // 5xx / Netzfehler: tolerant — der User kann offline weiter arbeiten,
          // beim nächsten Online-Call greift apiCall's eigene Auto-Logout-Logik.
        }
      } else {
        // Kein Token aber Fahrzeug-Doc → die App war mal angemeldet, der Token
        // ist aber verschwunden (z. B. iOS-Safari hat localStorage gelöscht
        // wegen 7-Tage-ITP, oder User hat localStorage manuell geleert).
        try {
          sessionStorage.setItem("hotdoc.setupReason", "auth-failed");
        } catch {
          // egal
        }
        setState({ kind: "setup" });
        return;
      }
      setState({ kind: "ready", fahrzeugId: doc.fahrzeugId });
      // Auto-Register: sobald die Boot-Sequenz "ready" erreicht hat, melden
      // wir das Tablet beim Backend an. Idempotent — bei jedem Boot werden
      // appVersion, letztesUpdateAm und ggf. neuer FCM-Token aktualisiert.
      void registerDevice().catch((err) => {
        console.warn("[boot] device-register failed", err);
      });
    } else {
      setState({ kind: "setup" });
    }
  }

  /**
   * Logout-Helper für den Single-Device-Modus.
   * Bei Übergabe an Handy ruft das Tablet das auf — Token wird gelöscht,
   * Fahrzeug-Konfig bleibt aber bestehen (PIN-Login geht direkt zum
   * gleichen Fahrzeug zurück, falls das Tablet doch wieder Strom kriegt).
   */
  async function tabletSelfLogout() {
    try {
      localStorage.removeItem("hotdoc.tabletToken");
    } catch {
      // egal — Token ist gone genug
    }
    // URL säubern damit ein Reload nicht im Handoff-Claim-Modus landet
    try {
      window.history.replaceState({}, "", "/");
    } catch {
      // egal
    }
    setState({ kind: "setup" });
  }

  async function resetSetup() {
    const doc = await getFahrzeugConfig();
    if (doc) await db.remove(doc._id, doc._rev);
    // Bei Setup-Reset alle lokalen Bericht-Abschluss-States loeschen — wenn
    // der Funktionaer das Tablet an ein anderes Fahrzeug uebergibt, soll
    // der naechste User nicht alte "abgeschlossen"-Markierungen sehen.
    // Pro Fahrzeug ein Eintrag (hotdoc.report-state.<id>); wir loeschen
    // sicherheitshalber alle.
    for (const id of Object.keys(FAHRZEUGE) as FahrzeugId[]) {
      clearReportStates(id);
    }
    setState({ kind: "setup" });
  }

  async function switchFahrzeug(id: FahrzeugId) {
    const doc = await getFahrzeugConfig();
    if (doc) {
      await db.put({ ...doc, fahrzeugId: id, geaendertAm: new Date().toISOString() });
    } else {
      await db.put({
        _id: "fahrzeug:self",
        type: "fahrzeug-config",
        fahrzeugId: id,
        tabletDeviceId: crypto.randomUUID(),
        setupAm: new Date().toISOString(),
      });
    }
    setState({ kind: "loading" });
    setTimeout(() => setState({ kind: "ready", fahrzeugId: id }), 0);
  }

  if (state.kind === "loading") {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          color: "var(--fg-3)",
          fontFamily: "var(--font-mono)",
          fontSize: 15,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        lädt …
      </div>
    );
  }

  if (state.kind === "handoff-claim") {
    return (
      <HandoffClaim
        code={state.code}
        onComplete={async (fahrzeugId) => {
          // Empfänger übernimmt die Tablet-Konfig — wenn der das Handy
          // ist, hat es vorher keinen `fahrzeug:self`-Eintrag. Wir
          // schreiben ihn jetzt damit beim nächsten Reload kein PIN
          // mehr nötig ist. Die Personalliste kommt nicht mehr lokal
          // aus dem Seed, sondern bei Bedarf live aus /api/admin/personen.
          const existing = await getFahrzeugConfig();
          if (!existing) {
            await db.put({
              _id: "fahrzeug:self",
              type: "fahrzeug-config",
              fahrzeugId,
              tabletDeviceId: crypto.randomUUID(),
              setupAm: new Date().toISOString(),
            });
          } else if (existing.fahrzeugId !== fahrzeugId) {
            await db.put({
              ...existing,
              fahrzeugId,
              geaendertAm: new Date().toISOString(),
            });
          }
          // URL säubern damit ein Reload nicht erneut den Claim triggert
          try {
            window.history.replaceState({}, "", "/");
          } catch {
            // egal
          }
          setState({ kind: "ready", fahrzeugId });
        }}
        onCancel={() => {
          // Cancel: Setup-Screen für Neueinrichtung
          try {
            window.history.replaceState({}, "", "/");
          } catch {
            // egal
          }
          setState({ kind: "setup" });
        }}
      />
    );
  }

  if (state.kind === "qr-claim") {
    return (
      <QrClaim
        token={state.token}
        onComplete={(fahrzeugId) => {
          try {
            window.history.replaceState({}, "", "/");
          } catch {
            // egal
          }
          setState({ kind: "ready", fahrzeugId });
        }}
        onCancel={() => {
          try {
            window.history.replaceState({}, "", "/");
          } catch {
            // egal
          }
          setState({ kind: "setup" });
        }}
      />
    );
  }

  if (state.kind === "setup") {
    return (
      <Suspense fallback={<LazyFallback />}>
        <Setup onSetupDone={(id) => setState({ kind: "ready", fahrzeugId: id })} />
      </Suspense>
    );
  }

  // Zentrale → Hauptbericht-Ansicht
  if (state.fahrzeugId === "zentrale") {
    return (
      <>
        <ZentralePage
          key="zentrale"
          onSwitchFahrzeug={switchFahrzeug}
          onResetSetup={resetSetup}
          onHandoffLogout={tabletSelfLogout}
        />
        <UpdateBanner />
      </>
    );
  }

  // KDO/TLF/LFA-B/MTF → einheitliche Fahrzeugbericht-Page
  return (
    <>
      <BerichtPage
        key={state.fahrzeugId}
        fahrzeugId={state.fahrzeugId}
        onSwitchFahrzeug={switchFahrzeug}
        onResetSetup={resetSetup}
        onHandoffLogout={tabletSelfLogout}
      />
      <UpdateBanner />
    </>
  );
}
