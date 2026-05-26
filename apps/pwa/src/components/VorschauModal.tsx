import { FileText, Printer, X } from "lucide-react";
import type { AlarmDaten } from "./AlarmCard";
import type { Auftrag } from "./AuftraegeSection";
import type { ChronikEintrag } from "./ChronikTimeline";
import type { MannschaftSlotData } from "./MannschaftSlot";
import type { PickPerson } from "./PersonPickerModal";

export interface VorschauData {
  funkrufname: string;
  alarm: AlarmDaten;
  fahrer: PickPerson | null;
  kdt: PickPerson | null;
  mannschaft: MannschaftSlotData[];
  gearList: { id: string; bezeichnung: string }[];
  gearSelected: ReadonlySet<string>;
  auftraege: Auftrag[];
  chronik: ChronikEintrag[];
  kmGefahren: number;
}

interface Props {
  open: boolean;
  data: VorschauData;
  onClose: () => void;
}

/**
 * Vorschau-Bericht — formatierter Auszug wie das spätere PDF.
 * Browser-Print fertigt sofort eine 1:1 Vorlage. Zum Test ohne Backend-PDF.
 */
export function VorschauModal({ open, data, onClose }: Props) {
  if (!open) return null;

  const mannschaft = data.mannschaft.filter((m) => m.person);
  const asTrupps = mannschaft.filter((m) => m.atemschutzAktiv);
  const geraete = data.gearList.filter((g) => data.gearSelected.has(g.id));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2100,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        padding: 16,
        display: "grid",
        placeItems: "center",
        overflowY: "auto",
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card no-print-skip"
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: 0,
        }}
      >
        {/* Header (nicht im Print) */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 20px",
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
          }}
          className="vorschau-controls"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--info-tint)",
                color: "var(--info)",
              }}
            >
              <FileText size={18} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>
                Vorschau · Fahrzeugbericht
              </h3>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
                }}
              >
                {data.alarm.alarmId} · {data.funkrufname}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="cta"
              onClick={() => window.print()}
              style={{
                width: "auto",
                padding: "8px 14px",
                fontSize: 13,
                background:
                  "linear-gradient(180deg, var(--info) 0%, color-mix(in srgb, var(--info) 70%, #000) 100%)",
              }}
            >
              <Printer size={14} /> Drucken
            </button>
            <button type="button" className="themetoggle" onClick={onClose} aria-label="Schließen">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Druck-Layout */}
        <div style={{ padding: 28, fontFamily: "var(--font-sans)", color: "var(--fg)" }} className="vorschau-print">
          {/* Bericht-Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              borderBottom: "2px solid var(--red)",
              paddingBottom: 12,
              marginBottom: 20,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--red)",
                }}
              >
                Fahrzeugbericht · FF Eberstalzell
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                {data.alarm.einsatzart}
              </div>
              <div style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 2 }}>
                {data.alarm.einsatzort}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 800 }}>
                {data.alarm.alarmId}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                {formatDateLong(data.alarm.alarmierungZeit)}
              </div>
            </div>
          </div>

          {/* Stammdaten */}
          <Block title="Einsatzdaten">
            <Row>
              <Cell label="Alarmiert">{formatTime(data.alarm.alarmierungZeit)}</Cell>
              <Cell label="Quelle">{data.alarm.alarmierungAuthor}</Cell>
              <Cell label="Stichwort">{data.alarm.stichwort ?? "—"}</Cell>
              <Cell label="KM gefahren">{data.kmGefahren.toFixed(1).replace(".", ",")} km</Cell>
            </Row>
          </Block>

          {/* Fahrer & Kdt */}
          <Block title="Fahrer &amp; Fahrzeug-Kommandant">
            <Row>
              <Cell label="Fahrer">
                {data.fahrer
                  ? `${data.fahrer.nachname} ${data.fahrer.vorname} (${data.fahrer.dienstgrad})`
                  : "—"}
              </Cell>
              <Cell label="Fahrzeug-Kdt.">
                {data.kdt
                  ? `${data.kdt.nachname} ${data.kdt.vorname} (${data.kdt.dienstgrad})`
                  : "—"}
              </Cell>
            </Row>
          </Block>

          {/* Mannschaft */}
          <Block title={`Mannschaft (${mannschaft.length})`}>
            {mannschaft.length === 0 ? (
              <p style={{ color: "var(--fg-3)", fontSize: 13 }}>Keine Mannschaft eingetragen.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={th}>#</th>
                    <th style={th}>Name</th>
                    <th style={th}>Dienstgrad</th>
                    <th style={th}>Atemschutz</th>
                  </tr>
                </thead>
                <tbody>
                  {mannschaft.map((m) => (
                    <tr key={m.slot} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{m.slot}</td>
                      <td style={td}>
                        {m.person?.nachname} {m.person?.vorname}
                      </td>
                      <td style={td}>{m.person?.dienstgrad}</td>
                      <td style={td}>
                        {m.atemschutzAktiv ? `AS · ${m.atemschutzDauerMin} min` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {asTrupps.length > 0 ? (
              <p style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 8 }}>
                <strong>{asTrupps.length}× Atemschutz</strong> aktiv ·{" "}
                {asTrupps.reduce((s, m) => s + m.atemschutzDauerMin, 0)} min in Summe
              </p>
            ) : null}
          </Block>

          {/* Geräte */}
          {geraete.length > 0 ? (
            <Block title={`Eingesetzte Geräte & Mittel (${geraete.length})`}>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                {geraete.map((g) => (
                  <li key={g.id}>{g.bezeichnung}</li>
                ))}
              </ul>
            </Block>
          ) : null}

          {/* Aufträge */}
          {data.auftraege.length > 0 ? (
            <Block title={`Tätigkeiten & Aufträge (${data.auftraege.length})`}>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                {data.auftraege.map((a) => (
                  <li key={a.id}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>
                      {formatTime(a.zeitstempel)}
                    </span>{" "}
                    · {a.text}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {/* Chronik */}
          <Block title={`Einsatzchronik (${data.chronik.length})`}>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 13 }}>
              {data.chronik.map((c) => (
                <li
                  key={c.id}
                  style={{
                    borderLeft: "2px solid var(--border)",
                    padding: "6px 10px",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>
                    {formatTime(c.zeitstempel)} · {c.funkrufname}
                  </span>
                  <div>{c.text}</div>
                </li>
              ))}
            </ul>
          </Block>

          {/* Footer */}
          <div
            style={{
              marginTop: 28,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-3)",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <span>HotDoc · {data.alarm.alarmId}</span>
            <span>Vorschau · noch nicht abgeschlossen</span>
          </div>
        </div>
      </div>

      <style>
        {`
        @media print {
          .vorschau-controls { display: none !important; }
          body * { visibility: hidden; }
          .vorschau-print, .vorschau-print * { visibility: visible; }
          .vorschau-print {
            position: absolute;
            inset: 0;
            padding: 24px;
          }
        }
        `}
      </style>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h4
        style={{
          margin: "0 0 8px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--fg-2)",
        }}
        dangerouslySetInnerHTML={{ __html: title }}
      />
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{children}</div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--fg-3)",
};
const td: React.CSSProperties = { padding: "6px 8px" };

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
function formatDateLong(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
