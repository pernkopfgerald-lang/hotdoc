/**
 * PDF-Generator via puppeteer.
 *
 * Lazy-Init: Browser-Launch erst beim ersten Aufruf, dann wiederverwenden.
 * In production läuft puppeteer headless mit dem mitgelieferten Chromium.
 */

import type { Browser } from "puppeteer";
import { logger } from "../../lib/logger.js";

let browserPromise: Promise<Browser> | null = null;

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
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function shutdownPdfGenerator(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
