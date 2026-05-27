/**
 * PDF-Template für Übungs-Dokumentation.
 *
 * Use-Case: Ausbildungsnachweis — Teilnehmer-Liste mit AS-Stunden zählt
 * für die Atemschutz-Berechtigung und die jährliche Übungsstunden-
 * Statistik. Übungsleiter unterschreibt → wird als offizieller Nachweis
 * archiviert.
 *
 * Layout: A4 hochkant. Grüner Header damit der Empfänger sofort
 * "ÜBUNG" sieht (nicht zu verwechseln mit Brand-Einsatzbericht).
 */

export type UebungsTyp =
  | "Atemschutz"
  | "Technische Hilfeleistung"
  | "Höhenrettung"
  | "Sanitätsdienst"
  | "Funk"
  | "Allgemeine Übung"
  | "Bewerb"
  | "Sonstige";

export interface UebungDaten {
  einsatzId: string;
  uebungThema: string;
  uebungsTyp?: UebungsTyp;
  uebungsleiter?: string;
  einsatzort: string;
  alarmierungZeit: string;
  einsatzende?: string;
  teilnehmer: Array<{
    name: string;
    rang?: string;
    atemschutzAktiv?: boolean;
    atemschutzDauerMin?: number;
    fahrzeugAbk?: string;
  }>;
  meldungEinsatzleitung?: string;
  notizen?: string;
}

export function renderUebungHtml(d: UebungDaten): string {
  const datum = formatDate(d.alarmierungZeit);
  const start = formatTime(d.alarmierungZeit);
  const ende = d.einsatzende ? formatTime(d.einsatzende) : "—";
  const dauerMin = d.einsatzende ? calcDauerMin(d.alarmierungZeit, d.einsatzende) : 0;
  const dauerStr = dauerMin === 0 ? "—" : `${Math.floor(dauerMin / 60)}h ${pad(dauerMin % 60)}min`;
  const asTeilnehmer = d.teilnehmer.filter((t) => t.atemschutzAktiv === true);
  const asTrupps = Math.ceil(asTeilnehmer.length / 2);
  const asStunden =
    asTeilnehmer.reduce((sum, t) => sum + (t.atemschutzDauerMin ?? 0), 0) / 60;
  const teilnehmerStunden = dauerMin > 0 ? (d.teilnehmer.length * dauerMin) / 60 : 0;

  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Übungsdokumentation ${escape(d.einsatzId)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #fff;
      color: #0f172a;
      font-family: Arial, "Helvetica Neue", sans-serif;
      font-size: 10pt;
      line-height: 1.35;
    }
    .page { max-width: 182mm; }

    .hd { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 6mm; }
    .hd-left { display: flex; align-items: center; gap: 12px; }
    .hd-mark {
      width: 22mm; height: 22mm;
      border-radius: 50%;
      background: #16a34a;
      display: grid; place-items: center;
      color: #fff;
      font-weight: 800;
      font-size: 8pt;
      letter-spacing: 0.12em;
      text-align: center;
      line-height: 1.1;
    }
    .hd-title { font-size: 22pt; font-weight: 800; letter-spacing: -0.01em; color: #0f172a; }
    .hd-sub { font-size: 9pt; color: #64748b; margin-top: 1mm; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; }
    .hd-id { font-family: "Courier New", monospace; font-size: 8pt; color: #64748b; text-align: right; }

    .typ-banner {
      background: linear-gradient(90deg, #16a34a 0%, #15803d 100%);
      color: #fff;
      padding: 6mm 8mm;
      border-radius: 3mm;
      margin-bottom: 5mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10mm;
    }
    .typ-banner-label {
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .typ-banner-value {
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: -0.01em;
      margin-top: 1mm;
    }
    .typ-banner-type {
      text-align: right;
      font-size: 9pt;
    }
    .typ-banner-type strong {
      display: block;
      font-size: 13pt;
      font-weight: 800;
    }

    .sec {
      border: 1px solid #cbd5e1;
      border-radius: 2mm;
      padding: 4mm 5mm;
      margin-bottom: 4mm;
    }
    .sec-title {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 2mm;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 1.5mm;
    }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
    .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; }
    .row4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4mm; }
    .lbl { font-size: 8pt; font-weight: 700; color: #64748b; letter-spacing: 0.06em; text-transform: uppercase; }
    .val { font-size: 11pt; font-weight: 600; color: #0f172a; margin-top: 0.6mm; }
    .val-big { font-size: 13pt; font-weight: 700; color: #0f172a; margin-top: 0.6mm; }
    .val-mono { font-family: "Courier New", monospace; font-variant-numeric: tabular-nums; }

    table.teilnehmer {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    table.teilnehmer th, table.teilnehmer td {
      padding: 1.5mm 2mm;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
    }
    table.teilnehmer th {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #64748b;
      border-bottom: 1.5px solid #94a3b8;
      background: #f8fafc;
    }
    .as-badge {
      display: inline-block;
      padding: 0.3mm 1.8mm;
      background: #dbeafe;
      color: #1d4ed8;
      border-radius: 3pt;
      font-family: "Courier New", monospace;
      font-weight: 700;
      font-size: 7.5pt;
      letter-spacing: 0.08em;
    }
    .num { font-family: "Courier New", monospace; font-variant-numeric: tabular-nums; text-align: right; }

    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 3mm;
      margin-top: 3mm;
    }
    .stat-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      padding: 3mm 4mm;
      border-radius: 2mm;
    }
    .stat-label { font-size: 7pt; font-weight: 700; color: #15803d; letter-spacing: 0.12em; text-transform: uppercase; }
    .stat-value { font-size: 16pt; font-weight: 800; color: #14532d; margin-top: 1mm; font-variant-numeric: tabular-nums; }
    .stat-unit { font-size: 9pt; font-weight: 500; color: #15803d; }

    .freitext {
      min-height: 16mm;
      padding: 3mm;
      border: 1px solid #e2e8f0;
      border-radius: 2mm;
      background: #f8fafc;
      font-size: 9.5pt;
      white-space: pre-wrap;
      line-height: 1.5;
    }

    .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 8mm; }
    .sig-box { border-top: 1px solid #0f172a; padding-top: 1.5mm; font-size: 8pt; color: #64748b; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; min-height: 18mm; }

    .ft {
      margin-top: 6mm;
      padding-top: 3mm;
      border-top: 1px solid #cbd5e1;
      font-size: 7pt;
      color: #94a3b8;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-family: "Courier New", monospace;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
<div class="page">

  <div class="hd">
    <div class="hd-left">
      <div class="hd-mark">FF<br>EBER</div>
      <div>
        <div class="hd-title">Übungsdokumentation</div>
        <div class="hd-sub">FF Eberstalzell · Ausbildungsnachweis</div>
      </div>
    </div>
    <div class="hd-id">${escape(d.einsatzId)}</div>
  </div>

  <div class="typ-banner">
    <div>
      <div class="typ-banner-label">Übungsthema</div>
      <div class="typ-banner-value">${escape(d.uebungThema)}</div>
    </div>
    <div class="typ-banner-type">
      <div class="typ-banner-label">Typ</div>
      <strong>${escape(d.uebungsTyp ?? "—")}</strong>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">Übungsdaten</div>
    <div class="row4">
      <div>
        <div class="lbl">Datum</div>
        <div class="val val-mono">${datum}</div>
      </div>
      <div>
        <div class="lbl">Beginn</div>
        <div class="val val-mono">${start}</div>
      </div>
      <div>
        <div class="lbl">Ende</div>
        <div class="val val-mono">${ende}</div>
      </div>
      <div>
        <div class="lbl">Dauer</div>
        <div class="val val-mono">${dauerStr}</div>
      </div>
    </div>
    <div class="row2" style="margin-top: 3mm">
      <div>
        <div class="lbl">Übungsort</div>
        <div class="val">${escape(d.einsatzort)}</div>
      </div>
      <div>
        <div class="lbl">Übungsleiter</div>
        <div class="val">${escape(d.uebungsleiter ?? "—")}</div>
      </div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">Aufstellung</div>
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-label">Teilnehmer</div>
        <div class="stat-value">${d.teilnehmer.length} <span class="stat-unit">Pers.</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Teilnehmer-Stunden</div>
        <div class="stat-value">${formatHours(teilnehmerStunden)} <span class="stat-unit">h</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">AS-Trupps</div>
        <div class="stat-value">${asTrupps} <span class="stat-unit">${asTrupps === 1 ? "Trupp" : "Trupps"}</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">AS-Stunden</div>
        <div class="stat-value">${formatHours(asStunden)} <span class="stat-unit">h</span></div>
      </div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">Teilnehmer-Liste</div>
    <table class="teilnehmer">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Rang</th>
          <th>Fahrzeug</th>
          <th>Atemschutz</th>
          <th class="num">AS-Min</th>
        </tr>
      </thead>
      <tbody>
        ${d.teilnehmer.length === 0
          ? `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:4mm">— keine Teilnehmer erfasst —</td></tr>`
          : d.teilnehmer
              .map(
                (t, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td>${escape(t.name)}</td>
            <td>${escape(t.rang ?? "")}</td>
            <td>${t.fahrzeugAbk ? `<span class="as-badge" style="background:#fed7aa;color:#92400e">${escape(t.fahrzeugAbk)}</span>` : ""}</td>
            <td>${t.atemschutzAktiv ? '<span class="as-badge">AS</span>' : ""}</td>
            <td class="num">${t.atemschutzAktiv && typeof t.atemschutzDauerMin === "number" ? t.atemschutzDauerMin : ""}</td>
          </tr>`,
              )
              .join("")}
      </tbody>
    </table>
  </div>

  ${d.meldungEinsatzleitung || d.notizen
    ? `<div class="sec">
        <div class="sec-title">Lernziele · Notizen</div>
        <div class="freitext">${escape(d.notizen ?? d.meldungEinsatzleitung ?? "")}</div>
      </div>`
    : ""}

  <div class="sig-row">
    <div class="sig-box">${escape(d.uebungsleiter ?? "")}\n<br/>Übungsleiter · Unterschrift</div>
    <div class="sig-box">\n<br/>Kommando · Bestätigung</div>
  </div>

  <div class="ft">
    <span>HotDoc · FF Eberstalzell · Übungsdokumentation</span>
    <span>${new Date().toLocaleString("de-AT")}</span>
  </div>

</div>
</body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  } catch {
    return iso;
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

function formatHours(h: number): string {
  if (h === 0) return "0";
  return h.toFixed(1).replace(".", ",");
}

function calcDauerMin(vonIso: string, bisIso: string): number {
  try {
    const von = new Date(vonIso).getTime();
    const bis = new Date(bisIso).getTime();
    if (Number.isNaN(von) || Number.isNaN(bis)) return 0;
    return Math.max(0, Math.floor((bis - von) / 60_000));
  } catch {
    return 0;
  }
}
