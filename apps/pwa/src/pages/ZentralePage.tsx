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
import { useEffect, useState } from "react";

import { ChronikTimeline, type ChronikEintrag } from "../components/ChronikTimeline";
import { DemoBanner } from "../components/DemoBanner";
import { EinsatzTabs, type EinsatzTabSummary } from "../components/EinsatzTabs";
import { Topbar } from "../components/Topbar";
import { VehicleSwitcherModal } from "../components/VehicleSwitcherModal";
import { DEMO_ALARM } from "../data/demo-alarm";
import { apiCall, getTabletToken } from "../lib/api";
import { fetchChronikDiff } from "../lib/chronik-sync";
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
  const [aktiverEinsatzId, setAktiverEinsatzId] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<"pdf" | "spick" | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);

  // Aktive Einsätze vom Backend laden — der erste aktive wird die Quelle
  // für PDF/Spickzettel/Chronik-Sync. Refresht alle 30 s.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await apiCall<{ items: Array<{ _id: string; status: string }> }>(
          "/api/einsaetze?status=aktiv",
        );
        if (cancelled) return;
        const first = r.items[0];
        if (first) setAktiverEinsatzId(first._id);
      } catch {
        // Backend nicht erreichbar — Fallback auf Demo-ID damit Buttons nicht völlig tot wirken
      }
    };
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  async function downloadPdf(einsatzId: string): Promise<void> {
    setDownloadBusy("pdf");
    setDownloadErr(null);
    try {
      const token = getTabletToken();
      const res = await fetch(`/api/einsaetze/${encodeURIComponent(einsatzId)}/pdf`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} — ${txt.slice(0, 120)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Tab öffnen statt direkt download — PDF-Viewer hat oft Druck-Button
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        // Pop-up blocked → klassischer Download
        const a = document.createElement("a");
        a.href = url;
        a.download = `einsatzbericht-${einsatzId.replace(/[^a-z0-9-]/gi, "_")}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setDownloadErr(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadBusy(null);
    }
  }

  async function openSpickzettel(einsatzId: string): Promise<void> {
    setDownloadBusy("spick");
    setDownloadErr(null);
    try {
      const token = getTabletToken();
      const res = await fetch(`/api/einsaetze/${encodeURIComponent(einsatzId)}/spickzettel`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const win = window.open("", "_blank", "noopener,noreferrer");
      if (!win) {
        alert("Pop-up-Blocker — bitte für diese Seite erlauben.");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      setDownloadErr(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadBusy(null);
    }
  }

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

  // Globale Einsatzchronik — wird aus dem CouchDB-Einsatz-Doc gepollt,
  // identischer Cross-Sync wie auf den Tablets. Anfangs Demo-Einträge
  // damit die UI nicht leer ist; sobald echte Daten via Sync kommen,
  // werden sie zusätzlich gemerged.
  const [chronik, setChronik] = useState<ChronikEintrag[]>([
    {
      id: "z1-demo",
      zeitstempel: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      funkrufname: "BlaulichtSMS",
      source: "blaulichtsms",
      text: "Alarmierung · Brand KFZ · Eberstalzeller Straße 5",
    },
  ]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const id = aktiverEinsatzId ?? DEMO_ALARM.alarmId;
      const knownIds = new Set(chronik.map((c) => c.id));
      const neue = await fetchChronikDiff(id, knownIds);
      if (cancelled || neue.length === 0) return;
      setChronik((prev) => {
        const own = new Set(prev.map((c) => c.id));
        const toAdd = neue.filter((n) => !own.has(n.id));
        if (toAdd.length === 0) return prev;
        return [...prev, ...toAdd].sort(
          (a, b) => new Date(a.zeitstempel).getTime() - new Date(b.zeitstempel).getTime(),
        );
      });
    };
    void tick();
    const t = setInterval(() => void tick(), 8_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiverEinsatzId]);

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
          {downloadErr ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--red-tint)",
                color: "var(--red)",
                fontSize: 13,
                border: "1px solid var(--red-border)",
              }}
            >
              {downloadErr}
            </div>
          ) : null}
          <div className="cta-secondary">
            <button
              type="button"
              onClick={() => aktiverEinsatzId && void downloadPdf(aktiverEinsatzId)}
              disabled={!aktiverEinsatzId || downloadBusy !== null}
            >
              <Download size={16} />
              {downloadBusy === "pdf" ? "Lade …" : "PDF-Bericht"}
            </button>
            <button
              type="button"
              onClick={() => aktiverEinsatzId && void openSpickzettel(aktiverEinsatzId)}
              disabled={!aktiverEinsatzId || downloadBusy !== null}
            >
              <FileText size={16} />
              {downloadBusy === "spick" ? "Lade …" : "syBOS-Spickzettel"}
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
