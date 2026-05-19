import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";
import { Topbar } from "../components/Topbar";

interface Props {
  fahrzeugId: FahrzeugId;
  onResetSetup: () => void;
}

export function Dashboard({ fahrzeugId, onResetSetup }: Props) {
  const fahrzeug = FAHRZEUGE[fahrzeugId];

  return (
    <div className="min-h-screen pb-10">
      <Topbar funkrufname={fahrzeug.funkrufname} />

      <main className="mx-auto max-w-3xl px-4 pt-4">
        <section className="rounded-m border border-border bg-surface-1 p-4">
          <h2 className="text-base font-semibold text-text-1">Tablet konfiguriert</h2>
          <p className="mt-1 text-sm text-text-2">
            Fahrzeug: <strong className="text-text-1">{fahrzeug.bezeichnung}</strong> ·{" "}
            Funkrufname: <strong className="text-text-1">{fahrzeug.funkrufname}</strong>
          </p>
          <p className="mt-1 text-sm text-text-2">
            Besatzung: {fahrzeug.besatzung.typ} ({fahrzeug.besatzung.gesamtSitzplaetze} Sitzplätze,
            {" "}{fahrzeug.besatzung.mannschaftsplaetzeZusaetzlich} Mannschaftsplätze im UI)
          </p>
        </section>

        <section className="mt-4 rounded-m border border-dashed border-border bg-surface-1 p-4">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-3">
            Phase 1.1 fertig
          </h3>
          <p className="mt-2 text-sm text-text-2">
            Monorepo-Skeleton steht. PouchDB persistiert dein Setup. Nächste Schritte:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-text-2">
            <li>· Phase 1.2 — CouchDB-Sync einrichten (Backend muss laufen)</li>
            <li>· Phase 2 — Fahrzeugbericht-Komponenten aus Prototyp portieren</li>
            <li>· Phase 3 — Alarm-Flow mit BlaulichtSMS-Polling</li>
          </ul>
        </section>

        <button
          type="button"
          onClick={onResetSetup}
          className="mt-6 font-mono text-[10px] uppercase tracking-wider text-text-3 underline hover:text-text-2"
        >
          Setup zurücksetzen (Dev)
        </button>
      </main>
    </div>
  );
}
