import { useEffect, useState } from "react";
import { HandoffClaim } from "./components/HandoffClaim";
import { db, getFahrzeugConfig } from "./db/pouch";
import { seedIfEmpty } from "./db/seed";
import { clearHandoffLocal, getHandoffInfo, isHandoffExpired } from "./lib/handoff";
import { BerichtPage } from "./pages/BerichtPage";
import { Setup } from "./pages/Setup";
import { ZentralePage } from "./pages/ZentralePage";
import type { FahrzeugId } from "@hotdoc/shared";

type State =
  | { kind: "loading" }
  | { kind: "setup" }
  | { kind: "handoff-claim"; code: string }
  | { kind: "ready"; fahrzeugId: FahrzeugId };

/**
 * Liest den Handoff-Code aus der URL `/handoff/<code>` falls vorhanden.
 * Returnt `null` wenn die URL keine Handoff-Übergabe ist.
 */
function readHandoffCodeFromUrl(): string | null {
  const m = /^\/handoff\/([A-Z0-9]{8})\/?$/i.exec(window.location.pathname);
  return m?.[1] ? m[1].toUpperCase() : null;
}

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    void boot();
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
    await seedIfEmpty();
    const doc = await getFahrzeugConfig();
    if (doc?.fahrzeugId) {
      setState({ kind: "ready", fahrzeugId: doc.fahrzeugId });
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
          fontSize: 12,
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
          // mehr nötig ist. Außerdem seedIfEmpty damit die lokale
          // PouchDB die Personalliste hat (das Handy hatte vorher gar
          // nichts gestartet).
          await seedIfEmpty();
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

  if (state.kind === "setup") {
    return <Setup onSetupDone={(id) => setState({ kind: "ready", fahrzeugId: id })} />;
  }

  // Zentrale → Hauptbericht-Ansicht
  if (state.fahrzeugId === "zentrale") {
    return (
      <ZentralePage
        key="zentrale"
        onSwitchFahrzeug={switchFahrzeug}
        onResetSetup={resetSetup}
        onHandoffLogout={tabletSelfLogout}
      />
    );
  }

  // KDO/TLF/LFA-B/MTF → einheitliche Fahrzeugbericht-Page
  return (
    <BerichtPage
      key={state.fahrzeugId}
      fahrzeugId={state.fahrzeugId}
      onSwitchFahrzeug={switchFahrzeug}
      onResetSetup={resetSetup}
      onHandoffLogout={tabletSelfLogout}
    />
  );
}
