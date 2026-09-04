/**
 * Audio-Retention — NFR-5: Audio-Aufnahmen werden 30 Tage nach
 * Einsatzabschluss automatisch gelöscht. Konfigurierbar via AUDIO_RETENTION_DAYS.
 *
 * Läuft täglich um 03:00 — bevor BlaulichtSMS-Poll um 04:00 läuft, damit
 * der Sync-Worker mit sauberer DB beginnt.
 */

import cron from "node-cron";
import { env } from "../config.js";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";

const CRON_AUSDRUCK = "0 3 * * *"; // täglich 03:00

interface RetentionResult {
  abgeschlosseneEinsaetze: number;
  audioAttachmentsGeloescht: number;
  durationMs: number;
}

export async function runAudioRetention(): Promise<RetentionResult> {
  const start = Date.now();
  const result: RetentionResult = {
    abgeschlosseneEinsaetze: 0,
    audioAttachmentsGeloescht: 0,
    durationMs: 0,
  };

  const grenzDatum = new Date(Date.now() - env.AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const list = await db.list({
    startkey: "einsatz:",
    endkey: "einsatz:￰",
    include_docs: true,
  });

  for (const row of list.rows) {
    const doc = row.doc as
      | (Record<string, unknown> & {
          status?: string;
          einsatzende?: string;
          _attachments?: Record<string, unknown>;
        })
      | undefined;
    if (!doc) continue;
    if (doc.status !== "abgeschlossen") continue;
    if (!doc.einsatzende) continue;
    // C-14: NaN-Guard. `new Date("kaputt") >= grenzDatum` ist IMMER false
    // (Vergleich mit Invalid Date/NaN) — ein Einsatz mit unparsebarem
    // einsatzende wuerde also faelschlich als "alt genug" durchrutschen und
    // seine Audio-Aufnahmen verlieren. Solche Docs ueberspringen + loggen.
    const einsatzendeMs = new Date(doc.einsatzende).getTime();
    if (Number.isNaN(einsatzendeMs)) {
      logger.warn(
        { id: doc._id, einsatzende: doc.einsatzende },
        "Audio-Retention: einsatzende nicht parsebar — Einsatz uebersprungen",
      );
      continue;
    }
    if (einsatzendeMs >= grenzDatum.getTime()) continue;

    result.abgeschlosseneEinsaetze += 1;

    const attachments = doc._attachments;
    if (!attachments) continue;

    const audioKeys = Object.keys(attachments).filter((k) => k.startsWith("audio/"));
    if (audioKeys.length === 0) continue;

    const nextAttachments = { ...attachments };
    for (const key of audioKeys) {
      delete nextAttachments[key];
    }
    // A-09: Insert pro Einsatz kapseln — ein einzelner 409 (z. B. paralleler
    // Write auf einen alten Einsatz) darf nicht den gesamten Retention-Lauf
    // abbrechen. Fehler loggen, naechster Einsatz.
    try {
      await db.insert({ ...doc, _attachments: nextAttachments });
    } catch (err) {
      logger.warn(
        { err, id: doc._id },
        "Audio-Retention: Update fehlgeschlagen — Einsatz uebersprungen",
      );
      continue;
    }
    result.audioAttachmentsGeloescht += audioKeys.length;
    logger.info({ id: doc._id, geloeschteAudios: audioKeys.length }, "Audio-Retention angewandt");
  }

  result.durationMs = Date.now() - start;
  return result;
}

export function startAudioRetentionCron(): void {
  cron.schedule(CRON_AUSDRUCK, () => {
    logger.info({ cron: CRON_AUSDRUCK }, "Audio-Retention-Cron tickt");
    // A-09: .catch wie bei den anderen Workern — ein geplatzter Lauf darf
    // keine unhandled rejection im Prozess hinterlassen.
    void runAudioRetention()
      .then((r) => logger.info(r, "Audio-Retention fertig"))
      .catch((err) => {
        logger.error({ err }, "Audio-Retention-Lauf fehlgeschlagen");
      });
  });
  logger.info({ cron: CRON_AUSDRUCK, days: env.AUDIO_RETENTION_DAYS }, "Audio-Retention geplant");
}
