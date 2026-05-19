/**
 * HTML-Vorlage für den Einsatzbericht-PDF.
 * Layout: A4 hochkant, 1:1 dem Papier-Original der FF Eberstalzell nachempfunden.
 * Wird in puppeteer mit page.setContent geladen.
 */

interface BerichtDaten {
  einsatzId: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  einsatzort: string;
  alarmierungZeit: string;
  alarmierungAuthor?: string;
  einsatzTyp: "alarm" | "manuell";
  status: string;
  einsatzende?: string;
  meldungEinsatzleitung?: string;
  oelbindemittelSaecke?: number;
  reaktivierungen?: Array<{ am: string; grund: string }>;
}

export function renderHauptberichtHtml(d: BerichtDaten): string {
  const isManuell = d.einsatzTyp === "manuell";
  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Einsatzbericht ${escape(d.einsatzId)}</title>
  <style>
    @page { size: A4 portrait; margin: 16mm; }
    body {
      font-family: "Helvetica", "Arial", sans-serif;
      font-size: 11pt;
      color: #0a0a0e;
      margin: 0;
    }
    h1 { font-size: 18pt; margin: 0 0 4pt; }
    h2 {
      font-size: 11pt;
      margin: 14pt 0 6pt;
      padding-bottom: 2pt;
      border-bottom: 1.5pt solid #0a0a0e;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .meta {
      font-family: "Courier New", monospace;
      font-size: 9pt;
      color: #555;
      letter-spacing: 0.04em;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12pt;
      border-bottom: 1.5pt solid #0a0a0e;
      padding-bottom: 6pt;
      margin-bottom: 10pt;
    }
    .brand .logo {
      width: 28pt; height: 28pt;
      background: #dc2626; color: #fff;
      display: grid; place-items: center;
      border-radius: 5pt;
      font-weight: bold;
      font-size: 14pt;
    }
    .brand .title { flex: 1; }
    table.k {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4pt;
    }
    table.k th, table.k td {
      border: 0.5pt solid #888;
      padding: 4pt 6pt;
      text-align: left;
      vertical-align: top;
    }
    table.k th {
      width: 35%;
      font-weight: 600;
      background: #f4f4f6;
      font-size: 9pt;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .footer {
      position: fixed;
      bottom: 8mm;
      left: 16mm;
      right: 16mm;
      font-family: "Courier New", monospace;
      font-size: 8pt;
      color: #888;
      display: flex;
      justify-content: space-between;
    }
    .note {
      margin-top: 6pt;
      padding: 6pt;
      border-left: 3pt solid #dc2626;
      background: #fef2f2;
      font-size: 9pt;
    }
    .audit {
      margin-top: 6pt;
      padding: 6pt;
      border-left: 3pt solid #f59e0b;
      background: #fef3c7;
      font-size: 9pt;
    }
    .grosses-feld {
      min-height: 80pt;
      border: 0.5pt solid #888;
      padding: 6pt;
      font-size: 10pt;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <header class="brand">
    <div class="logo">H</div>
    <div class="title">
      <h1>Einsatzbericht</h1>
      <div class="meta">
        FF Eberstalzell · ${escape(d.einsatzId)} · ${isManuell ? "MANUELL angelegt" : "BlaulichtSMS-Alarm"}
      </div>
    </div>
  </header>

  <section>
    <h2>Kopf</h2>
    <table class="k">
      <tr><th>Einsatzort</th><td>${escape(d.einsatzort)}</td></tr>
      <tr><th>Alarmierung</th><td>${formatDateTime(d.alarmierungZeit)}</td></tr>
      ${d.alarmierungAuthor ? `<tr><th>Alarmiert durch</th><td>${escape(d.alarmierungAuthor)}</td></tr>` : ""}
      <tr><th>Einsatzart</th><td>${escape(d.einsatzart ?? d.einsatzartFreitext ?? "—")}</td></tr>
      <tr><th>Status</th><td>${escape(d.status)}${d.einsatzende ? ` · Ende ${formatDateTime(d.einsatzende)}` : ""}</td></tr>
      ${d.oelbindemittelSaecke ? `<tr><th>Ölbindemittel</th><td><strong>${d.oelbindemittelSaecke} Säcke · VERRECHENBAR</strong></td></tr>` : ""}
    </table>
  </section>

  <section>
    <h2>Meldung von der Einsatzleitung</h2>
    <div class="grosses-feld">${escape(d.meldungEinsatzleitung ?? "")}</div>
  </section>

  ${
    d.reaktivierungen && d.reaktivierungen.length > 0
      ? `<section>
           <h2>Reaktivierungs-Audit-Trail</h2>
           <div class="audit">
             ${d.reaktivierungen.map((r) => `<div><strong>${formatDateTime(r.am)}</strong> — ${escape(r.grund)}</div>`).join("")}
           </div>
         </section>`
      : ""
  }

  <div class="note">
    <strong>Hinweis:</strong> Fahrzeugberichte sind separat angehängt.
    Mannschaftszahlen werden im finalen Bericht aus den Fahrzeugberichten aggregiert.
  </div>

  <div class="footer">
    <span>HotDoc · FF Eberstalzell</span>
    <span>Generiert ${formatDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}

export function renderSpickzettelHtml(d: BerichtDaten): string {
  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>syBOS-Spickzettel ${escape(d.einsatzId)}</title>
  <style>
    body { font-family: "Courier New", monospace; font-size: 11pt; padding: 12mm; }
    h1 { font-family: "Helvetica", sans-serif; font-size: 16pt; }
    ol { padding-left: 18pt; }
    li { margin: 6pt 0; line-height: 1.5; }
    .val { display: inline-block; background: #fef3c7; padding: 1pt 6pt; border: 0.5pt solid #f59e0b; }
    @page { size: A4 portrait; margin: 12mm; }
  </style>
</head>
<body>
  <h1>syBOS-Spickzettel</h1>
  <p>Bearbeite den Einsatz in syBOS in dieser Reihenfolge:</p>
  <ol>
    <li>Einsatzort: <span class="val">${escape(d.einsatzort)}</span></li>
    <li>Datum / Uhrzeit: <span class="val">${formatDateTime(d.alarmierungZeit)}</span></li>
    <li>Einsatzart: <span class="val">${escape(d.einsatzart ?? d.einsatzartFreitext ?? "—")}</span></li>
    ${d.alarmierungAuthor ? `<li>Alarmierungsquelle: <span class="val">${escape(d.alarmierungAuthor)}</span></li>` : ""}
    ${d.oelbindemittelSaecke ? `<li>Ölbindemittel: <span class="val">${d.oelbindemittelSaecke} Säcke (VERRECHENBAR)</span></li>` : ""}
    <li>Bericht-PDF als Anhang an den syBOS-Eintrag hängen.</li>
  </ol>
  <p style="margin-top:18pt;font-size:9pt;color:#888;">Generiert von HotDoc · ${formatDateTime(new Date().toISOString())}</p>
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

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}
