import { FAHRZEUGE, FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";
import { useState } from "react";
import { db } from "../db/pouch";

interface Props {
  onSetupDone: (fahrzeugId: FahrzeugId) => void;
}

export function Setup({ onSetupDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectFahrzeug(fId: FahrzeugId) {
    setBusy(true);
    setError(null);
    try {
      await db.put({
        _id: "fahrzeug:self",
        type: "fahrzeug-config",
        fahrzeugId: fId,
        tabletDeviceId: crypto.randomUUID(),
        setupAm: new Date().toISOString(),
      });
      onSetupDone(fId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <header className="text-center">
        <h1 className="font-condensed text-3xl font-bold tracking-tight">
          <span className="text-red">Hot</span>
          <span className="text-text-1">Doc</span>
        </h1>
        <p className="mt-2 text-sm text-text-2">
          Erstes Setup — wähle das Fahrzeug, auf dem dieses Tablet verlastet ist.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {FAHRZEUG_IDS.map((id) => {
          const f = FAHRZEUGE[id];
          return (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => selectFahrzeug(id)}
              className="flex items-center justify-between rounded-m border border-border bg-surface-1 px-4 py-3 text-left transition hover:border-border-strong hover:bg-surface-2 disabled:opacity-50"
            >
              <div>
                <div className="text-sm font-semibold text-text-1">{f.bezeichnung}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-3">
                  {f.funkrufname}
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-3">
                {f.besatzung.typ}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-s border border-red/40 bg-red/10 p-3 text-sm text-red">
          {error}
        </div>
      )}

      <p className="text-center font-mono text-[10px] uppercase tracking-wider text-text-3">
        Diese Einstellung kann später nur durch einen Funktionär geändert werden.
      </p>
    </div>
  );
}
