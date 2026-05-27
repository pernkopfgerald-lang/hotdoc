/**
 * Web-Speech-API-Wrapper für Live-Transkription im Browser.
 *
 * Verfügbarkeit (Stand 2026):
 *   ✓ Chrome (Android, Desktop)
 *   ✓ Edge (Android, Desktop)
 *   ✗ iOS-Safari (Standalone-PWA + Browser)  ← Fallback auf MediaRecorder
 *   ✗ Firefox (alle Plattformen)              ← Fallback auf MediaRecorder
 *
 * Wir kapseln die Eigenheiten:
 *  - `webkitSpeechRecognition` ist der einzige Constructor, der heute überall
 *    funktioniert wo es geht (auch in Chrome) — der spec-konforme
 *    `SpeechRecognition` existiert in keinem Browser final.
 *  - SpeechRecognition kann nach 50–60 s Stille automatisch enden — wir
 *    rebooten dann nicht, weil ein typisches Funk-Diktat < 30 s ist.
 *  - Die `lang`-Property muss VOR start() gesetzt sein.
 *
 * Sicherheits-Hinweis: SpeechRecognition läuft in Chrome NICHT 100% lokal —
 * Google leitet den Audio-Stream zu eigenen Servern weiter. Für strenge
 * DSGVO-Setups muss V1.1 Whisper-WASM lokal nachziehen.
 */

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  item: (index: number) => SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
  onstart: ((ev: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface WindowWithSpeech {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

export type SpeechStatus =
  | "idle"
  | "ready"
  | "recording"
  | "denied"
  | "unavail"
  | "error";

export interface SpeechResult {
  /** Finale Transkription (alle is-Final-Segmente konkateniert). */
  text: string;
  /** Aufnahme-Dauer in ms (von start bis end). */
  durationMs: number;
  /** Genauigkeit-Score 0..1 — Mittelwert über alle Segmente. */
  confidence: number;
}

/**
 * Prüft Browser-Support OHNE eine Instanz zu allokieren.
 * Wird beim Component-Mount aufgerufen, um zu entscheiden ob Web-Speech
 * oder MediaRecorder-Fallback der primäre Pfad ist.
 */
export function isWebSpeechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as WindowWithSpeech;
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as WindowWithSpeech;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Live-Speech-Recognition über die Web-Speech-API.
 * API-kompatibel mit MicRecorder (gleiche Status-Werte, gleicher Lebenszyklus),
 * damit DictateButton mit minimalen Branch-Statements arbeiten kann.
 */
export class WebSpeechRecognizer {
  private rec: SpeechRecognitionInstance | null = null;
  private finalText = "";
  private confidenceSum = 0;
  private confidenceCount = 0;
  private startTs = 0;
  private endResolver: ((r: SpeechResult | null) => void) | null = null;

  status: SpeechStatus = "idle";
  errorMessage: string | null = null;

  /**
   * Permission-Setup. Web-Speech fragt selbst nach Mikrofon-Zugriff beim
   * ersten start(), aber wir geben hier sofort "ready" zurück damit der
   * UI-Flow analog zu MicRecorder.prepare() ist.
   */
  async prepare(): Promise<SpeechStatus> {
    if (!isWebSpeechAvailable()) {
      this.status = "unavail";
      this.errorMessage = "Browser hat keine Sprach-Erkennung (Web-Speech-API).";
      return this.status;
    }
    this.status = "ready";
    return this.status;
  }

  /** Beginnt die Erkennung. Liefert false wenn nicht möglich. */
  start(lang: string = "de-DE"): boolean {
    const Ctor = getCtor();
    if (!Ctor) {
      this.status = "unavail";
      return false;
    }
    if (this.status === "recording") return false;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    this.finalText = "";
    this.confidenceSum = 0;
    this.confidenceCount = 0;
    this.errorMessage = null;

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (!result?.isFinal) continue;
        const alt = result[0];
        if (!alt) continue;
        // Whitespace-Trennung: aufeinanderfolgende Segmente sollen lesbar bleiben.
        if (this.finalText && !this.finalText.endsWith(" ")) this.finalText += " ";
        this.finalText += alt.transcript;
        if (typeof alt.confidence === "number" && Number.isFinite(alt.confidence)) {
          this.confidenceSum += alt.confidence;
          this.confidenceCount += 1;
        }
      }
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      const code = ev.error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        this.status = "denied";
        this.errorMessage = "Mikrofon-Zugriff verweigert.";
      } else if (code === "no-speech") {
        // Kein Sprach-Input — Status bleibt recording, end() folgt sowieso.
        this.errorMessage = "Keine Sprache erkannt.";
      } else if (code === "audio-capture") {
        this.status = "error";
        this.errorMessage = "Kein Mikrofon verfügbar.";
      } else if (code === "network") {
        this.status = "error";
        this.errorMessage = "Sprach-Erkennung braucht Internet (Chrome).";
      } else {
        this.status = "error";
        this.errorMessage = `Sprach-Erkennung: ${code}`;
      }
    };

    rec.onend = () => {
      const text = this.finalText.trim();
      const durationMs = Date.now() - this.startTs;
      const confidence =
        this.confidenceCount > 0 ? this.confidenceSum / this.confidenceCount : 0;
      if (this.status === "recording") this.status = "ready";
      const resolver = this.endResolver;
      this.endResolver = null;
      this.rec = null;
      resolver?.({ text, durationMs, confidence });
    };

    try {
      rec.start();
    } catch (err) {
      this.status = "error";
      this.errorMessage = err instanceof Error ? err.message : String(err);
      return false;
    }
    this.rec = rec;
    this.startTs = Date.now();
    this.status = "recording";
    return true;
  }

  /**
   * Beendet die Erkennung und resolvet mit dem fertigen Text. Wenn nichts
   * läuft, sofort null.
   */
  stop(): Promise<SpeechResult | null> {
    return new Promise((resolve) => {
      if (!this.rec || this.status !== "recording") {
        resolve(null);
        return;
      }
      this.endResolver = resolve;
      try {
        this.rec.stop();
      } catch {
        // Aborted state — onend kommt trotzdem.
      }
    });
  }

  /** Stream freigeben (App-Lifecycle, Unmount). */
  release(): void {
    try {
      this.rec?.abort();
    } catch {
      // egal
    }
    this.rec = null;
    this.endResolver = null;
    this.status = "idle";
  }
}
