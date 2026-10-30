import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PDF-Generator: Chromium wird nach 5 min Leerlauf geschlossen — nie waehrend
 * eines Renders — und bei Bedarf lazy neu gestartet. puppeteer ist gemockt.
 */

interface FakeBrowser {
  on: ReturnType<typeof vi.fn>;
  newPage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  handlers: Record<string, () => void>;
}

const browsers: FakeBrowser[] = [];
/** Wenn gesetzt, blockiert page.pdf() bis aufgeloest. */
let pdfGate: Promise<void> | null = null;

function makePage() {
  return {
    setRequestInterception: vi.fn(async () => undefined),
    on: vi.fn(),
    setContent: vi.fn(async () => undefined),
    emulateMediaType: vi.fn(async () => undefined),
    setViewport: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => undefined),
    pdf: vi.fn(async () => {
      if (pdfGate) await pdfGate;
      return new Uint8Array([37, 80, 68, 70]);
    }),
    close: vi.fn(async () => undefined),
  };
}

const launch = vi.fn(async () => {
  const handlers: Record<string, () => void> = {};
  const b: FakeBrowser = {
    handlers,
    on: vi.fn((ev: string, cb: () => void) => {
      handlers[ev] = cb;
    }),
    newPage: vi.fn(async () => makePage()),
    close: vi.fn(async () => undefined),
  };
  browsers.push(b);
  return b;
});

vi.mock("puppeteer", () => ({ default: { launch: (...a: unknown[]) => (launch as (...x: unknown[]) => unknown)(...a) } }));

const MIN = 60 * 1000;

async function lade() {
  vi.resetModules();
  return import("./generator.js");
}

beforeEach(() => {
  vi.useFakeTimers();
  browsers.length = 0;
  launch.mockClear();
  pdfGate = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PDF-Generator: Leerlauf", () => {
  it("schliesst den Browser nach 5 min Leerlauf und startet bei Bedarf einen neuen", async () => {
    const { renderPdf } = await lade();
    await renderPdf("<html></html>");
    expect(launch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4 * MIN + 59_000);
    expect(browsers[0]!.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(browsers[0]!.close).toHaveBeenCalledTimes(1);

    // naechster Render -> frischer Browser
    await renderPdf("<html></html>");
    expect(launch).toHaveBeenCalledTimes(2);
    expect(browsers[1]!.close).not.toHaveBeenCalled();
  });

  it("jeder Render setzt die Leerlauf-Uhr zurueck", async () => {
    const { renderPdf } = await lade();
    await renderPdf("a");
    await vi.advanceTimersByTimeAsync(4 * MIN);
    await renderPdf("b"); // Uhr neu
    await vi.advanceTimersByTimeAsync(4 * MIN);
    expect(browsers[0]!.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1 * MIN + 1000);
    expect(browsers[0]!.close).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("schliesst NIE waehrend eines laufenden Renders", async () => {
    const { renderPdf } = await lade();
    await renderPdf("a"); // Browser da, Uhr laeuft
    // Zweiter Render haengt in pdf() (gate), laeuft ueber den 5-min-Punkt hinaus
    let freigeben: () => void = () => undefined;
    pdfGate = new Promise<void>((r) => (freigeben = r));
    await vi.advanceTimersByTimeAsync(4 * MIN + 50_000);
    const p = renderPdf("b"); // clearIdleTimer beim Start
    await vi.advanceTimersByTimeAsync(30_000); // jetzt 5 min 20 s seit Render a
    expect(browsers[0]!.close).not.toHaveBeenCalled();
    freigeben();
    await p;
    // erst 5 min NACH Ende des zweiten Renders
    await vi.advanceTimersByTimeAsync(4 * MIN);
    expect(browsers[0]!.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1 * MIN + 1000);
    expect(browsers[0]!.close).toHaveBeenCalledTimes(1);
  });

  it("das disconnected-Event des alten Browsers nullt einen neuen Browser nicht", async () => {
    const { renderPdf } = await lade();
    await renderPdf("a");
    await vi.advanceTimersByTimeAsync(5 * MIN + 1000); // schliesst Browser 0
    await renderPdf("b"); // Browser 1
    expect(launch).toHaveBeenCalledTimes(2);
    // Browser 0 meldet (verspaetet) disconnected
    browsers[0]!.handlers.disconnected?.();
    await renderPdf("c"); // darf KEINEN dritten Browser starten
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("shutdownPdfGenerator schliesst den Browser und stoppt die Uhr", async () => {
    const { renderPdf, shutdownPdfGenerator } = await lade();
    await renderPdf("a");
    await shutdownPdfGenerator();
    expect(browsers[0]!.close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6 * MIN);
    expect(browsers[0]!.close).toHaveBeenCalledTimes(1);
  });
});
