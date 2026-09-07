/**
 * Zentrale App-Versions-Konstante.
 *
 * Wird im Footer der PWA angezeigt. Bei jedem produktiv-relevanten Release
 * manuell hochziehen. Das Label soll dem User auf einen Blick zeigen welcher
 * Feature-Stand auf seinem Tablet läuft (für Bug-Reports + Schulung).
 *
 * ACHTUNG: APP_BUILD blieb zwischen v0.1.13 und v0.1.26 unveraendert auf
 * "2026-06-03" stehen (13 Releases lang vergessen) — das sah im About-
 * Bildschirm aus wie ein veralteter Stand, obwohl die Version korrekt war.
 * Bei JEDEM Release BEIDE Zeilen aktualisieren, nicht nur APP_VERSION.
 */
export const APP_VERSION = "v0.1.32";
export const APP_BUILD = "2026-09-07";
