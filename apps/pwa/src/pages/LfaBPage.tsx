import { ArrowRight, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AbgeschlossenView } from "../components/AbgeschlossenView";
import { AbschlussModal, type AbschlussCheck } from "../components/AbschlussModal";
import { AlarmCard } from "../components/AlarmCard";
import { AuftraegeSection, type Auftrag } from "../components/AuftraegeSection";
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
import { VehicleSwitcherModal } from "../components/VehicleSwitcherModal";
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
import type { RecordingResult } from "../lib/audio";
import { haversineKm, useGeolocation } from "../lib/geo";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

type PickerTarget = { kind: "fahrer" } | { kind: "kdt" } | { kind: "crew"; slot: number };

const FAHRZEUG_ID = "lfa-b" as const;
const KM_ABFAHRT = 34712;

interface Props {
  onSwitchFahrzeug: (id: FahrzeugId) => void;
  onResetSetup: () => void;
}

export function LfaBPage({ onSwitchFahrzeug, onResetSetup }: Props) {
  const fahrzeug = FAHRZEUGE[FAHRZEUG_ID];

  const [personen, setPersonen] = useState<PickPerson[]>([]);
  const [pickerOpen, setPickerOpen] = useState<PickerTarget | null>(null);
  const [vehicleSwitcherOpen, setVehicleSwitcherOpen] = useState(false);

  const [fahrer, setFahrer] = useState<PickPerson | null>(null);
  const [kdt, setKdt] = useState<PickPerson | null>(null);
  const [mannschaft, setMannschaft] = useState<MannschaftSlotData[]>(
    () => Array.from({ length: fahrzeug.besatzung.mannschaftsplaetzeZusaetzlich }, (_, i) => emptySlot(i + 1)),
  );

  const [gearSelected, setGearSelected] = useState<Set<string>>(new Set(["ts-pumpe", "schlauchmaterial"]));
  const [oelSaecke, setOelSaecke] = useState(0);

  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [chronik, setChronik] = useState<ChronikEintrag[]>(() => initialChronik(fahrzeug.funkrufname));
  const [fleet, setFleet] = useState<MapPosition[]>(makeInitialFleet);

  // Aufgenommene Audios (vor Sync nur im RAM, Phase 5 → PouchDB-Attachment)
  const audioBlobsRef = useRef<{ id: string; blob: Blob; durationMs: number }[]>([]);
  const audioUrlsRef = useRef<Map<string, string>>(new Map());

  // Abschluss-Workflow
  const [abschlussModalOpen, setAbschlussModalOpen] = useState(false);
  const [abgeschlossen, setAbgeschlossen] = useState<{ ts: string; durch: string } | null>(null);

  // Echte GPS-Position über navigator.geolocation. Fallback HOME_POS,
  // solange noch nichts da ist (= sofort kartenfähig statt Blocker).
  const geo = useGeolocation();
  const selfPos = geo.fix ? { lat: geo.fix.lat, lng: geo.fix.lng } : HOME_POS;

  // GPS-Spur für KM-Berechnung. Wird bei jedem Fix erweitert.
  const trackRef = useRef<{ lat: number; lng: number }[]>([]);
  const [kmGefahren, setKmGefahren] = useState(0);
  useEffect(() => {
    if (!geo.fix) return;
    const pt = { lat: geo.fix.lat, lng: geo.fix.lng };
    const track = trackRef.current;
    const last = track[track.length - 1];
    if (!last || haversineKm(last, pt) * 1000 > 8) {
      track.push(pt);
      const total = track.reduce(
        (sum, p, i) => (i === 0 ? 0 : sum + haversineKm(track[i - 1]!, p)),
        0,
      );
      setKmGefahren(total);
    }
  }, [geo.fix]);

  // Personalliste laden + Demo-Vorbelegung
  useEffect(() => {
    void (async () => {
      const docs = await getAllPersonen();
      setPersonen(docs as unknown as PickPerson[]);
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
  useEffect(() => {
    const id = setInterval(() => {
      setFleet((prev) =>
        prev.map((f) => {
          if (f.isSelf) return { ...f, lat: selfPos.lat, lng: selfPos.lng };
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

  // Object-URLs beim Unmount freigeben
  useEffect(() => {
    return () => {
      for (const url of audioUrlsRef.current.values()) URL.revokeObjectURL(url);
    };
  }, []);

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
      prev.map((m, i) => (i === idx ? { ...m, atemschutzAktiv: !m.atemschutzAktiv } : m)),
    );
  }
  function setMannschaftAsDauer(idx: number, dauer: number) {
    setMannschaft((prev) => prev.map((m, i) => (i === idx ? { ...m, atemschutzDauerMin: dauer } : m)));
  }

  /**
   * Audio aufgenommen — Blob in den lokalen Cache, Object-URL für sofortige
   * Wiedergabe, und ein vorläufiger Chronik-Eintrag (Status pending bis das
   * Transkript da ist). In Phase 5 hängt ein Web-Worker das Whisper-Modell
   * dran und ersetzt den pending-Eintrag durch das echte Transkript.
   */
  function onDictateResult(result: RecordingResult) {
    const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    audioBlobsRef.current.push({ id, blob: result.blob, durationMs: result.durationMs });
    audioUrlsRef.current.set(id, URL.createObjectURL(result.blob));
    setChronik((prev) => [
      ...prev,
      {
        id,
        zeitstempel: new Date().toISOString(),
        funkrufname: fahrzeug.funkrufname,
        source: "fahrzeug",
        pending: true,
        text: `🎤 Audio · ${formatDuration(result.durationMs)} · Transkript folgt`,
      },
    ]);
  }

  function addAuftrag(text: string) {
    const id = `auf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setAuftraege((prev) => [
      ...prev,
      { id, text, zeitstempel: new Date().toISOString() },
    ]);
  }
  function removeAuftrag(id: string) {
    setAuftraege((prev) => prev.filter((a) => a.id !== id));
  }

  function toggleGear(id: string) {
    setGearSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSwitchVehicle(id: FahrzeugId) {
    setVehicleSwitcherOpen(false);
    onSwitchFahrzeug(id);
  }

  function abschliessen() {
    setAbgeschlossen({
      ts: new Date().toISOString(),
      durch: kdt ? `${kdt.nachname} ${kdt.vorname}` : "—",
    });
    setAbschlussModalOpen(false);
  }

  // KM-Anzeige aus echter GPS-Spur
  const kmDisplay = kmGefahren > 0 ? kmGefahren.toFixed(1).replace(".", ",") : "—";

  // Abschluss-Sanity-Checks
  const mannschaftCount = mannschaft.filter((m) => m.person).length;
  const checks: AbschlussCheck[] = [
    { ok: !!fahrer, label: "Fahrer eingetragen" },
    { ok: !!kdt, label: "Fahrzeug-Kommandant eingetragen" },
    { ok: mannschaftCount >= 1, label: `Mindestens 1 Mannschaftsplatz besetzt (aktuell ${mannschaftCount})` },
    { ok: kmGefahren > 0, label: `GPS-Strecke aufgezeichnet (${kmDisplay} km)` },
  ];

  const abschlussSummary = [
    { label: "KM gefahren", value: `${kmDisplay} km` },
    { label: "Mannschaft", value: `${mannschaftCount + (fahrer ? 1 : 0) + (kdt ? 1 : 0)} Pers.` },
    { label: "Geräte gewählt", value: String(gearSelected.size) },
    { label: "Aufträge", value: String(auftraege.length) },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-10">
      <Topbar funkrufname={fahrzeug.funkrufname} geo={geo} />
      <RufnameBar fahrzeugId={FAHRZEUG_ID} onSwitch={() => setVehicleSwitcherOpen(true)} />
      {!abgeschlossen ? <DemoBanner /> : null}

      <main className="flex flex-col gap-3.5 px-4 pb-8 pt-3">
        {abgeschlossen ? (
          <AbgeschlossenView
            funkrufname={fahrzeug.funkrufname}
            abgeschlossenAm={abgeschlossen.ts}
            durch={abgeschlossen.durch}
            summary={abschlussSummary}
            onSwitchFahrzeug={() => setVehicleSwitcherOpen(true)}
          />
        ) : (
          <>
            <AlarmCard alarm={DEMO_ALARM} />

            <MapCard
              selfPos={selfPos}
              einsatzPos={EINSATZ_POS}
              einsatzAdresse={DEMO_ALARM.einsatzort}
              fleet={fleet}
              hydranten={DEMO_HYDRANTEN}
            />

            <section
              className="rounded-m border p-3.5"
              style={{
                borderColor: "var(--border-strong)",
                background: "var(--card-gradient)",
                boxShadow: "var(--shadow-card)",
              }}
            >
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
                <PersonButton label="Fahrer" person={fahrer} onOpen={() => setPickerOpen({ kind: "fahrer" })} />
              </div>
              <div className="mt-2">
                <PersonButton label="Fahrzeug-Kdt." person={kdt} onOpen={() => setPickerOpen({ kind: "kdt" })} />
              </div>
            </section>

            <section
              className="rounded-m border p-3.5"
              style={{
                borderColor: "var(--border-strong)",
                background: "var(--card-gradient)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <header className="mb-2.5 flex items-baseline justify-between">
                <h2 className="m-0 text-[16px] font-semibold tracking-tight text-text-1">Mannschaft</h2>
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
                  {mannschaftCount} / {mannschaft.length} Plätze
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

            <AuftraegeSection auftraege={auftraege} onAdd={addAuftrag} onRemove={removeAuftrag} />

            <section
              className="rounded-m border p-3.5"
              style={{
                borderColor: "var(--border-strong)",
                background: "var(--card-gradient)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <header className="mb-2.5 flex items-baseline justify-between">
                <h2 className="m-0 text-[16px] font-semibold tracking-tight text-text-1">Einsatzchronik</h2>
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
                  Whisper · offline
                </span>
              </header>
              <ChronikTimeline eintraege={chronik} />
              <DictateButton onAudio={onDictateResult} />
            </section>

            <div className="mt-2 px-1 text-center">
              <p className="m-0 mb-2.5 text-[11px] text-text-3">
                Schließt den Fahrzeugbericht ab und übergibt ihn der Zentrale „Florian Eberstalzell".
              </p>
              <button
                type="button"
                onClick={() => setAbschlussModalOpen(true)}
                className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-m px-5 py-3.5 text-[15px] font-bold uppercase tracking-[0.08em] text-white transition active:translate-y-px"
                style={{
                  background:
                    "linear-gradient(180deg, var(--red) 0%, var(--red-strong) 60%, color-mix(in srgb, var(--red-strong) 60%, #000) 100%)",
                  border: "1px solid color-mix(in srgb, var(--red-strong) 60%, #000)",
                  boxShadow:
                    "0 14px 32px -10px var(--red-glow), 0 0 0 1px rgba(255,255,255,0.06) inset, inset 0 1px 0 rgba(255,255,255,0.22)",
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                />
                <Lock size={16} className="relative" />
                <span className="relative">Fahrzeugbericht abschließen</span>
                <ArrowRight size={18} className="relative" />
              </button>
            </div>
          </>
        )}

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

      <PersonPickerModal
        open={!!pickerOpen}
        title={pickerTitle()}
        subtitle={`aktive Mitglieder · ${fahrzeug.bezeichnung} · ${fahrzeug.besatzung.typ}`}
        personen={personen}
        bereitsGewaehlt={bereitsGewaehlt}
        onSelect={selectPerson}
        onClose={() => setPickerOpen(null)}
      />

      <VehicleSwitcherModal
        open={vehicleSwitcherOpen}
        current={FAHRZEUG_ID}
        onSelect={handleSwitchVehicle}
        onClose={() => setVehicleSwitcherOpen(false)}
      />

      <AbschlussModal
        open={abschlussModalOpen}
        funkrufname={fahrzeug.funkrufname}
        checks={checks}
        summary={abschlussSummary}
        onConfirm={abschliessen}
        onCancel={() => setAbschlussModalOpen(false)}
      />
    </div>
  );
}

function ReadOnlyKm({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-3">
        {label}
        <span
          className="rounded border px-1.5 py-px font-mono text-[8px] font-semibold tracking-[0.16em]"
          style={{ borderColor: "var(--blue-border)", background: "var(--blue-bg)", color: "var(--blue)" }}
        >
          {hint}
        </span>
      </span>
      <output
        className="block w-full rounded-s border px-3 py-2.5 font-mono text-[16px] font-medium tabular-nums tracking-wide text-text-1"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--surface-2)",
          backgroundImage:
            "repeating-linear-gradient(-45deg, var(--surface-2) 0 6px, color-mix(in srgb, var(--surface-2) 85%, var(--blue)) 6px 7px)",
        }}
      >
        {value}
      </output>
    </div>
  );
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}
