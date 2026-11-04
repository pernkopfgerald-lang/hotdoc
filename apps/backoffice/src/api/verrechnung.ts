import type { VerrechnungEingaben, VerrechnungErgebnis } from "@hotdoc/shared";
import { apiCall } from "./client";

/** GET /api/einsaetze/:id/verrechnung — gespeicherte Eingaben + berechnetes Blatt. */
export interface VerrechnungResponse {
  ok: boolean;
  eingaben: VerrechnungEingaben;
  ergebnis: VerrechnungErgebnis | null;
}

const basis = (id: string) => `/api/einsaetze/${encodeURIComponent(id)}/verrechnung`;

export function getVerrechnung(id: string): Promise<VerrechnungResponse> {
  return apiCall<VerrechnungResponse>(basis(id));
}

/** Blatt fuer noch nicht gespeicherte Eingaben berechnen (Live-Vorschau). */
export function vorschauVerrechnung(
  id: string,
  eingaben: VerrechnungEingaben,
): Promise<{ ok: boolean; ergebnis: VerrechnungErgebnis | null }> {
  return apiCall(`${basis(id)}/vorschau`, { method: "POST", body: { eingaben } });
}

/** Eingaben speichern (nur Funktionaer). */
export function speichereVerrechnung(id: string, eingaben: VerrechnungEingaben): Promise<VerrechnungResponse> {
  return apiCall<VerrechnungResponse>(basis(id), { method: "PUT", body: { eingaben } });
}
