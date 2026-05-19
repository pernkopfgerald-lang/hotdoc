/**
 * MediaRecorder-Wrapper: Press-and-Hold-Aufnahme mit Permission-Flow.
 *
 * Liefert beim Stop ein Blob (typ. webm/opus) — das landet später als
 * Attachment am Bericht-Doc in PouchDB. In Phase 5 wird das durch
 * whisper.cpp WASM lokal transkribiert; bis dahin nur Speicherung.
 */

export type MicStatus =
  | "idle"
  | "requesting"  // Permission-Prompt sichtbar
  | "ready"       // Stream vorhanden, kann starten
  | "recording"
  | "denied"
  | "unavail"
  | "error";

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startTs = 0;

  status: MicStatus = "idle";
  errorMessage: string | null = null;

  /** Holt einmalig die Permission. Idempotent. */
  async prepare(): Promise<MicStatus> {
    if (this.stream) {
      this.status = "ready";
      return this.status;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.status = "unavail";
      this.errorMessage = "Browser hat kein Mikrofon-API";
      return this.status;
    }
    try {
      this.status = "requesting";
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.status = "ready";
      return this.status;
    } catch (err) {
      const name = (err as DOMException).name;
      this.status = name === "NotAllowedError" ? "denied" : "error";
      this.errorMessage = err instanceof Error ? err.message : String(err);
      return this.status;
    }
  }

  /** Beginnt Aufnahme. Liefert false wenn Stream noch nicht da. */
  start(): boolean {
    if (!this.stream || this.status === "recording") return false;
    this.chunks = [];
    const mime = pickMimeType();
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.chunks.push(ev.data);
    };
    this.recorder.start();
    this.startTs = Date.now();
    this.status = "recording";
    return true;
  }

  /** Stoppt Aufnahme und resolvet mit dem fertigen Blob. */
  stop(): Promise<RecordingResult | null> {
    return new Promise((resolve) => {
      if (!this.recorder || this.status !== "recording") {
        resolve(null);
        return;
      }
      const recorder = this.recorder;
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        const durationMs = Date.now() - this.startTs;
        this.status = "ready";
        resolve({ blob, mimeType: recorder.mimeType, durationMs });
      };
      recorder.stop();
    });
  }

  /** Stream freigeben (App-Lifecycle, z. B. beim Tab-Wechsel). */
  release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.status = "idle";
  }
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return ""; // Browser-Default
}

export function statusLabel(s: MicStatus): string {
  switch (s) {
    case "idle":       return "bereit";
    case "requesting": return "Mikrofon-Zugriff …";
    case "ready":      return "bereit";
    case "recording":  return "aufnehmend";
    case "denied":     return "Mikrofon verweigert";
    case "unavail":    return "kein Mikrofon";
    case "error":      return "Fehler";
  }
}
