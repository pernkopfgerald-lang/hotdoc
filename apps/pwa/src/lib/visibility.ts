/**
 * Akku-Gate (Audit 2026-06-03, KISS&SEXY R-1).
 *
 * Problem: Die Fahrzeug-Tablets liefen mit ~7 Polling-Loops (3/5/8/10/15 s)
 * plus High-Accuracy-GPS dauerhaft weiter — auch wenn das Tablet im Standby
 * lag (Bildschirm aus, App im Hintergrund). Das war der grösste vermeidbare
 * Stromfresser, bis Android die JS-Engine selbst parkt.
 *
 * Lösung: `document.hidden` ist genau dann true, wenn die App nicht sichtbar
 * ist. Ein einzeiliger Guard `if (pollingPaused()) return;` am Anfang einer
 * Tick-Closure spart den kompletten Netz-Call. Wird die App wieder sichtbar,
 * feuert der nächste reguläre Interval-Tick (≤ Intervall-Periode) ohnehin —
 * und der App-Watchdog (App.tsx) re-bootet nach > 5 min Abwesenheit mit
 * frischen Daten. Es geht also nichts verloren.
 *
 * Bewusst NICHT gegated: niederfrequente UI-Uhren (30–60 s) und der
 * Outbox-Flush (der DARF auch im Hintergrund laufen, damit gepufferte
 * Berichte rausgehen sobald wieder Netz da ist).
 */
export function pollingPaused(): boolean {
  return typeof document !== "undefined" && document.hidden;
}
