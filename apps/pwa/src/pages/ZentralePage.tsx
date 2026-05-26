import {
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  Lock,
  MapPin,
  Truck,
  Users,
} from "lucide-react";
import { useState } from "react";

import { ChronikTimeline, type ChronikEintrag } from "../components/ChronikTimeline";
import { DemoBanner } from "../components/DemoBanner";
import { EinsatzTabs, type EinsatzTabSummary } from "../components/EinsatzTabs";
import { Topbar } from "../components/Topbar";
import { VehicleSwitcherModal } from "../components/VehicleSwitcherModal";
import { DEMO_ALARM } from "../data/demo-alarm";
import { useGeolocation } from "../lib/geo";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

interface Props {
  onSwitchFahrzeug: (id: FahrzeugId) => void;
  onResetSetup: () => void;
}

/**
 * Florianstation / Einsatzzentrale — Hauptbericht-Layout (Anhang B des
 * Spec). Aggregiert Fahrzeugberichte aus dem Einsatz, zeigt Status
 * pro Fahrzeug und übernimmt die Übergabe an den Bearbeiter (PDF +
 * syBOS-Spickzettel).
 *
 * Vollständige Backend-Anbindung (Aggregation aus CouchDB-Views) kommt
 * in Phase 6 — aktuell sind die Werte aus dem Mock-Alarm-Demo.
 */
export function ZentralePage({ onSwitchFahrzeug, onResetSetup }: Props) {
  const fahrzeug = FAHRZEUGE.zentrale;
  const geo = useGeolocation();
  const [vehicleSwitcherOpen, setVehicleSwitcherOpen] = useState(false);

  // Mock-Status für jedes Fahrzeug
  const fahrzeugStatus: { id: FahrzeugId; status: "wartend" | "im_einsatz" | "abgeschlossen"; mannschaft: number; kdt?: string }[] = [
    { id: "kdo", status: "im_einsatz", mannschaft: 4, kdt: "Pernkopf Gerald" },
    { id: "tlf-a-4000", status: "im_einsatz", mannschaft: 8, kdt: "Eder Christoph" },
    { id: "lfa-b", status: "abgeschlossen", mannschaft: 6, kdt: "Eder Christoph" },
    { id: "mtf", status: "wartend", mannschaft: 0 },
  ];

  const tabs: EinsatzTabSummary[] = [
    {
      id: DEMO_ALARM.alarmId,
      einsatzart: DEMO_ALARM.einsatzart,
      einsatzort: DEMO_ALARM.einsatzort,
      status: "aktiv",
      manuell: false,
    },
  ];

  const datum = new Date(DEMO_ALARM.alarmierungZeit);
  const datumStr = `${pad(datum.getDate())}.${pad(datum.getMonth() + 1)}.${datum.getFullYear()}`;

  const aggregateMannschaft = fahrzeugStatus.reduce((sum, f) => sum + f.mannschaft, 0);
  const abgeschlossenCount = fahrzeugStatus.filter((f) => f.status === "abgeschlossen").length;
  const aktivCount = fahrzeugStatus.filter((f) => f.status === "im_einsatz").length;

  const chronik: ChronikEintrag[] = [
    {
      id: "z1",
      zeitstempel: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      funkrufname: "BlaulichtSMS",
      source: "blaulichtsms",
      text: "Alarmierung · Brand KFZ · Eberstalzeller Straße 5",
    },
    {
      id: "z2",
      zeitstempel: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      funkrufname: "Pumpe Eberstalzell",
      source: "fahrzeug",
      text: "Ausrückung mit voller Besatzung.",
    },
    {
      id: "z3",
      zeitstempel: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
      funkrufname: "Tank Eberstalzell",
      source: "fahrzeug",
      text: "Eintreffen am Einsatzort, Wasserabgabe vorbereiten.",
    },
    {
      id: "z4",
      zeitstempel: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      funkrufname: "Atemschutz",
      source: "atemschutz",
      text: "Huemer Manfred unter Atemschutz im Einsatz",
    },
  ];

  return (
    <div>
      <Topbar funkrufname={fahrzeug.funkrufname} einsatzNr={DEMO_ALARM.alarmId} geo={geo} />

      <EinsatzTabs tabs={tabs} activeId={DEMO_ALARM.alarmId} onSelect={() => {}} onNew={() => {}} />

      <DemoBanner />

      <main className="page">
        {/* Hauptbericht-Header */}
        <section
          className="alarm"
          style={{
            background:
              "linear-gradient(135deg, #FFFFFF 0%, #F0F7FF 55%, #DBEAFE 100%)",
            borderColor: "rgba(37,99,235,0.25)",
          }}
        >
          <div className="alarm-top">
            <div className="alarm-left">
              <div className="alarm-icon" style={{ background: "var(--info)" }}>
                <Activity size={30} color="#fff" strokeWidth={2} />
              </div>
              <div>
                <div className="alarm-tags">
                  <span className="alarm-tag" style={{ color: "var(--info)" }}>
                    <span
                      className="dot"
                      style={{ background: "var(--info)" }}
                    />
                    Einsatzzentrale
                  </span>
                  <span className="alarm-tag muted">· Florian Eberstalzell · Hauptbericht</span>
                </div>
                <div className="alarm-title">{DEMO_ALARM.einsatzart}</div>
                <div className="alarm-addr">
                  <MapPin size={16} />
                  {DEMO_ALARM.einsatzort}
                </div>
              </div>
            </div>
            <div className="alarm-no">#{DEMO_ALARM.alarmId}</div>
          </div>

          <div className="alarm-meta">
            <div className="cell">
              <div className="lbl">Alarmiert</div>
              <div className="val">{formatTime(DEMO_ALARM.alarmierungZeit)}</div>
            </div>
            <div className="cell">
              <div className="lbl">Fahrzeuge aktiv</div>
              <div className="val">
                {aktivCount}
                <span className="unit">/ {fahrzeugStatus.length}</span>
              </div>
            </div>
            <div className="cell">
              <div className="lbl">Mannschaft</div>
              <div className="val">
                {aggregateMannschaft}
                <span className="unit">Pers.</span>
              </div>
            </div>
            <div className="cell">
              <div className="lbl">Berichte</div>
              <div className="val">
                {abgeschlossenCount}
                <span className="unit">/ {fahrzeugStatus.length} fertig</span>
              </div>
            </div>
          </div>
        </section>

        <SectionHead title="Einsatzdaten" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Calendar size={20} />
              Stammdaten Einsatz
            </div>
            <span className="card-meta">Auto-Übernahme aus BlaulichtSMS</span>
          </div>
          <div className="grid-3" style={{ gap: 14 }}>
            <ReadOnly label="Datum" value={datumStr} />
            <ReadOnly label="Alarmiert" value={formatTime(DEMO_ALARM.alarmierungZeit)} />
            <ReadOnly label="Auslöser" value={DEMO_ALARM.alarmierungAuthor} />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label className="caption">Einsatzort</label>
            <input className="input filled" value={DEMO_ALARM.einsatzort} readOnly />
          </div>
        </section>

        <SectionHead title="Fahrzeuge im Einsatz" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Truck size={20} />
              Status pro Fahrzeug
            </div>
            <span className="card-meta">
              <span className="num">{aktivCount}</span> im Einsatz · <span className="num">{abgeschlossenCount}</span> abgeschlossen
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {fahrzeugStatus.map((f) => {
              const fz = FAHRZEUGE[f.id];
              const badge =
                f.status === "abgeschlossen"
                  ? { cls: "ok", label: "Abgeschlossen", Icon: CheckCircle2 }
                  : f.status === "im_einsatz"
                    ? { cls: "warn", label: "Im Einsatz", Icon: Activity }
                    : { cls: "neutral", label: "Wartend", Icon: Lock };
              const Icon = badge.Icon;
              return (
                <div key={f.id} className="crew-row filled">
                  <div className="crew-num" style={{ width: 64, fontFamily: "var(--font-mono)" }}>
                    {shortCode(f.id)}
                  </div>
                  <div className="crew-name" style={{ flex: "0 1 auto" }}>
                    {fz.funkrufname}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--fg-3)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontWeight: 600,
                      marginLeft: 12,
                    }}
                  >
                    {f.kdt ?? "—"} · {f.mannschaft} Pers.
                  </div>
                  <div className="crew-meta" style={{ marginLeft: "auto" }}>
                    <span className={`badge ${badge.cls}`} style={{ gap: 4 }}>
                      <Icon size={11} />
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <SectionHead title="Zusammenfassung Mannschaft" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Users size={20} />
              Gesamtaufstellung
            </div>
            <span className="card-meta">
              <span className="num">{aggregateMannschaft}</span> Personen im Einsatz
            </span>
          </div>
          <div className="grid-3" style={{ gap: 12 }}>
            <Stat label="Aktive Mannschaft" value={String(aggregateMannschaft)} unit="Pers." />
            <Stat label="Atemschutz aktiv" value="2" unit="Trupps" tone="as" />
            <Stat label="Sonstige FF (Schau)" value="0" unit="Pers." />
          </div>
        </section>

        <SectionHead title="Globale Einsatzchronik" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Clipboard size={20} />
              Chronologie aller Fahrzeuge
            </div>
            <span className="card-meta">Live aus Replikation</span>
          </div>
          <ChronikTimeline eintraege={chronik} />
        </section>

        <SectionHead title="Übergabe an Bearbeiter" />
        <div className="cta-wrap">
          <div className="cta-secondary">
            <button type="button">
              <Download size={16} />
              PDF-Bericht
            </button>
            <button type="button">
              <FileText size={16} />
              syBOS-Spickzettel
            </button>
          </div>
          <button
            type="button"
            className="cta"
            disabled={abgeschlossenCount < fahrzeugStatus.length}
            style={
              abgeschlossenCount < fahrzeugStatus.length
                ? { opacity: 0.55, cursor: "not-allowed" }
                : undefined
            }
          >
            <CheckCircle2 size={22} />
            Einsatz abschließen &amp; archivieren
            <ArrowRight size={22} />
          </button>
          <div className="cta-hint">
            {abgeschlossenCount < fahrzeugStatus.length ? (
              <>
                <strong>{fahrzeugStatus.length - abgeschlossenCount}</strong> Fahrzeugberichte
                fehlen noch — Abschluss erst nach Eingang aller Berichte möglich.
              </>
            ) : (
              <>Alle Fahrzeugberichte vollständig — bereit zur Übergabe.</>
            )}
          </div>
        </div>
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
          onClick={() => setVehicleSwitcherOpen(true)}
          style={{
            background: "transparent",
            border: 0,
            color: "inherit",
            font: "inherit",
            cursor: "pointer",
            textDecoration: "underline",
            minHeight: 0,
            padding: 0,
            marginRight: 8,
          }}
        >
          Fahrzeug wechseln
        </button>
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

      <VehicleSwitcherModal
        open={vehicleSwitcherOpen}
        current="zentrale"
        onSelect={(id) => {
          setVehicleSwitcherOpen(false);
          onSwitchFahrzeug(id);
        }}
        onClose={() => setVehicleSwitcherOpen(false)}
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <label className="caption">{label}</label>
      <div className="input-row filled">
        <input value={value} readOnly />
      </div>
    </div>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "as" }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: tone === "as" ? "var(--as-tint)" : "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: tone === "as" ? "var(--as)" : "var(--fg-3)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: tone === "as" ? "var(--as)" : "var(--fg)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {unit ? (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-2)", marginLeft: 4 }}>
            {unit}
          </span>
        ) : null}
      </div>
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

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
