import { ArrowRight, Calendar, CheckCircle2, Clipboard, Eye, Save, Truck, Users } from "lucide-react";
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
import { Topbar } from "../components/Topbar";
import { VehicleSwitcherModal } from "../components/VehicleSwitcherModal";
import { VorschauModal } from "../components/VorschauModal";
import {
  DEMO_ALARM,
  DEMO_HYDRANTEN,
  EINSATZ_POS,
  HOME_POS,
  initialChronik,
  makeInitialFleet,
} from "../data/demo-alarm";
import { GEAR_BY_FAHRZEUG } from "../data/gear";
import { getAllPersonen } from "../db/seed";
import type { RecordingResult } from "../lib/audio";
import { haversineKm, useGeolocation } from "../lib/geo";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

type PickerTarget = { kind: "fahrer" } | { kind: "kdt" } | { kind: "crew"; slot: number };

const ROAD_FACTOR = 1.3;

const DEFAULT_AUFTRAG_TYPEN: readonly string[] = [
  "Brandbekämpfung außen",
  "Brandbekämpfung innen",
  "Atemschutz-Trupp",
  "Verkehrsabsicherung",
  "Wassertransport",
  "Personenrettung",
  "Technische Hilfeleistung",
  "Drehleiter-Einsatz",
  "Nachlöscharbeiten",
  "Beleuchtung sichern",
] as const;

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
  fahrzeugId: FahrzeugId;
  onSwitchFahrzeug: (id: FahrzeugId) => void;
  onResetSetup: () => void;
}

/**
 * Generischer Fahrzeugbericht — funktioniert für KDO / TLF / LFA-B / MTF.
 * Mannschaftsplätze und Geräteliste kommen aus der Fahrzeugkonfiguration.
 * Für Zentrale gibt es eine eigene Page (Hauptbericht, Anhang B des Spec).
 */
export function BerichtPage({ fahrzeugId, onSwitchFahrzeug, onResetSetup }: Props) {
  const fahrzeug = FAHRZEUGE[fahrzeugId];
  const gearList = GEAR_BY_FAHRZEUG[fahrzeugId];

  const [personen, setPersonen] = useState<PickPerson[]>([]);
  const [pickerOpen, setPickerOpen] = useState<PickerTarget | null>(null);
  const [vehicleSwitcherOpen, setVehicleSwitcherOpen] = useState(false);
  const [neuerAuftragOpen, setNeuerAuftragOpen] = useState(false);
  const [abschlussModalOpen, setAbschlussModalOpen] = useState(false);
  const [vorschauOpen, setVorschauOpen] = useState(false);

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
      gearSelected: new Set(),
      oelSaecke: 0,
      auftraege: [],
      chronik: initialChronik(fahrzeug.funkrufname),
      abgeschlossen: null,
    },
  ]);
  const [activeId, setActiveId] = useState<string>(DEMO_ALARM.alarmId);
  const [fleet, setFleet] = useState<MapPosition[]>(() => makeInitialFleet());

  const active = einsaetze.find((e) => e.id === activeId) ?? einsaetze[0]!;

  const geo = useGeolocation();
  const selfPos = geo.fix ? { lat: geo.fix.lat, lng: geo.fix.lng } : HOME_POS;

  // Personalliste laden (für LFA-B mit Demo-Vorbelegung; sonst nur Liste)
  useEffect(() => {
    void (async () => {
      const docs = await getAllPersonen();
      const list = docs as unknown as PickPerson[];
      setPersonen(list);
      if (fahrzeugId !== "lfa-b") return;
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
                gearSelected: new Set(["ts-pumpe", "schlauchmaterial"]),
              }
            : e,
        ),
      );
    })();
  }, [fahrzeugId]);

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

  function patchActive(updater: (e: EinsatzInstance) => EinsatzInstance) {
    setEinsaetze((prev) => prev.map((e) => (e.id === activeId ? updater(e) : e)));
  }

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

  function createNewAuftrag(einsatzart: string, einsatzortText: string) {
    const id = `manuell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();
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

  function handleSwitchVehicle(id: FahrzeugId) {
    setVehicleSwitcherOpen(false);
    onSwitchFahrzeug(id);
  }

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

  const tabs: EinsatzTabSummary[] = einsaetze.map((e) => ({
    id: e.id,
    einsatzart: e.alarm.einsatzart,
    einsatzort: e.alarm.einsatzort,
    status: e.abgeschlossen ? "abgeschlossen" : "aktiv",
    manuell: e.manuell,
  }));

  const mannschaftCount = active.mannschaft.filter((m) => m.person).length;
  const asAktiv = active.mannschaft.filter((m) => m.person && m.atemschutzAktiv).length;
  const personenAnzahl = mannschaftCount + (active.fahrer ? 1 : 0) + (active.kdt ? 1 : 0);
  const fahrerKdtCount = (active.fahrer ? 1 : 0) + (active.kdt ? 1 : 0);
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

  const datum = new Date(active.alarm.alarmierungZeit);
  const datumStr = `${pad(datum.getDate())}.${pad(datum.getMonth() + 1)}.${datum.getFullYear()}`;
  const zeitStr = `${pad(datum.getHours())}:${pad(datum.getMinutes())}`;

  return (
    <div>
      <Topbar funkrufname={fahrzeug.funkrufname} einsatzNr={active.alarm.alarmId} geo={geo} />

      <EinsatzTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => setNeuerAuftragOpen(true)}
      />

      {!active.abgeschlossen ? <DemoBanner /> : null}

      <main className="page">
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

            <SectionHead title="Einsatzdaten" />
            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Calendar size={20} />
                  Datum &amp; Zeitraum
                </div>
                <span className="card-meta">Auto-Übernahme aus Alarm</span>
              </div>
              <div className="grid-3" style={{ gap: 14 }}>
                <div className="field">
                  <label className="caption">Datum</label>
                  <div className="input-row filled">
                    <input value={datumStr} readOnly />
                    <div className="chev"><span style={{ fontSize: 12 }}>▾</span></div>
                  </div>
                </div>
                <div className="field">
                  <label className="caption">Uhrzeit von</label>
                  <div className="input-row filled">
                    <input value={zeitStr} readOnly className="num" />
                    <div className="chev"><span style={{ fontSize: 12 }}>▾</span></div>
                  </div>
                </div>
                <div className="field">
                  <label className="caption">Uhrzeit bis</label>
                  <div className="input-row">
                    <input value="– – : – –" readOnly className="num" style={{ color: "var(--fg-3)" }} />
                    <div className="chev"><span style={{ fontSize: 12 }}>▾</span></div>
                  </div>
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label className="caption">Einsatzort</label>
                <input className="input filled" value={active.alarm.einsatzort} readOnly />
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Truck size={20} />
                  Fahrzeug
                </div>
                <span className="card-meta">
                  <span className="num">{fahrzeug.bezeichnung}</span> · {fahrzeug.funkrufname}
                </span>
              </div>
              <div className="vehicle-row">
                {(["kdo", "tlf-a-4000", "lfa-b", "mtf", "zentrale"] as const).map((id) => {
                  const active2 = id === fahrzeugId;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`vehicle-chip${active2 ? " active" : ""}`}
                      onClick={() => !active2 && handleSwitchVehicle(id)}
                    >
                      <div className="code">{shortCode(id)}</div>
                      <div className="sub">{shortSub(id)}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Users size={20} />
                  Fahrer &amp; Fahrzeug-Kdt.
                </div>
                <span className="card-meta">
                  <span className="num">{fahrerKdtCount}</span> / 2 belegt
                </span>
              </div>
              <div className="grid-2">
                <PersonButton label="Fahrer" person={active.fahrer} onOpen={() => setPickerOpen({ kind: "fahrer" })} />
                <PersonButton label="Fahrzeug-Kdt." person={active.kdt} onOpen={() => setPickerOpen({ kind: "kdt" })} />
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Users size={20} />
                  Mannschaft
                </div>
                <span className="card-meta">
                  <span className="num">{mannschaftCount}</span> / {active.mannschaft.length} Plätze
                  {asAktiv > 0 ? <> · <span className="num">{asAktiv}</span>× Atemschutz aktiv</> : null}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {active.mannschaft.map((m, i) => (
                  <MannschaftSlot
                    key={m.slot}
                    data={m}
                    onPickPerson={() => setPickerOpen({ kind: "crew", slot: m.slot })}
                    onToggleAs={() => toggleMannschaftAs(i)}
                    onChangeAs={(v) => setMannschaftAsDauer(i, v)}
                  />
                ))}
              </div>
            </section>

            <GearChips
              items={gearList}
              selected={active.gearSelected}
              oelbindemittelSaecke={active.oelSaecke}
              onToggle={toggleGear}
              onOelChange={setOelSaecke}
            />

            <AuftraegeSection
              auftraege={active.auftraege}
              verfuegbareTypen={DEFAULT_AUFTRAG_TYPEN}
              onAdd={addAuftrag}
              onRemove={removeAuftrag}
            />

            <SectionHead title="Anfahrt & Position-Sharing" />
            <MapCard
              selfPos={selfPos}
              einsatzPos={active.einsatzPos}
              einsatzAdresse={active.alarm.einsatzort}
              fleet={fleet}
              hydranten={DEMO_HYDRANTEN}
              showLoeschwasser={false}
            />

            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Clipboard size={20} />
                  Einsatzchronik
                </div>
                <span className="card-meta">Whisper · offline</span>
              </div>
              <ChronikTimeline eintraege={active.chronik} />
              <DictateButton onAudio={onDictateResult} />
            </section>

            <div className="cta-wrap">
              <div className="cta-secondary">
                <button type="button">
                  <Save size={16} />
                  Entwurf speichern
                </button>
                <button type="button" onClick={() => setVorschauOpen(true)}>
                  <Eye size={16} />
                  Vorschau Bericht
                </button>
              </div>
              <button type="button" className="cta" onClick={() => setAbschlussModalOpen(true)}>
                <CheckCircle2 size={22} />
                Fahrzeugbericht abschließen
                <ArrowRight size={22} />
              </button>
              <div className="cta-hint">
                Übergibt den Bericht an die Zentrale <strong>„Florian Eberstalzell"</strong>.
              </div>
            </div>
          </>
        )}
      </main>

      <div className="appfoot">
        HotDoc
        <span className="sep">·</span>
        v0.7 UC2
        <span className="sep">·</span>
        {fahrzeug.funkrufname}
        <span className="sep">·</span>
        <button
          type="button"
          onClick={onResetSetup}
          style={{
            background: "transparent",
            border: 0,
            color: "inherit",
            font: "inherit",
            cursor: "pointer",
            textDecoration: "underline",
            minHeight: 0,
            padding: 0,
          }}
        >
          Setup
        </button>
      </div>

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
        current={fahrzeugId}
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

      <VorschauModal
        open={vorschauOpen}
        data={{
          funkrufname: fahrzeug.funkrufname,
          alarm: active.alarm,
          fahrer: active.fahrer,
          kdt: active.kdt,
          mannschaft: active.mannschaft,
          gearList,
          gearSelected: active.gearSelected,
          auftraege: active.auftraege,
          chronik: active.chronik,
          kmGefahren: kmRound,
        }}
        onClose={() => setVorschauOpen(false)}
      />
    </div>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="section-head">
      <span className="h">{title}</span>
      <span className="line" />
    </div>
  );
}

function shortCode(id: FahrzeugId): string {
  switch (id) {
    case "kdo":        return "KDO";
    case "tlf-a-4000": return "TANK";
    case "lfa-b":      return "LFA-B";
    case "mtf":        return "MTF";
    case "zentrale":   return "FLORIAN";
  }
}
function shortSub(id: FahrzeugId): string {
  switch (id) {
    case "kdo":        return "Kommando";
    case "tlf-a-4000": return "Tanklösch.";
    case "lfa-b":      return "Löschfzg.";
    case "mtf":        return "Mannsch.";
    case "zentrale":   return "Zentrale";
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}
