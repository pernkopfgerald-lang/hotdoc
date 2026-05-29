/**
 * QR-Sticker-Anker — Backoffice ⇄ API.
 *
 * Hintergrund: Pro Fahrzeug existiert ein persistenter JWT-Token (kind:
 * "qr-anchor"), den der Funktionär als QR-Sticker druckt und ans Tablet /
 * ins Auto-Cockpit klebt. Wer scannt → Multi-Device-Login als Fahrzeug-
 * Tablet ohne PIN. Bei Tablet-Verlust → Rotation hebt die Generation und
 * macht alle alten QR-Codes ungültig.
 */

import { apiCall } from "./client";

export interface QrAnchorResponse {
  ok: true;
  token: string;
  fahrzeugId: string;
  generation: number;
}

/** Liefert den aktuellen, gültigen QR-Token für `fahrzeugId`. */
export async function getQrAnchor(fahrzeugId: string): Promise<QrAnchorResponse> {
  return apiCall<QrAnchorResponse>(`/api/auth/qr-anchor/${encodeURIComponent(fahrzeugId)}`);
}

/** Erhöht die Generation → alle alten QR-Codes für `fahrzeugId` werden ungültig. */
export async function rotateQrAnchor(fahrzeugId: string): Promise<QrAnchorResponse> {
  return apiCall<QrAnchorResponse>(
    `/api/auth/qr-anchor/${encodeURIComponent(fahrzeugId)}/rotate`,
    { method: "POST" },
  );
}

/**
 * Baut die PWA-Deeplink-URL für einen QR-Token. Default = Produktiv-URL,
 * via `VITE_PWA_URL` überschreibbar (z. B. Dev oder Staging).
 */
export function buildQrClaimUrl(token: string): string {
  const base =
    (import.meta.env.VITE_PWA_URL as string | undefined) ??
    "https://hotdoc-eberstalzell.fly.dev";
  return `${base.replace(/\/+$/, "")}/qr/${token}`;
}
