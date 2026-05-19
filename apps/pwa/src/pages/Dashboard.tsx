import { Construction, Radio } from "lucide-react";
import { useState } from "react";
import { RufnameBar } from "../components/RufnameBar";
import { Topbar } from "../components/Topbar";
import { VehicleSwitcherModal } from "../components/VehicleSwitcherModal";
import { useGeolocation } from "../lib/geo";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

interface Props {
  fahrzeugId: FahrzeugId;
  onSwitchFahrzeug: (id: FahrzeugId) => void;
  onResetSetup: () => void;
}

/**
 * Übergangs-View für Fahrzeuge, deren Erfassungs-Layout noch nicht
 * gebaut ist. Aktuell hat nur LFA-B die volle Bericht-UI; KDO/TLF/MTF/
 * Zentrale kommen in eigenen Slices (jeder mit eigenem Mannschafts-
 * Layout, Gerätelisten, Spezialfeldern).
 */
export function Dashboard({ fahrzeugId, onSwitchFahrzeug, onResetSetup }: Props) {
  const fahrzeug = FAHRZEUGE[fahrzeugId];
  const geo = useGeolocation();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-10">
      <Topbar funkrufname={fahrzeug.funkrufname} geo={geo} />
      <RufnameBar fahrzeugId={fahrzeugId} onSwitch={() => setSwitcherOpen(true)} />

      <main className="flex flex-col gap-3.5 px-4 pb-8 pt-4">
        <section
          className="rounded-m border p-5"
          style={{
            borderColor: "var(--amber-border)",
            background: "var(--card-gradient)",
            boxShadow: "0 24px 60px -32px var(--amber-glow), var(--shadow-card)",
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="grid h-12 w-12 place-items-center rounded-md text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--amber) 0%, color-mix(in srgb, var(--amber) 60%, #000) 100%)",
                boxShadow: "0 0 22px -2px var(--amber-glow)",
              }}
            >
              <Construction size={24} strokeWidth={2.2} />
            </span>
            <div className="flex flex-col leading-tight">
              <h1 className="font-condensed text-[22px] font-bold tracking-tight text-text-1">
                {fahrzeug.bezeichnung}
              </h1>
              <span
                className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "var(--amber)" }}
              >
                Erfassungs-Layout in Arbeit
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-s border" style={{ borderColor: "var(--border-strong)" }}>
            <Stat label="Funkrufname" value={fahrzeug.funkrufname} />
            <Stat label="Besatzung" value={`${fahrzeug.besatzung.typ} · ${fahrzeug.besatzung.gesamtSitzplaetze} Sitzpl.`} divided />
          </div>

          <p className="mt-4 text-[13px] leading-relaxed text-text-2">
            Dieses Tablet ist als <strong className="text-text-1">{fahrzeug.bezeichnung}</strong> konfiguriert.
            Die spezifische Erfassungs-Maske ({fahrzeug.besatzung.mannschaftsplaetzeZusaetzlich} Mannschaftsplätze,
            fahrzeug-spezifische Gerätelisten) wird in einem Folge-Slice gebaut.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-text-2">
            <strong className="text-text-1">Voll funktionsfähig:</strong> LFA-B (Pumpe Eberstalzell)
            — Wechsel über den Funkrufnamen-Button oben.
          </p>

          <button
            type="button"
            onClick={() => setSwitcherOpen(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-m px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white transition active:translate-y-px"
            style={{
              background: "linear-gradient(180deg, var(--amber) 0%, color-mix(in srgb, var(--amber) 60%, #000) 100%)",
              border: "1px solid color-mix(in srgb, var(--amber) 60%, #000)",
              boxShadow: "0 10px 24px -8px var(--amber-glow), inset 0 1px 0 rgba(255,255,255,0.22)",
            }}
          >
            <Radio size={16} />
            Anderes Fahrzeug wählen
          </button>
        </section>

        <section
          className="rounded-m border p-4"
          style={{
            borderColor: "var(--border-strong)",
            background: "var(--card-gradient)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-text-3">
            Roadmap dieses Fahrzeugtyps
          </h3>
          <ul className="mt-2 space-y-1.5 text-[13px] text-text-2">
            <li>· Mannschaftsplätze gemäß Sollstärke ({fahrzeug.besatzung.typ})</li>
            <li>· Gerätelisten zugeschnitten auf {fahrzeug.bezeichnung}</li>
            {fahrzeugId === "zentrale" ? (
              <>
                <li>· Hauptbericht-Layout (Anhang B des Spec)</li>
                <li>· Aggregation der Fahrzeugberichte aus dem Einsatz</li>
                <li>· PDF + Spickzettel-Ausgabe</li>
              </>
            ) : (
              <>
                <li>· Atemschutz-Stepper pro Mannschaftsplatz (max. 30 min)</li>
                <li>· Push-to-Talk-Diktat + Whisper-Transkription</li>
                <li>· Zusätzliche Aufträge · Einsatz abschließen</li>
              </>
            )}
          </ul>
        </section>

        <footer className="flex items-center justify-between px-1 pb-2 pt-4 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
          <span>
            <span style={{ color: "var(--red)" }}>Hot</span>
            <span className="text-text-1">Doc</span> · UC2 · v0.4
          </span>
          <button type="button" onClick={onResetSetup} className="underline hover:text-text-2">
            Setup zurücksetzen
          </button>
        </footer>
      </main>

      <VehicleSwitcherModal
        open={switcherOpen}
        current={fahrzeugId}
        onSelect={(id) => {
          setSwitcherOpen(false);
          onSwitchFahrzeug(id);
        }}
        onClose={() => setSwitcherOpen(false)}
      />
    </div>
  );
}

function Stat({ label, value, divided }: { label: string; value: string; divided?: boolean }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: "color-mix(in srgb, var(--surface-2) 70%, transparent)",
        borderLeft: divided ? "1px solid var(--border)" : undefined,
      }}
    >
      <dt className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
        {label}
      </dt>
      <dd className="m-0 mt-0.5 text-[14px] font-bold text-text-1">{value}</dd>
    </div>
  );
}
