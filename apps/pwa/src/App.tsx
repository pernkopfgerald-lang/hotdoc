import { useEffect, useState } from "react";
import { db, getFahrzeugConfig } from "./db/pouch";
import { Dashboard } from "./pages/Dashboard";
import { Setup } from "./pages/Setup";
import type { FahrzeugId } from "@hotdoc/shared";

type State =
  | { kind: "loading" }
  | { kind: "setup" }
  | { kind: "ready"; fahrzeugId: FahrzeugId };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    void loadConfig();
  }, []);

  async function loadConfig() {
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

  return <Dashboard fahrzeugId={state.fahrzeugId} onResetSetup={resetSetup} />;
}
