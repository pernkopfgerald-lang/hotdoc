import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AlarmCard } from "../components/AlarmCard";
import { ChronikTimeline, type ChronikEintrag } from "../components/ChronikTimeline";
import { DemoBanner } from "../components/DemoBanner";
import { DictateButton } from "../components/DictateButton";
import { GearChips } from "../components/GearChips";
import {
  MannschaftSlot,
  emptySlot,
  type MannschaftSlotData,
} from "../components/MannschaftSlot";
import { MapCard, type MapPosition } from "../components/MapCard";
import { PersonButton } from "../components/PersonButton";
import { PersonPickerModal, type PickPerson } from "../components/PersonPickerModal";
import { RufnameBar } from "../components/RufnameBar";
import { Topbar } from "../components/Topbar";
import {
  DEMO_ALARM,
  DEMO_GEAR_LFA_B,
  DEMO_HYDRANTEN,
  EINSATZ_POS,
  HOME_POS,
  initialChronik,
  makeInitialFleet,
} from "../data/demo-alarm";
import { getAllPersonen } from "../db/seed";
import { haversineKm, useGeolocation } from "../lib/geo";
import { FAHRZEUGE } from "@hotdoc/shared";

type PickerTarget = { kind: "fahrer" } | { kind: "kdt" } | { kind: "crew"; slot: number };

const FAHRZEUG_ID = "lfa-b" as const;
const KM_ABFAHRT = 34712;

export function LfaBPage({ onResetSetup }: { onResetSetup: () => void }) {
  const fahrzeug = FAHRZEUGE[FAHRZEUG_ID];

  const [personen, setPersonen] = useState<PickPerson[]>([]);
  const [pickerOpen, setPickerOpen] = useState<PickerTarget | null>(null);

  const [fahrer, setFahrer] = useState<PickPerson | null>(null);
  const [kdt, setKdt] = useState<PickPerson | null>(null);
  const [mannschaft, setMannschaft] = useState<MannschaftSlotData[]>(
    () => Array.from({ length: fahrzeug.besatzung.mannschaftsplaetzeZusaetzlich }, (_, i) => emptySlot(i + 1)),
  );

  const [gearSelected, setGearSelected] = useState<Set<string>>(new Set(["ts-pumpe", "schlauchmaterial"]));
  const [oelSaecke, setOelSaecke] = useState(0);

  const [chronik, setChronik] = useState<ChronikEintrag[]>(() => initialChronik(fahrzeug.funkrufname));
  const [fleet, setFleet] = useState<MapPosition[]>(makeInitialFleet);

  // Echte GPS-Position über navigator.geolocation. Fallback HOME_POS,
  // solange noch nichts da ist (= sofort kartenfähig statt Blocker).
  const geo = useGeolocation();
  const selfPos = geo.fix
    ? { lat: geo.fix.lat, lng: geo.fix.lng }
    : HOME_POS;

  // GPS-Spur für KM-Berechnung. Wird bei jedem Fix erweitert.
  const trackRef = useRef<{ lat: number; lng: number }[]>([]);
  const [kmGefahren, setKmGefahren] = useState(0);
  useEffect(() => {
    if (!geo.fix) return;
    const pt = { lat: geo.fix.lat, lng: geo.fix.lng };
    const track = trackRef.current;
    const last = track[track.length - 1];
    // 8m-Glättung: kleinere Sprünge verwerfen (GPS-Rauschen).
    if (!last || haversineKm(last, pt) * 1000 > 8) {
      track.push(pt);
      const total = track.reduce(
        (sum, p, i) => (i === 0 ? 0 : sum + haversineKm(track[i - 1]!, p)),
        0,
      );
      setKmGefahren(total);
    }
  }, [geo.fix]);

  // Personalliste laden + Mock-Initialisierung
  useEffect(() => {
    void (async () => {
      const docs = await getAllPersonen();
      setPersonen(docs as unknown as PickPerson[]);
      // Demo-Vorbelegung: Eder als Kdt, Bruckner als Fahrer, paar Slots
      const byId = new Map(docs.map((p) => [p.syBosId, p as unknown as PickPerson]));
      const eder = byId.get(107375);
      const bruckner = byId.get(123057);
      const huemer = byId.get(107452);
      const almhofer = byId.get(107506);
      if (eder) setKdt(eder);
      if (bruckner) setFahrer(bruckner);
      setMannschaft((prev) => {
        const next = [...prev];
        if (huemer && next[0]) next[0] = { ...next[0], person: huemer, atemschutzAktiv: true, atemschutzDauerMin: 15 };
        if (almhofer && next[1]) next[1] = { ...next[1], person: almhofer };
        return next;
      });
    })();
  }, []);

  // Eigene Position in der fleet-Liste mit echter GPS-Position synchronisieren.
  // Andere Fahrzeuge bewegen sich weiterhin simuliert (echtes Multi-Tablet-
  // Position-Sharing folgt in Phase 4 mit SSE-Endpoint).
  useEffect(() => {
    const id = setInterval(() => {
      setFleet((prev) =>
        prev.map((f) => {
          if (f.isSelf) {
            return { ...f, lat: selfPos.lat, lng: selfPos.lng };
          }
          return {
            ...f,
            lat: f.lat + (Math.random() - 0.5) * 0.0008,
            lng: f.lng + (Math.random() - 0.5) * 0.0008,
          };
        }),
      );
    }, 3000);
    return () => clearInterval(id);
  }, [selfPos.lat, selfPos.lng]);

  const bereitsGewaehlt = useMemo(() => {
    const s = new Set<number>();
    if (fahrer) s.add(fahrer.syBosId);
    if (kdt) s.add(kdt.syBosId);
    for (const m of mannschaft) if (m.person) s.add(m.person.syBosId);
    return s;
  }, [fahrer, kdt, mannschaft]);

  function selectPerson(p: PickPerson) {
    if (!pickerOpen) return;
    if (pickerOpen.kind === "fahrer") setFahrer(p);
    else if (pickerOpen.kind === "kdt") setKdt(p);
    else {
      const slotIdx = pickerOpen.slot - 1;
      setMannschaft((prev) =>
        prev.map((m, i) => (i === slotIdx ? { ...m, person: p } : m)),
      );
    }
    setPickerOpen(null);
  }

  function pickerTitle(): string {
    if (!pickerOpen) return "";
    if (pickerOpen.kind === "fahrer") return "Fahrer wählen";
    if (pickerOpen.kind === "kdt") return "Fahrzeug-Kommandant wählen";
    return `Mannschaftsplatz ${pickerOpen.slot}`;
  }

  function toggleMannschaftAs(idx: number) {
    setMannschaft((prev) =>
      prev.map((m, i) =>
        i === idx ? { ...m, atemschutzAktiv: !m.atemschutzAktiv } : m,
      ),
    );
  }
  function setMannschaftAsDauer(idx: number, dauer: number) {
    setMannschaft((prev) => prev.map((m, i) => (i === idx ? { ...m, atemschutzDauerMin: dauer } : m)));
  }

  function addChronikDiktat() {
    const now = new Date();
    setChronik((prev) => [
      ...prev,
      {
        id: `dik-${prev.length + 1}`,
        zeitstempel: now.toISOString(),
        funkrufname: fahrzeug.funkrufname,
        source: "fahrzeug",
        pending: true,
        text: "🎤 Audio · Transkript folgt beim Sync",
      },
    ]);
  }

  function toggleGear(id: string) {
    setGearSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // KM-Anzeige aus echter GPS-Spur (mit "—" wenn noch keine Bewegung erfasst)
  const kmDisplay = kmGefahren > 0 ? kmGefahren.toFixed(1).replace(".", ",") : "—";

  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-10">
      <Topbar funkrufname={fahrzeug.funkrufname} geo={geo} />
      <RufnameBar fahrzeugId={FAHRZEUG_ID} />
      <DemoBanner />

      <main className="flex flex-col gap-3.5 px-4 pb-8 pt-3">
        <AlarmCard alarm={DEMO_ALARM} />

        <MapCard
          selfPos={selfPos}
          einsatzPos={EINSATZ_POS}
          einsatzAdresse={DEMO_ALARM.einsatzort}
          fleet={fleet}
          hydranten={DEMO_HYDRANTEN}
        />

        <section className="rounded-m border border-border bg-surface-1 p-3.5">
          <header className="mb-2.5 flex items-baseline justify-between">
            <h2 className="m-0 text-[16px] font-semibold tracking-tight text-text-1">Ausrückung</h2>
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
              Pflichtfelder vor Abfahrt
            </span>
          </header>

          <div className="grid grid-cols-2 gap-2">
            <ReadOnlyKm label="KM Abfahrt" hint="auto · GPS" value={KM_ABFAHRT.toLocaleString("de-AT")} />
            <ReadOnlyKm label="KM gefahren" hint="auto · live" value={kmDisplay} />
          </div>

          <div className="mt-2">
            <PersonButton
              label="Fahrer"
              person={fahrer}
              onOpen={() => setPickerOpen({ kind: "fahrer" })}
            />
          </div>
          <div className="mt-2">
            <PersonButton
              label="Fahrzeug-Kdt."
              person={kdt}
              onOpen={() => setPickerOpen({ kind: "kdt" })}
            />
          </div>
        </section>

        <section className="rounded-m border border-border bg-surface-1 p-3.5">
          <header className="mb-2.5 flex items-baseline justify-between">
            <h2 className="m-0 text-[16px] font-semibold tracking-tight text-text-1">Mannschaft</h2>
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
              {mannschaft.filter((m) => m.person).length} / {mannschaft.length} Plätze
            </span>
          </header>
          <ul className="flex list-none flex-col gap-1.5 p-0">
            {mannschaft.map((m, i) => (
              <MannschaftSlot
                key={m.slot}
                data={m}
                onPickPerson={() => setPickerOpen({ kind: "crew", slot: m.slot })}
                onToggleAs={() => toggleMannschaftAs(i)}
                onChangeAs={(v) => setMannschaftAsDauer(i, v)}
              />
            ))}
          </ul>
        </section>

        <GearChips
          items={DEMO_GEAR_LFA_B}
          selected={gearSelected}
          oelbindemittelSaecke={oelSaecke}
          onToggle={toggleGear}
          onOelChange={setOelSaecke}
        />

        <section className="rounded-m border border-border bg-surface-1 p-3.5">
          <header className="mb-2.5 flex items-baseline justify-between">
            <h2 className="m-0 text-[16px] font-semibold tracking-tight text-text-1">Einsatzchronik</h2>
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
              Whisper · offline
            </span>
          </header>
          <ChronikTimeline eintraege={chronik} />
          <DictateButton onDictate={addChronikDiktat} />
        </section>

        <div className="mt-2 px-1 text-center">
          <p className="m-0 mb-2.5 text-[11px] text-text-3">
            Schließt den Fahrzeugbericht ab und übergibt ihn der Zentrale „Florian Eberstalzell".
          </p>
          <button
            type="button"
            className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-m px-5 py-3.5 text-[15px] font-bold uppercase tracking-[0.08em] text-white transition active:translate-y-px"
            style={{
              background:
                "linear-gradient(180deg, var(--red) 0%, var(--red-strong) 60%, color-mix(in srgb, var(--red-strong) 60%, #000) 100%)",
              border: "1px solid color-mix(in srgb, var(--red-strong) 60%, #000)",
              boxShadow:
                "0 14px 32px -10px var(--red-glow), 0 0 0 1px rgba(255,255,255,0.06) inset, inset 0 1px 0 rgba(255,255,255,0.22)",
            }}
          >
            {/* Shine-Sweep */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <span className="relative">Fahrzeugbericht abschließen</span>
            <ArrowRight size={18} className="relative" />
          </button>
        </div>

        <footer className="flex items-center justify-between px-1 pb-2 pt-4 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
          <span>
            <span className="text-red">Hot</span>
            <span className="text-text-1">Doc</span> · UC2 · v0.3
          </span>
          <button
            type="button"
            onClick={onResetSetup}
            className="underline hover:text-text-2"
          >
            Setup zurücksetzen
          </button>
        </footer>
      </main>

      <PersonPickerModal
        open={!!pickerOpen}
        title={pickerTitle()}
        subtitle={`aktive Mitglieder · ${fahrzeug.bezeichnung} · ${fahrzeug.besatzung.typ}`}
        personen={personen}
        bereitsGewaehlt={bereitsGewaehlt}
        onSelect={selectPerson}
        onClose={() => setPickerOpen(null)}
      />
    </div>
  );
}

function ReadOnlyKm({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-3">
        {label}
        <span className="rounded border border-blue/25 bg-blue/10 px-1.5 py-px font-mono text-[8px] font-semibold tracking-[0.16em] text-blue">
          {hint}
        </span>
      </span>
      <output
        className="block w-full rounded-s border border-border bg-surface-2 px-3 py-2.5 font-mono text-[16px] font-medium tabular-nums tracking-wide text-text-1"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, var(--surface-2) 0 6px, color-mix(in srgb, var(--surface-2) 85%, var(--blue)) 6px 7px)",
        }}
      >
        {value}
      </output>
    </div>
  );
}
