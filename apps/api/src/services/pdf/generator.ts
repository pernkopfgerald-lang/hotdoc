/**
 * PDF-Generator via puppeteer.
 *
 * Lazy-Init: Browser-Launch erst beim ersten Aufruf, dann wiederverwenden.
 * In production läuft puppeteer headless mit dem mitgelieferten Chromium.
 *
 * Leerlauf: Chromium belegt auf der 1-GB-Maschine dauerhaft Speicher, obwohl
 * PDFs selten gebraucht werden (Abschluss, Archiv). Nach BROWSER_IDLE_MS ohne
 * Render wird der Browser geschlossen und beim naechsten Render neu gestartet.
 */

import type { Browser } from "puppeteer";
import { logger } from "../../lib/logger.js";

let browserPromise: Promise<Browser> | null = null;

/** Nach so langer Zeit ohne Render wird Chromium beendet (Speicher freigeben). */
const BROWSER_IDLE_MS = 5 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

/**
 * Plant das Schliessen des Browsers. Wird nach jedem beendeten Render
 * (re-)gestartet. NIE waehrend eines Renders: laufende/wartende Renders
 * (pendingRenders) verhindern das Schliessen, und das Referenz-Nullen von
 * browserPromise passiert im selben Tick wie die Pruefung — ein neuer Render
 * startet danach lazy einen frischen Browser.
 */
function armIdleTimer(): void {
  clearIdleTimer();
  if (!browserPromise) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (pendingRenders > 0 || !browserPromise) return;
    const closing = browserPromise;
    browserPromise = null;
    void closing
      .then((b) => b.close())
      .then(() => logger.info("Puppeteer-Browser nach Leerlauf geschlossen"))
      .catch((err) => {
        logger.warn({ err }, "Puppeteer-Browser: Schliessen nach Leerlauf fehlgeschlagen");
      });
  }, BROWSER_IDLE_MS);
  // Der Timer darf den Prozess nicht am Leben halten.
  if (typeof (idleTimer as { unref?: () => void }).unref === "function") {
    (idleTimer as { unref: () => void }).unref();
  }
}

/**
 * Max-Render-Timeout pro PDF (setContent + page.pdf).
 * In Praxis braucht eine A4-Seite ~1-3s; 30s ist sehr permissiv und
 * faengt nur eingefrorene Chromium-Tabs (z.B. nach OOM oder networkidle0-
 * Hang wegen ladener Asset-URL).
 */
const RENDER_TIMEOUT_MS = 60_000;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;
  // eigene Referenz, damit der disconnected-Handler eines ALTEN Browsers (z. B.
  // nach dem Leerlauf-Schliessen) einen inzwischen neu gestarteten nicht
  // wegnullt.
  let diese: Promise<Browser> | null = null;
  diese = browserPromise = (async () => {
    try {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      logger.info("Puppeteer-Browser gestartet");
      // Disconnect-Recovery: wenn die Browser-Instanz crasht oder vom OS
      // gekillt wird (OOM, signal), setzen wir browserPromise auf null,
      // damit der naechste renderPdf-Aufruf einen neuen Browser launcht.
      // Sonst wuerden alle folgenden Calls auf einer toten Browser-
      // Referenz scheitern.
      browser.on("disconnected", () => {
        logger.warn("Puppeteer-Browser disconnected — wird beim naechsten Render neu gestartet");
        if (browserPromise === diese) browserPromise = null;
      });
      return browser;
    } catch (err) {
      if (browserPromise === diese) browserPromise = null;
      throw err;
    }
  })();
  return browserPromise;
}

/**
 * AUDIT-16 (2): Render-Serialisierung ohne neue Dependency — maximal EIN
 * Chromium-Tab gleichzeitig. Florian + Schriftfuehrer + Archiv parallel
 * waren der dokumentierte OOM-Ausloeser auf der kleinen fly.io-Instanz.
 * Der RENDER_TIMEOUT_MS garantiert, dass die Kette nie haengen bleibt.
 */
let renderChain: Promise<void> = Promise.resolve();

/**
 * A-10 (Audit 2026-07): Staulimit fuer die serialisierte Render-Kette.
 * Da immer nur EIN Tab rendert, wuerde jeder weitere Request minutenlang
 * in der Kette warten (Client-Timeouts, Retry-Sturm). Bei mehr als
 * MAX_PENDING_RENDERS gleichzeitig laufenden/wartenden Renders lehnt
 * renderPdf sofort mit "pdf_busy" ab — routes/pdf.ts mappt das auf 503.
 */
const MAX_PENDING_RENDERS = 3;
let pendingRenders = 0;

/**
 * Der Hauptbericht (Seite 1, Markierung `data-fit-page`) soll auf EINE
 * A4-Seite passen. Reihenfolge, wenn er zu hoch ist:
 *   1. Leerraum der Freitext-Box (min-height) freigeben,
 *   2. Seite stufenlos verkleinern (CSS zoom) — aber nicht unter MIN_FIT_ZOOM,
 *      sonst wird die Schrift zu klein. Bei sehr vielen Chronik-Eintraegen
 *      bleibt es bei natuerlicher Groesse und laeuft auf eine 2. Seite.
 * Gemessen wird mit Druck-Layout (Seitenbreite 178 mm = A4 minus 2x16 mm).
 */
const PAGE_CONTENT_WIDTH_PX = Math.round((178 / 25.4) * 96);
const PAGE_CONTENT_HEIGHT_MM = 265;
const MIN_FIT_ZOOM = 0.8;

async function fitFirstPage(page: import("puppeteer").Page): Promise<void> {
  await page.emulateMediaType("print");
  await page.setViewport({ width: PAGE_CONTENT_WIDTH_PX, height: 1200 });
  // Als String statt Funktion: der API-Build hat keine DOM-Typen (lib "dom").
  await page.evaluate(`(() => {
    const el = document.querySelector("[data-fit-page]");
    if (!el) return;
    const availPx = ((${PAGE_CONTENT_HEIGHT_MM} / 25.4) * 96) * 0.985;
    const minZoom = ${MIN_FIT_ZOOM};
    const height = () => el.getBoundingClientRect().height;
    if (height() <= availPx) return;
    el.querySelectorAll(".freitext").forEach((n) => { n.style.minHeight = "0"; });
    if (height() <= availPx) return;
    let zoom = 1;
    for (let i = 0; i < 8; i += 1) {
      zoom = Math.max(minZoom, (zoom * availPx) / height() * 0.995);
      el.style.setProperty("zoom", String(zoom));
      if (height() <= availPx || zoom <= minZoom) break;
    }
    if (height() > availPx) el.style.removeProperty("zoom");
  })()`);
}

/** Rendert HTML → A4-PDF (Bytes). */
export async function renderPdf(html: string): Promise<Buffer> {
  if (pendingRenders > MAX_PENDING_RENDERS) {
    throw new Error("pdf_busy");
  }
  const run = async (): Promise<Buffer> => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    // Externe Requests abbrechen — der Bericht ist self-contained (Base64-Logo
    // + Base64-Fotos, Inline-CSS, System-Fonts). Das verhindert den dokumentierten
    // Hang beim Warten auf eine nicht erreichbare Asset-URL (ein Foto-Bericht hing
    // sonst bis zum Render-Timeout → HTTP 500). data:/blob:/about: bleiben erlaubt.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")) {
        void req.continue();
      } else {
        void req.abort();
      }
    });
    const renderPromise = (async (): Promise<Buffer> => {
      // "load" statt "networkidle0": wir warten auf das Laden der (eingebetteten)
      // Ressourcen, nicht auf 500 ms Netz-Ruhe — Letzteres ist unnoetig fragil.
      await page.setContent(html, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
      try {
        await fitFirstPage(page);
      } catch (err) {
        // Anpassung ist Komfort — nie das PDF dafuer verlieren.
        logger.warn({ err }, "PDF-Render: Seite-1-Anpassung fehlgeschlagen");
      }
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
      });
      return Buffer.from(pdf);
    })();
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`pdf_render_timeout (${RENDER_TIMEOUT_MS}ms)`));
      }, RENDER_TIMEOUT_MS);
      // Wenn der renderPromise zuerst settle, raeumen wir den Timer auf.
      renderPromise.finally(() => clearTimeout(timer)).catch(() => {});
    });
    try {
      return await Promise.race([renderPromise, timeoutPromise]);
    } finally {
      // Page immer schliessen — auch bei Timeout. AUDIT-16 (1): ein
      // page.close()-Fehler darf das fertige PDF NIE zum 500 machen —
      // immer nur warnen. Der disconnected-Handler (getBrowser) setzt
      // browserPromise ohnehin zurueck, wenn der ganze Browser haengt.
      try {
        await page.close();
      } catch (err) {
        logger.warn({ err }, "PDF-Render: page.close fehlgeschlagen");
      }
    }
  };
  // An die Kette haengen: laeuft erst, wenn der vorherige Render fertig ist
  // (Erfolg ODER Fehler — then(run, run) startet in beiden Faellen).
  // A-10: pendingRenders zaehlt laufende + wartende Renders; das finally
  // dekrementiert exakt einmal, egal ob der Render erfolgreich war.
  pendingRenders += 1;
  clearIdleTimer();
  const result = renderChain.then(run, run).finally(() => {
    pendingRenders -= 1;
    // Letzter Render durch -> Leerlauf-Uhr starten (nicht, solange noch einer wartet).
    if (pendingRenders === 0) armIdleTimer();
  });
  renderChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function shutdownPdfGenerator(): Promise<void> {
  clearIdleTimer();
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close();
  }
}
