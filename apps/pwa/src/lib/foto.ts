/**
 * Foto-Funktion (2026-06-03): Einsatz-Fotos am Fahrzeug-Tablet.
 *
 * Flow:
 *   1. Aufnahme via <input type="file" accept="image/*" capture="environment">
 *      → öffnet auf Tablet/Handy direkt die Rückkamera (kein Capacitor-Plugin
 *      nötig, funktioniert in PWA + Capacitor-WebView).
 *   2. compressImage() skaliert auf ~1600px lange Kante + JPEG-Qualität → das
 *      5–12-MB-Rohbild wird auf ~0,3–0,8 MB komprimiert. Gut genug für den
 *      9×12-cm-Druck (~200 dpi), klein genug für Offline-Pufferung + Funkloch-
 *      Upload.
 *   3. captureFoto() speichert das Foto als lokales `foto:`-Doc in PouchDB
 *      (sofortige Offline-Anzeige) UND legt den Upload-Request in die generische
 *      Request-Outbox (Prio 1, idempotent über fotoId) — der 30-s-Worker reicht
 *      es nach, sobald Netz da ist. Konsistent mit der Offline-Härtung.
 *
 * Das Foto wird über `fotoId` an einen Chronik-Eintrag gebunden (siehe
 * ChronikEintragSchema.fotoId). Der Eintrag selbst trägt KEINE Bilddaten —
 * nur die Referenz — damit der 8-s-Chronik-Cross-Sync schlank bleibt.
 */

import { db } from "../db/pouch";
import { enqueueRequest } from "./request-outbox";

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.72;
/** Wenn die erste Komprimierung > ~1,4 MB liefert, nochmal mit weniger Qualität. */
const RETRY_QUALITY = 0.55;
const SIZE_CAP_CHARS = 1_400_000;

interface FotoDocLocal {
  _id: string;
  _rev?: string;
  type: "foto";
  einsatzId: string;
  fahrzeugId: string;
  dataUrl: string;
  beschreibung?: string;
  aufgenommenAm: string;
  aufgenommenVon?: string;
  erstelltAm: string;
  geaendertAm: string;
}

/**
 * Skaliert + komprimiert ein Kamera-Bild zu einer JPEG-Data-URL.
 * Nutzt createImageBitmap (mit EXIF-Orientation-Korrektur) und fällt bei
 * älteren WebViews auf ein <img>-Element zurück.
 */
export async function compressImage(file: File): Promise<string> {
  const { width, height, draw } = await loadDrawable(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas-Kontext nicht verfügbar");
  // Weißer Hintergrund, falls das Quellbild Transparenz hat (PNG → JPEG).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  draw(ctx, w, h);
  let dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (dataUrl.length > SIZE_CAP_CHARS) {
    dataUrl = canvas.toDataURL("image/jpeg", RETRY_QUALITY);
  }
  return dataUrl;
}

interface Drawable {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

async function loadDrawable(file: File): Promise<Drawable> {
  // Bevorzugt createImageBitmap mit Orientation-Korrektur (modern, schnell).
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => {
          ctx.drawImage(bitmap, 0, 0, w, h);
          bitmap.close();
        },
      };
    } catch {
      // Fallback unten
    }
  }
  // Fallback: <img> via Object-URL (ältere WebViews).
  return await new Promise<Drawable>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (ctx, w, h) => {
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
        },
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht geladen werden"));
    };
    img.src = url;
  });
}

/** Generiert eine stabile Foto-Doc-ID. */
function buildFotoId(einsatzId: string, fahrzeugId: string): string {
  const suffix = einsatzId.replace(/^einsatz:/, "");
  const rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `foto:${suffix}:${fahrzeugId}:${rand}`;
}

export interface CaptureResult {
  fotoId: string;
  dataUrl: string;
  aufgenommenAm: string;
}

/**
 * Nimmt ein Foto-File entgegen, komprimiert es, speichert es lokal (PouchDB)
 * und legt den Backend-Upload in die Offline-Outbox. Liefert fotoId + dataUrl
 * für die sofortige lokale Anzeige + den Chronik-Eintrag.
 */
export async function captureFoto(args: {
  einsatzId: string;
  fahrzeugId: string;
  funkrufname?: string;
  file: File;
  beschreibung?: string;
}): Promise<CaptureResult> {
  const dataUrl = await compressImage(args.file);
  const fotoId = buildFotoId(args.einsatzId, args.fahrzeugId);
  const now = new Date().toISOString();

  const doc: FotoDocLocal = {
    _id: fotoId,
    type: "foto",
    einsatzId: args.einsatzId,
    fahrzeugId: args.fahrzeugId,
    dataUrl,
    ...(args.beschreibung ? { beschreibung: args.beschreibung } : {}),
    aufgenommenAm: now,
    ...(args.funkrufname ? { aufgenommenVon: args.funkrufname } : {}),
    erstelltAm: now,
    geaendertAm: now,
  };

  // 1) Lokal in PouchDB (für sofortige + offline Anzeige). Best-effort.
  try {
    await db.put(doc);
  } catch (err) {
    if ((err as { status?: number }).status !== 409) {
      // Quota o. Ä. → trotzdem versuchen hochzuladen; Anzeige nutzt das
      // dataUrl aus dem CaptureResult (in-memory) bis zum nächsten Render.
      console.warn("[foto] lokales Speichern fehlgeschlagen:", err);
    }
  }

  // 2) Upload-Request in die Offline-Outbox (Prio 1, idempotent über fotoId).
  await enqueueRequest(
    1,
    `foto:${fotoId}`,
    "PUT",
    `/api/einsaetze/${encodeURIComponent(args.einsatzId)}/fotos`,
    {
      fotoId,
      fahrzeugId: args.fahrzeugId,
      dataUrl,
      ...(args.beschreibung ? { beschreibung: args.beschreibung } : {}),
      aufgenommenAm: now,
      ...(args.funkrufname ? { aufgenommenVon: args.funkrufname } : {}),
    },
  ).catch((err) => {
    console.warn("[foto] Outbox-Enqueue fehlgeschlagen:", err);
  });

  return { fotoId, dataUrl, aufgenommenAm: now };
}

/**
 * Lädt die dataUrl eines lokal gespeicherten Fotos (für die Chronik-Anzeige
 * am aufnehmenden Tablet). Liefert null wenn das Foto nicht lokal liegt (z. B.
 * von einem anderen Tablet aufgenommen) — dann zeigt die Timeline nur das
 * 📷-Symbol; im PDF ist das Foto trotzdem enthalten (Backend hat es).
 */
export async function getLocalFotoDataUrl(fotoId: string): Promise<string | null> {
  try {
    const doc = (await db.get(fotoId)) as FotoDocLocal;
    return doc.dataUrl ?? null;
  } catch {
    return null;
  }
}
