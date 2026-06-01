/**
 * PDF-Generator via puppeteer.
 *
 * Lazy-Init: Browser-Launch erst beim ersten Aufruf, dann wiederverwenden.
 * In production läuft puppeteer headless mit dem mitgelieferten Chromium.
 */

import type { Browser } from "puppeteer";
import { logger } from "../../lib/logger.js";

let browserPromise: Promise<Browser> | null = null;

/**
 * Max-Render-Timeout pro PDF (setContent + page.pdf).
 * In Praxis braucht eine A4-Seite ~1-3s; 30s ist sehr permissiv und
 * faengt nur eingefrorene Chromium-Tabs (z.B. nach OOM oder networkidle0-
 * Hang wegen ladener Asset-URL).
 */
const RENDER_TIMEOUT_MS = 30_000;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
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
        browserPromise = null;
      });
      return browser;
    } catch (err) {
      browserPromise = null;
      throw err;
    }
  })();
  return browserPromise;
}

/** Rendert HTML → A4-PDF (Bytes). */
export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  let timedOut = false;
  const renderPromise = (async (): Promise<Buffer> => {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
    });
    return Buffer.from(pdf);
  })();
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`pdf_render_timeout (${RENDER_TIMEOUT_MS}ms)`));
    }, RENDER_TIMEOUT_MS);
    // Wenn der renderPromise zuerst settle, raeumen wir den Timer auf.
    renderPromise.finally(() => clearTimeout(timer)).catch(() => {});
  });
  try {
    return await Promise.race([renderPromise, timeoutPromise]);
  } finally {
    // Page immer schliessen — auch bei Timeout. Browser-Disconnect-Handler
    // greift wenn der ganze Browser haengt.
    try {
      await page.close();
    } catch (err) {
      if (timedOut) {
        logger.warn({ err }, "PDF-Render: page.close nach Timeout fehlgeschlagen");
      } else {
        throw err;
      }
    }
  }
}

export async function shutdownPdfGenerator(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
