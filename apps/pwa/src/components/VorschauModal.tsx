import { ArrowLeft, Printer, X } from "lucide-react";
import { useMemo } from "react";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";
import type { AlarmDaten } from "./AlarmCard";
import type { Auftrag } from "./AuftraegeSection";
import type { ChronikEintrag } from "./ChronikTimeline";
import type { MannschaftSlotData } from "./MannschaftSlot";
import type { PickPerson } from "./PersonPickerModal";

export interface VorschauData {
  fahrzeugId: FahrzeugId;
  funkrufname: string;
  alarm: AlarmDaten;
  fahrer: PickPerson | null;
  kdt: PickPerson | null;
  mannschaft: MannschaftSlotData[];
  gearList: { id: string; bezeichnung: string }[];
  gearSelected: ReadonlySet<string>;
  oelSaecke?: number;
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
 * Vorschau-Bericht — visuelles Pendant zum Papier-Einsatzbericht der
 * FF Eberstalzell (siehe `Einsatzbericht 2025 NEU.pdf`).
 *
 * Druck-Flow: öffnet ein **neues Fenster** mit minimalem HTML +
 * Print-Styles und triggert dort print(). Vermeidet den klassischen
 * "Body-visibility-Hack" der Modal-Layouts mehrseitig duplizieren würde.
 */
export function VorschauModal({ open, data, onClose }: Props) {
  const html = useMemo(() => (open ? renderHtml(data) : ""), [open, data]);

  if (!open) return null;

  function printNow() {
    const w = window.open("", "hotdoc-print", "width=900,height=1200");
    if (!w) {
      alert("Pop-up-Blocker verhindert das Druckfenster. Bitte für diese Seite erlauben.");
      return;
    }
    w.document.open();
    w.document.write(`<!doctype html>
<html lang="de"><head>
  <meta charset="utf-8">
  <title>Fahrzeugbericht ${data.alarm.alarmId} · ${data.funkrufname}</title>
  <style>${PRINT_STYLES}</style>
</head><body>${html}</body></html>`);
    w.document.close();
    // print() nach kurzem Tick — mancher Browser braucht's
    setTimeout(() => {
      w.focus();
      w.print();
    }, 300);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2100,
        background: "rgba(0,0,0,0.65)",
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
        className="card"
        style={{
          width: "100%",
          maxWidth: 820,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: 0,
        }}
      >
        {/* Toolbar (nicht gedruckt — wird im neuen Fenster gar nicht erst gezeigt) */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 18px",
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>
            Vorschau · Fahrzeugbericht {data.alarm.alarmId} · {FAHRZEUGE[data.fahrzeugId].bezeichnung}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={printNow}
              className="cta"
              style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}
            >
              <Printer size={14} /> Drucken
            </button>
            <button type="button" onClick={onClose} className="themetoggle" aria-label="Schließen">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Bericht-Inhalt (gleiches HTML wie im Print-Fenster, aber mit
            Light-Hintergrund damit's auch im Dark-Mode druckbar aussieht) */}
        <div
          style={{ background: "#fff", color: "#000", padding: 24 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* U-16: Footer mit "Zurueck zur Bearbeitung" — gleicher Effekt wie
            das X oben, aber mit klarem Label fuer den Kdt der die Vorschau
            angeschaut hat und jetzt weiter bearbeiten will. */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 18px",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
              background: "transparent",
              color: "var(--fg)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            <ArrowLeft size={14} /> Zurueck zur Bearbeitung
          </button>
          <button
            type="button"
            onClick={printNow}
            className="cta"
            style={{ width: "auto", padding: "10px 16px", fontSize: 13, minHeight: 44 }}
          >
            <Printer size={14} /> Drucken
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  HTML-Renderer · ein-und-derselbe Output für Vorschau + Druck
// ═══════════════════════════════════════════════════════════════════

function renderHtml(d: VorschauData): string {
  const fz = FAHRZEUGE[d.fahrzeugId];
  const datum = new Date(d.alarm.alarmierungZeit);
  const datumStr = `${pad(datum.getDate())}.${pad(datum.getMonth() + 1)}.${datum.getFullYear()}`;
  const zeitAlarm = `${pad(datum.getHours())}:${pad(datum.getMinutes())}`;

  const mannschaft = d.mannschaft.filter((m) => m.person);
  const personenAnzahl = mannschaft.length + (d.fahrer ? 1 : 0) + (d.kdt ? 1 : 0);
  const asTrupps = mannschaft.filter((m) => m.atemschutzAktiv);
  const asGesamt = asTrupps.reduce((s, m) => s + (m.atemschutzDauerMin ?? 0), 0);
  const geraete = d.gearList.filter((g) => d.gearSelected.has(g.id));
  const oelOn = (d.oelSaecke ?? 0) > 0;
  const kmStr = d.kmGefahren > 0 ? d.kmGefahren.toFixed(1).replace(".", ",") : "—";

  // einzelnen Fahrzeug-Marker für Fahrzeug-Reihe
  const fzCheckbox = (id: FahrzeugId, label: string) =>
    `<span class="fz">${box(d.fahrzeugId === id)} ${label}</span>`;

  return `
<div class="page">
  <!-- HEADER -->
  <div class="hd">
    <div class="hd-l">
      <img class="hd-logo" src="/ff-eberstalzell-logo.png" alt="FF Eberstalzell" />
    </div>
    <div class="hd-r">
      <div class="hd-title">Fahrzeugbericht</div>
      <div class="hd-nr">${esc(d.alarm.alarmId)}</div>
    </div>
  </div>

  <!-- EINSATZ + DATUM -->
  <table class="bx">
    <tr>
      <td class="lbl" style="width:55%">Einsatzort</td>
      <td class="lbl">Datum und Uhrzeit</td>
    </tr>
    <tr>
      <td class="val">${esc(d.alarm.einsatzort)}</td>
      <td class="val">${datumStr} · ${zeitAlarm}</td>
    </tr>
  </table>

  <!-- FAHRZEUG-REIHE -->
  <table class="bx vbox">
    <tr>
      <td class="lbl" colspan="4">Fahrzeug</td>
    </tr>
    <tr class="fzrow">
      <td>${fzCheckbox("kdo", "KDO")}</td>
      <td>${fzCheckbox("tlf-a-4000", "TLF-A 4000")}</td>
      <td>${fzCheckbox("lfa-b", "LFA-B")}</td>
      <td>${fzCheckbox("mtf", "MTF")}</td>
    </tr>
    <tr>
      <td colspan="4" class="val small">
        <strong>${esc(fz.bezeichnung)}</strong> · Funkrufname <strong>${esc(d.funkrufname)}</strong> ·
        Besatzung ${esc(fz.besatzung.typ)}
      </td>
    </tr>
  </table>

  <!-- EINSATZART + STICHWORT -->
  <table class="bx">
    <tr>
      <td class="lbl" style="width:55%">Einsatzart</td>
      <td class="lbl">Stichwort</td>
    </tr>
    <tr>
      <td class="val">${esc(d.alarm.einsatzart)}</td>
      <td class="val">${esc(d.alarm.stichwort ?? "—")}</td>
    </tr>
  </table>

  <!-- FAHRER + KDT -->
  <table class="bx">
    <tr>
      <td class="lbl" style="width:50%">Fahrer</td>
      <td class="lbl">Fahrzeug-Kommandant</td>
    </tr>
    <tr>
      <td class="val">${personLine(d.fahrer)}</td>
      <td class="val">${personLine(d.kdt)}</td>
    </tr>
  </table>

  <!-- MANNSCHAFT -->
  <table class="bx tbl">
    <tr>
      <td class="lbl" colspan="4">Mannschaft (${mannschaft.length} Plätze · ${asTrupps.length}× Atemschutz)</td>
    </tr>
    <tr class="th">
      <th style="width:8%">#</th>
      <th>Name</th>
      <th style="width:18%">Dienstgrad</th>
      <th style="width:20%">Atemschutz</th>
    </tr>
    ${
      mannschaft.length > 0
        ? mannschaft
            .map(
              (m) => `
    <tr>
      <td class="ctr">${m.slot}</td>
      <td>${esc(m.person?.nachname ?? "")} ${esc(m.person?.vorname ?? "")}</td>
      <td class="ctr">${esc(m.person?.dienstgrad ?? "")}</td>
      <td class="ctr">${m.atemschutzAktiv ? `${m.atemschutzDauerMin} min` : "—"}</td>
    </tr>`,
            )
            .join("")
        : `<tr><td colspan="4" class="ctr muted">Keine Mannschaft eingetragen</td></tr>`
    }
  </table>

  <!-- GERÄTE + AUFTRÄGE -->
  <div class="cols">
    <table class="bx tbl">
      <tr>
        <td class="lbl">Eingesetzte Geräte &amp; Mittel (${geraete.length})</td>
      </tr>
      ${
        geraete.length > 0
          ? geraete
              .map(
                (g) => `
      <tr><td class="val list">${box(true)} ${esc(g.bezeichnung)}</td></tr>`,
              )
              .join("")
          : `<tr><td class="val muted ctr">keine</td></tr>`
      }
      ${oelOn ? `<tr><td class="val list"><strong>Ölbindemittel:</strong> ${d.oelSaecke} Sack</td></tr>` : ""}
    </table>

    <table class="bx tbl">
      <tr>
        <td class="lbl">Tätigkeiten &amp; Aufträge (${d.auftraege.length})</td>
      </tr>
      ${
        d.auftraege.length > 0
          ? d.auftraege
              .map(
                (a) => `
      <tr><td class="val list">${box(true)} <span class="t">${formatTime(a.zeitstempel)}</span> · ${esc(a.text)}</td></tr>`,
              )
              .join("")
          : `<tr><td class="val muted ctr">keine</td></tr>`
      }
    </table>
  </div>

  <!-- KM + AS Summary -->
  <table class="bx">
    <tr>
      <td class="lbl">KM gefahren</td>
      <td class="lbl">Mannschaft gesamt</td>
      <td class="lbl">Atemschutz-Zeit</td>
    </tr>
    <tr>
      <td class="val">${kmStr} km</td>
      <td class="val">${personenAnzahl} Personen</td>
      <td class="val">${asTrupps.length}× · ${asGesamt} min in Summe</td>
    </tr>
  </table>

  <!-- CHRONIK -->
  <table class="bx tbl">
    <tr>
      <td class="lbl" colspan="3">Einsatzchronik</td>
    </tr>
    <tr class="th">
      <th style="width:12%">Uhrzeit</th>
      <th style="width:22%">Quelle</th>
      <th>Eintrag</th>
    </tr>
    ${
      d.chronik.length > 0
        ? d.chronik
            .map(
              (c) => `
    <tr>
      <td class="ctr">${formatTime(c.zeitstempel)}</td>
      <td>${esc(c.source === "blaulichtsms" ? "BlaulichtSMS" : c.funkrufname)}</td>
      <td>${esc(c.text)}</td>
    </tr>`,
            )
            .join("")
        : `<tr><td colspan="3" class="ctr muted">keine Einträge</td></tr>`
    }
  </table>

  <!-- UNTERSCHRIFT -->
  <table class="bx">
    <tr>
      <td class="lbl" style="width:50%">Fahrzeug-Kommandant</td>
      <td class="lbl">Unterschrift · Datum</td>
    </tr>
    <tr>
      <td class="val tall">${personLine(d.kdt)}</td>
      <td class="val tall"></td>
    </tr>
  </table>

  <div class="ft">
    HotDoc · Fahrzeugbericht ist Anhang zum Hauptbericht von „Florian Eberstalzell".
  </div>
</div>
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════
//  Print-CSS · A4 Hochformat, 15 mm Rand, schwarz/weiß-druckbar
// ═══════════════════════════════════════════════════════════════════

const PRINT_STYLES = `
@page { size: A4 portrait; margin: 15mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, "Helvetica Neue", sans-serif; font-size: 10pt; line-height: 1.3; }
.page { max-width: 180mm; margin: 0 auto; }
.hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 6px; }
.hd-l { display: flex; align-items: center; gap: 10px; }
.hd-logo { height: 16mm; width: auto; display: block; }
.hd-r { text-align: right; }
.hd-title { font-size: 26pt; font-weight: 700; letter-spacing: -0.01em; line-height: 1; }
.hd-nr { font-family: "Courier New", monospace; font-size: 11pt; font-weight: 700; margin-top: 4px; }

table.bx { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-top: 4px; }
table.bx td, table.bx th { border: 1px solid #000; vertical-align: top; }
table.bx .lbl { background: #f3f3f3; font-weight: 600; font-size: 8.5pt; padding: 3px 6px; letter-spacing: 0.02em; }
table.bx .val { padding: 5px 6px 5px; font-size: 10pt; }
table.bx .val.small { font-size: 9pt; }
table.bx .val.tall { height: 22mm; vertical-align: bottom; padding-bottom: 4px; border-top: 1px dashed #aaa; }
table.bx .val.list { padding: 3px 6px; font-size: 9.5pt; }
table.bx .ctr { text-align: center; }
table.bx .muted { color: #777; font-style: italic; }
table.bx tr.th th { background: #efefef; font-weight: 700; font-size: 8.5pt; padding: 3px 6px; text-align: left; letter-spacing: 0.04em; text-transform: uppercase; }
table.bx tr.fzrow td { padding: 5px 6px; font-size: 9.5pt; }

.vbox tr.fzrow td .fz { display: inline-flex; align-items: center; gap: 5px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.t { font-family: "Courier New", monospace; font-size: 9pt; color: #555; }

.ft { text-align: center; font-size: 8pt; color: #555; margin-top: 8mm; padding-top: 4px; border-top: 1px solid #000; }

/* keine seitenumbrüche innerhalb von tabellen */
table.bx { page-break-inside: avoid; }
.hd { page-break-after: avoid; }
`;

// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════

function box(checked: boolean): string {
  // Unicode-Checkbox, druckt zuverlässig schwarz/weiß
  return checked ? "☒" : "☐";
}

function personLine(p: PickPerson | null): string {
  if (!p) return `<span style="color:#888;font-style:italic">— nicht zugewiesen —</span>`;
  return `<strong>${esc(p.nachname)} ${esc(p.vorname)}</strong> · ${esc(p.dienstgrad)}`;
}

function esc(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
