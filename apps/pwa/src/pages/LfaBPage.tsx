import { ArrowRight, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AbgeschlossenView } from "../components/AbgeschlossenView";
import { AbschlussModal, type AbschlussCheck } from "../components/AbschlussModal";
import { AlarmCard, type AlarmDaten } from "../components/AlarmCard";
import { AuftraegeSection, type Auftrag } from "../components/AuftraegeSection";
import { ChronikTimeline, type ChronikEintrag } from "../components/ChronikTimeline";
import { DemoBanner } from "../components/DemoBanner";
import { DictateButton } from "../components/DictateButton";
import { EinsatzTabs, type EinsatzTabSummary } from "../components/EinsatzTabs";
import { GearChips } from "../components/GearChips";
import {
  MannschaftSlot,
  emptySlot,
  type MannschaftSlotData,
} from "../components/MannschaftSlot";
import { MapCard, type MapPosition } from "../components/MapCard";
import { NeuerAuftragModal } from "../components/NeuerAuftragModal";
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
/** Realistischer Straßen-Faktor: Luftlinie × 1.3 ≈ tatsächliche Fahrstrecke */
const ROAD_FACTOR = 1.3;

/**
 * Standard-Auftrag-Typen — in Phase 2 wird das aus der Einsatzzentrale-
 * Verwaltung über /api/config/auftrag-typen geladen (FR-15 Verwaltung).
 */
const DEFAULT_AUFTRAG_TYPEN: readonly string[] = [
  "Verkehrsabsicherung",
  "Wassertransport",
  "Personenrettung",
  "Brandbekämpfung außen",
  "Brandbekämpfung innen",
  "Technische Hilfeleistung",
  "Atemschutz-Trupp",
  "Drehleiter-Einsatz",
  "Nachlöscharbeiten",
  "Beleuchtung sichern",
] as const;

/**
 * Ein lokal verwalteter Einsatz/Auftrag dieses Tablets. Mehrere können
 * parallel laufen — der Tab-Bar wechselt zwischen ihnen.
 */
interface EinsatzInstance {
  id: string;
  alarm: AlarmDaten;
  einsatzPos: { lat: number; lng: number };
  manuell: boolean;
  fahrer: PickPerson | null;
  kdt: PickPerson | null;
  mannschaft: MannschaftSlotData[];
  gearSelected: Set<string>;
  oelSaecke: number;
  auftraege: Auftrag[];
  chronik: ChronikEintrag[];
  abgeschlossen: { ts: string; durch: string; kmGefahren: number } | null;
}

interface Props {
  onSwitchFahrzeug: (id: FahrzeugId) => void;
  onResetSetup: () => void;
}

export function LfaBPage({ onSwitchFahrzeug, onResetSetup }: Props) {
  const fahrzeug = FAHRZEUGE[FAHRZEUG_ID];

  const [personen, setPersonen] = useState<PickPerson[]>([]);
  const [pickerOpen, setPickerOpen] = useState<PickerTarget | null>(null);
  const [vehicleSwitcherOpen, setVehicleSwitcherOpen] = useState(false);
  const [neuerAuftragOpen, setNeuerAuftragOpen] = useState(false);
  const [abschlussModalOpen, setAbschlussModalOpen] = useState(false);

  // Initialer Einsatz aus Demo-Alarm
  const [einsaetze, setEinsaetze] = useState<EinsatzInstance[]>(() => [
    {
      id: DEMO_ALARM.alarmId,
      alarm: DEMO_ALARM,
      einsatzPos: EINSATZ_POS,
      manuell: false,
      fahrer: null,
      kdt: null,
      mannschaft: Array.from(
        { length: fahrzeug.besatzung.mannschaftsplaetzeZusaetzlich },
        (_, i) => emptySlot(i + 1),
      ),
      gearSelected: new Set(["ts-pumpe", "schlauchmaterial"]),
      oelSaecke: 0,
      auftraege: [],
      chronik: initialChronik(fahrzeug.funkrufname),
      abgeschlossen: null,
    },
  ]);
  const [activeId, setActiveId] = useState<string>(DEMO_ALARM.alarmId);
  const [fleet, setFleet] = useState<MapPosition[]>(makeInitialFleet);

  const active = einsaetze.find((e) => e.id === activeId) ?? einsaetze[0]!;

  // GPS — aktualisiert die eigene Position auf der Karte
  const geo = useGeolocation();
  const selfPos = geo.fix ? { lat: geo.fix.lat, lng: geo.fix.lng } : HOME_POS;

  // Personalliste laden + Demo-Vorbelegung beim ersten Einsatz
  useEffect(() => {
    void (async () => {
      const docs = await getAllPersonen();
      const list = docs as unknown as PickPerson[];
      setPersonen(list);
      const byId = new Map(list.map((p) => [p.syBosId, p]));
      const eder = byId.get(107375) ?? null;
      const bruckner = byId.get(123057) ?? null;
      const huemer = byId.get(107452);
      const almhofer = byId.get(107506);
      setEinsaetze((prev) =>
        prev.map((e) =>
          e.id === DEMO_ALARM.alarmId
            ? {
                ...e,
                kdt: eder,
                fahrer: bruckner,
                mannschaft: e.mannschaft.map((m, i) => {
                  if (i === 0 && huemer)
                    return { ...m, person: huemer, atemschutzAktiv: true, atemschutzDauerMin: 15 };
                  if (i === 1 && almhofer) return { ...m, person: almhofer };
                  return m;
                }),
              }
            : e,
        ),
      );
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

  // ────────────── Helper: aktiven Einsatz patchen ──────────────
  function patchActive(updater: (e: EinsatzInstance) => EinsatzInstance) {
    setEinsaetze((prev) => prev.map((e) => (e.id === activeId ? updater(e) : e)));
  }

  // ────────────── Personen-Picker ──────────────
  const bereitsGewaehlt = useMemo(() => {
    const s = new Set<number>();
    if (active.fahrer) s.add(active.fahrer.syBosId);
    if (active.kdt) s.add(active.kdt.syBosId);
    for (const m of active.mannschaft) if (m.person) s.add(m.person.syBosId);
    return s;
  }, [active.fahrer, active.kdt, active.mannschaft]);

  function selectPerson(p: PickPerson) {
    if (!pickerOpen) return;
    patchActive((e) => {
      if (pickerOpen.kind === "fahrer") return { ...e, fahrer: p };
      if (pickerOpen.kind === "kdt") return { ...e, kdt: p };
      const idx = pickerOpen.slot - 1;
      return {
        ...e,
        mannschaft: e.mannschaft.map((m, i) => (i === idx ? { ...m, person: p } : m)),
      };
    });
    setPickerOpen(null);
  }

  function pickerTitle(): string {
    if (!pickerOpen) return "";
    if (pickerOpen.kind === "fahrer") return "Fahrer wählen";
    if (pickerOpen.kind === "kdt") return "Fahrzeug-Kommandant wählen";
    return `Mannschaftsplatz ${pickerOpen.slot}`;
  }

  // ────────────── Mannschaft AS-Toggle ──────────────
  function toggleMannschaftAs(idx: number) {
    patchActive((e) => ({
      ...e,
      mannschaft: e.mannschaft.map((m, i) => (i === idx ? { ...m, atemschutzAktiv: !m.atemschutzAktiv } : m)),
    }));
  }
  function setMannschaftAsDauer(idx: number, dauer: number) {
    patchActive((e) => ({
      ...e,
      mannschaft: e.mannschaft.map((m, i) => (i === idx ? { ...m, atemschutzDauerMin: dauer } : m)),
    }));
  }

  // ────────────── Diktat ──────────────
  function onDictateResult(result: RecordingResult) {
    const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    patchActive((e) => ({
      ...e,
      chronik: [
        ...e.chronik,
        {
          id,
          zeitstempel: new Date().toISOString(),
          funkrufname: fahrzeug.funkrufname,
          source: "fahrzeug",
          pending: true,
          text: `🎤 Audio · ${formatDuration(result.durationMs)} · Transkript folgt`,
        },
      ],
    }));
  }

  // ────────────── Auftrag-Aktionen ──────────────
  function addAuftrag(text: string) {
    const id = `auf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    patchActive((e) => ({
      ...e,
      auftraege: [...e.auftraege, { id, text, zeitstempel: new Date().toISOString() }],
    }));
  }
  function removeAuftrag(id: string) {
    patchActive((e) => ({ ...e, auftraege: e.auftraege.filter((a) => a.id !== id) }));
  }

  // ────────────── Gear ──────────────
  function toggleGear(id: string) {
    patchActive((e) => {
      const next = new Set(e.gearSelected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...e, gearSelected: next };
    });
  }
  function setOelSaecke(n: number) {
    patchActive((e) => ({ ...e, oelSaecke: n }));
  }

  // ────────────── Multi-Einsatz: neuen Auftrag anlegen ──────────────
  function createNewAuftrag(einsatzart: string, einsatzortText: string) {
    const id = `manuell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();
    // Wir können hier ohne Geocoder nicht die echten Koords ermitteln —
    // fallweise nehmen wir die aktuelle Position oder HOME_POS als Stub.
    const pos = geo.fix ? { lat: geo.fix.lat, lng: geo.fix.lng } : EINSATZ_POS;
    const neueInstance: EinsatzInstance = {
      id,
      manuell: true,
      einsatzPos: pos,
      alarm: {
        alarmId: id.toUpperCase(),
        einsatzart,
        einsatzort: einsatzortText,
        alarmierungZeit: now.toISOString(),
        alarmierungAuthor: "MANUELL",
        koordinaten: pos,
        distanzKm: haversineKm(HOME_POS, pos),
      },
      // Personen werden vom aktiven Auftrag übernommen
      fahrer: active.fahrer,
      kdt: active.kdt,
      mannschaft: active.mannschaft.map((m) => ({ ...m })),
      gearSelected: new Set(),
      oelSaecke: 0,
      auftraege: [],
      chronik: [
        {
          id: `chr-${Date.now()}`,
          zeitstempel: now.toISOString(),
          funkrufname: fahrzeug.funkrufname,
          source: "manuell",
          text: `Auftrag manuell angelegt · ${einsatzart} · ${einsatzortText}`,
        },
      ],
      abgeschlossen: null,
    };
    setEinsaetze((prev) => [...prev, neueInstance]);
    setActiveId(id);
    setNeuerAuftragOpen(false);
  }

  // ────────────── Vehicle Switcher ──────────────
  function handleSwitchVehicle(id: FahrzeugId) {
    setVehicleSwitcherOpen(false);
    onSwitchFahrzeug(id);
  }

  // ────────────── Abschluss ──────────────
  /**
   * Strecke zum Einsatzort hin und zurück, mit Road-Faktor.
   * Ersetzt die früheren manuellen KM-Felder.
   */
  function computeKm(): number {
    const luftlinie = haversineKm(HOME_POS, active.einsatzPos);
    return luftlinie * ROAD_FACTOR * 2;
  }

  function abschliessen() {
    const km = computeKm();
    patchActive((e) => ({
      ...e,
      abgeschlossen: {
        ts: new Date().toISOString(),
        durch: e.kdt ? `${e.kdt.nachname} ${e.kdt.vorname}` : "—",
        kmGefahren: km,
      },
    }));
    setAbschlussModalOpen(false);
  }

  // ────────────── Tab-Summaries ──────────────
  const tabs: EinsatzTabSummary[] = einsaetze.map((e) => ({
    id: e.id,
    einsatzart: e.alarm.einsatzart,
    einsatzort: e.alarm.einsatzort,
    status: e.abgeschlossen ? "abgeschlossen" : "aktiv",
    manuell: e.manuell,
  }));

  // ────────────── Abschluss-Checks + Summary ──────────────
  const mannschaftCount = active.mannschaft.filter((m) => m.person).length;
  const personenAnzahl = mannschaftCount + (active.fahrer ? 1 : 0) + (active.kdt ? 1 : 0);
  const kmRound = computeKm();
  const kmDisplay = `${kmRound.toFixed(1).replace(".", ",")} km`;

  const checks: AbschlussCheck[] = [
    { ok: !!active.fahrer, label: "Fahrer eingetragen" },
    { ok: !!active.kdt, label: "Fahrzeug-Kommandant eingetragen" },
    { ok: mannschaftCount >= 1, label: `Mindestens 1 Mannschaftsplatz besetzt (aktuell ${mannschaftCount})` },
    { ok: !!active.alarm.einsatzort.trim(), label: "Einsatzadresse gesetzt (für Strecken-Berechnung)" },
  ];

  const abschlussSummary = [
    { label: "Mannschaft", value: `${personenAnzahl} Pers.` },
    { label: "KM (auto)", value: kmDisplay },
    { label: "Geräte", value: String(active.gearSelected.size) },
    { label: "Aufträge", value: String(active.auftraege.length) },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-10">
      <Topbar funkrufname={fahrzeug.funkrufname} einsatzNr={active.alarm.alarmId} geo={geo} />

      <EinsatzTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => setNeuerAuftragOpen(true)}
      />

      <RufnameBar fahrzeugId={FAHRZEUG_ID} onSwitch={() => setVehicleSwitcherOpen(true)} />

      {!active.abgeschlossen ? <DemoBanner /> : null}

      <main className="flex flex-col gap-4 px-4 pb-8 pt-3">
        {active.abgeschlossen ? (
          <AbgeschlossenView
            funkrufname={fahrzeug.funkrufname}
            abgeschlossenAm={active.abgeschlossen.ts}
            durch={active.abgeschlossen.durch}
            summary={[
              { label: "Mannschaft", value: `${personenAnzahl} Pers.` },
              { label: "KM (auto)", value: `${active.abgeschlossen.kmGefahren.toFixed(1).replace(".", ",")} km` },
              { label: "Geräte", value: String(active.gearSelected.size) },
              { label: "Aufträge", value: String(active.auftraege.length) },
            ]}
            onSwitchFahrzeug={() => setVehicleSwitcherOpen(true)}
          />
        ) : (
          <>
            <AlarmCard alarm={active.alarm} />

            <SectionHead title="Anfahrt" />
            <MapCard
              selfPos={selfPos}
              einsatzPos={active.einsatzPos}
              einsatzAdresse={active.alarm.einsatzort}
              fleet={fleet}
              hydranten={DEMO_HYDRANTEN}
              showLoeschwasser={false}
            />

            <SectionHead title="Mannschaft" />
            <section className="rounded-[18px] border bg-surface p-5" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
              <div className="mb-3.5 flex items-center justify-between">
                <h2 className="text-[17px] font-bold tracking-tight" style={{ color: "var(--fg)" }}>
                  Fahrer &amp; Kdt.
                </h2>
                <span
                  className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: "var(--fg-3)" }}
                >
                  <span style={{ color: "var(--fg)" }}>{(active.fahrer ? 1 : 0) + (active.kdt ? 1 : 0)}</span> / 2
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <PersonButton label="Fahrer" person={active.fahrer} onOpen={() => setPickerOpen({ kind: "fahrer" })} />
                <PersonButton label="Fahrzeug-Kdt." person={active.kdt} onOpen={() => setPickerOpen({ kind: "kdt" })} />
              </div>
            </section>

            <section className="rounded-[18px] border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
              <div className="mb-3.5 flex items-center justify-between">
                <h2 className="text-[17px] font-bold tracking-tight" style={{ color: "var(--fg)" }}>
                  Besatzung
                </h2>
                <span
                  className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: "var(--fg-3)" }}
                >
                  <span style={{ color: "var(--fg)" }}>{mannschaftCount}</span> / {active.mannschaft.length} Plätze
                </span>
              </div>
              <ul className="flex flex-col gap-2 p-0">
                {active.mannschaft.map((m, i) => (
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

            <SectionHead title="Geräte & Mittel" />
            <GearChips
              items={DEMO_GEAR_LFA_B}
              selected={active.gearSelected}
              oelbindemittelSaecke={active.oelSaecke}
              onToggle={toggleGear}
              onOelChange={setOelSaecke}
            />

            <SectionHead title="Auftrag" />
            <AuftraegeSection
              auftraege={active.auftraege}
              verfuegbareTypen={DEFAULT_AUFTRAG_TYPEN}
              onAdd={addAuftrag}
              onRemove={removeAuftrag}
            />

            <SectionHead title="Chronik" />
            <section className="rounded-[18px] border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
              <div className="mb-3.5 flex items-center justify-between">
                <h2 className="text-[17px] font-bold tracking-tight" style={{ color: "var(--fg)" }}>
                  Einsatzchronik
                </h2>
                <span
                  className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: "var(--fg-3)" }}
                >
                  Whisper · offline
                </span>
              </div>
              <ChronikTimeline eintraege={active.chronik} />
              <DictateButton onAudio={onDictateResult} />
            </section>

            <div className="mt-2 flex flex-col gap-2.5">
              <p
                className="text-center text-[13px]"
                style={{ color: "var(--fg-2)" }}
              >
                Schließt den Fahrzeugbericht ab und übergibt ihn der Zentrale „Florian Eberstalzell".
              </p>
              <button
                type="button"
                onClick={() => setAbschlussModalOpen(true)}
                className="flex items-center justify-center gap-3 rounded-[18px] px-5 py-5 text-[17px] font-bold tracking-tight text-white transition hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(180deg, #D8132F 0%, #B30D26 100%)",
                  boxShadow: "var(--shadow-cta)",
                }}
              >
                <Lock size={20} />
                Fahrzeugbericht abschließen
                <ArrowRight size={20} />
              </button>
            </div>
          </>
        )}

        <footer
          className="flex items-center justify-between pt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--fg-3)" }}
        >
          <span>
            <span style={{ color: "var(--red)" }}>Hot</span>
            <span style={{ color: "var(--fg)" }}>Doc</span> · UC2 · v0.5
          </span>
          <button type="button" onClick={onResetSetup} className="underline transition hover:text-text-2">
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

      <NeuerAuftragModal
        open={neuerAuftragOpen}
        inheritedCount={personenAnzahl}
        onConfirm={createNewAuftrag}
        onCancel={() => setNeuerAuftragOpen(false)}
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

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1.5 pt-1.5">
      <span
        className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--fg-3)" }}
      >
        {title}
      </span>
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
    </div>
  );
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}
