import { useEffect, useState } from "react";
import { db, getFahrzeugConfig } from "./db/pouch";
import { seedIfEmpty } from "./db/seed";
import { BerichtPage } from "./pages/BerichtPage";
import { Setup } from "./pages/Setup";
import { ZentralePage } from "./pages/ZentralePage";
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
    />
  );
}
