import { useEffect, useState } from "react";
import { db, getFahrzeugConfig } from "./db/pouch";
import { seedIfEmpty } from "./db/seed";
import { Dashboard } from "./pages/Dashboard";
import { LfaBPage } from "./pages/LfaBPage";
import { Setup } from "./pages/Setup";
import type { FahrzeugId } from "@hotdoc/shared";

type State =
  | { kind: "loading" }
  | { kind: "setup" }
  | { kind: "ready"; fahrzeugId: FahrzeugId };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    void boot();
  }, []);

  async function boot() {
    await seedIfEmpty();
    const doc = await getFahrzeugConfig();
    if (doc?.fahrzeugId) {
      setState({ kind: "ready", fahrzeugId: doc.fahrzeugId });
    } else {
      setState({ kind: "setup" });
    }
  }

  async function resetSetup() {
    const doc = await getFahrzeugConfig();
    if (doc) await db.remove(doc._id, doc._rev);
    setState({ kind: "setup" });
  }

  /**
   * In-App-Wechsel auf ein anderes Fahrzeug. Persistiert die neue Auswahl
   * und remountet die Page durch State-Wechsel. Kein Reset-Setup nötig.
   */
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
    // Loading-Zwischenschritt erzwingt Remount aller Pages mit frischer Page-ID
    setState({ kind: "loading" });
    setTimeout(() => setState({ kind: "ready", fahrzeugId: id }), 0);
  }

  if (state.kind === "loading") {
    return (
      <div className="grid min-h-screen place-items-center text-text-3">
        <span className="font-mono text-xs uppercase tracking-wider">lädt …</span>
      </div>
    );
  }

  if (state.kind === "setup") {
    return <Setup onSetupDone={(id) => setState({ kind: "ready", fahrzeugId: id })} />;
  }

  // LFA-B-Tablet: volles Erfassungs-UI
  if (state.fahrzeugId === "lfa-b") {
    return (
      <LfaBPage
        key={state.fahrzeugId}
        onSwitchFahrzeug={switchFahrzeug}
        onResetSetup={resetSetup}
      />
    );
  }

  // Andere Fahrzeuge / Zentrale: zeigen vorerst das Dashboard
  return (
    <Dashboard
      key={state.fahrzeugId}
      fahrzeugId={state.fahrzeugId}
      onSwitchFahrzeug={switchFahrzeug}
      onResetSetup={resetSetup}
    />
  );
}
