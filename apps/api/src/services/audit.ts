/**
 * Audit-Event-Logging.
 *
 * Schreibt strukturierte Events nach CouchDB als `audit:<reverse-ts>:<random>`
 * Docs. Reverse-Timestamp damit die jüngsten Events am Index-Start liegen
 * (CouchDB sortiert _id-View ascending — wir wollen DESC ohne View).
 *
 * Wird in Phase 8 vom Backoffice-Tab "Aktivität" konsumiert: Liste der
 * letzten 50 Events mit Symbolen pro Type, Actor, Zeit. Datenschutz-konform:
 * keine PII außer Username + Fahrzeug + Einsatz-ID. Keine Tokens.
 *
 * Retention: nicht automatisch — die Audit-Trail-Spec sagt min. 1 Jahr.
 * Cleanup-Worker kann später hinzukommen.
 */

import { randomUUID } from "node:crypto";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";
import type { Rolle } from "@hotdoc/shared";

export type AuditEventType =
  | "handoff-create"
  | "handoff-claim"
  | "handoff-release"
  | "handoff-reverse-create"
  | "handoff-reverse-claim"
  | "login-success"
  | "login-failed"
  | "einsatz-abschluss"
  | "einsatz-reaktivierung"
  | "einsatz-zuweisung-geaendert"
  | "config-changed";

export interface AuditEvent {
  type: AuditEventType;
  /** Handoff-Code (falls Handoff-Event), Konfig-Key (falls config-changed), etc. */
  code?: string;
  /** Wer hat die Aktion ausgelöst — Username, nicht Token. */
  actorUsername?: string;
  actorRolle?: Rolle;
  fahrzeugId?: string;
  einsatzId?: string;
  /** Frei-Felder pro Event-Typ. */
  details?: Record<string, unknown>;
  userAgent?: string;
  autoReleaseAt?: string;
  ipAddress?: string;
}

interface AuditEventDoc extends AuditEvent {
  _id: string;
  type: AuditEventType;
  docType: "audit-event";
  timestamp: string;
}

/**
 * Liefert einen Reverse-Timestamp damit die jüngsten Docs am Index-Start
 * stehen. Wir nutzen MAX_SAFE_INTEGER - ms.now() — damit ist eine
 * 30-Zeichen Zahl die als String sortierbar bleibt.
 */
function reverseTimestamp(): string {
  const reverse = Number.MAX_SAFE_INTEGER - Date.now();
  return String(reverse).padStart(16, "0");
}

/**
 * Schreibt ein Audit-Event nach CouchDB. Schlägt der Insert fehl,
 * loggen wir das aber lassen den Call-Site nicht abbrechen — Audit-
 * Schreibfehler dürfen nie einen User-flow blockieren.
 */
export async function writeAuditEvent(event: AuditEvent): Promise<void> {
  const ts = new Date().toISOString();
  const doc: AuditEventDoc = {
    _id: `audit:${reverseTimestamp()}:${randomUUID().slice(0, 8)}`,
    docType: "audit-event",
    timestamp: ts,
    ...event,
  };
  try {
    await db.insert(doc);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err, type: event.type }, "Audit-Event konnte nicht geschrieben werden");
  }
}

/**
 * Lädt die letzten `limit` Audit-Events. Sortiert DESC (jüngste zuerst)
 * dank Reverse-Timestamp im _id.
 */
export async function loadRecentAuditEvents(limit = 50): Promise<AuditEventDoc[]> {
  const result = await db.list({
    startkey: "audit:",
    endkey: "audit:￰",
    include_docs: true,
    limit,
  });
  return result.rows
    .map((r) => r.doc as AuditEventDoc | undefined)
    .filter((d): d is AuditEventDoc => !!d && d.docType === "audit-event");
}
