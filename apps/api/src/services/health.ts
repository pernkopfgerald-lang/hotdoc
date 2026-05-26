/**
 * Live-Health der externen Schnittstellen.
 *
 * Wird vom Backoffice-Tab "Schnittstellen" konsumiert. Liefert pro
 * Integration einen `state` ("ok" | "warn" | "off" | "error") plus
 * eine kurze Klartext-Diagnose, die der Funktionär lesen kann.
 *
 * Daten kommen aus:
 * - env (Feature-Toggle)
 * - in-Memory-State der Worker (letzter Poll / Sync · siehe state.ts)
 * - CouchDB-Stats für den Replication-Status
 */

import { env, hasBlaulichtSMS, hasSyBos, hasWasserkarte } from "../config.js";
import { couch, db } from "../couch/client.js";
import { getBlaulichtSmsState, getSyBosState } from "./state.js";

export type HealthState = "ok" | "warn" | "off" | "error";

export interface HealthItem {
  /** Maschinen-Key — UI mappt das auf Icons/Titel. */
  key: "blaulichtsms" | "sybos" | "wasserkarte" | "couch";
  /** Anzeigename. */
  name: string;
  /** Untertitel (z. B. "Alarm-Polling alle 15 s"). */
  sub: string;
  state: HealthState;
  /** Klartext-Diagnose — wird im UI als Body angezeigt. */
  detail: string;
  /** Optional: numerische Metriken für spätere Charts. */
  metrics?: Record<string, number | string>;
}

export async function collectHealth(): Promise<{ items: HealthItem[]; checkedAt: string }> {
  const checkedAt = new Date().toISOString();
  const items: HealthItem[] = [
    await checkBlaulichtSms(),
    await checkSyBos(),
    checkWasserkarte(),
    await checkCouch(),
  ];
  return { items, checkedAt };
}

async function checkBlaulichtSms(): Promise<HealthItem> {
  const sub = `Alarm-Polling alle ${env.BLAULICHTSMS_POLL_INTERVAL_SEC} s`;
  if (!hasBlaulichtSMS()) {
    return {
      key: "blaulichtsms",
      name: "BlaulichtSMS",
      sub,
      state: "off",
      detail:
        "BLAULICHTSMS_CUSTOMER_ID / _USER / _PW nicht gesetzt — Mock-Modus aktiv (Alarme nur über /api/dev/blaulichtsms/trigger).",
    };
  }
  const s = getBlaulichtSmsState();
  if (!s.lastPollAt) {
    return {
      key: "blaulichtsms",
      name: "BlaulichtSMS",
      sub,
      state: "warn",
      detail: "Credentials gesetzt, aber noch kein Poll abgeschlossen.",
    };
  }
  const ageSec = Math.floor((Date.now() - new Date(s.lastPollAt).getTime()) / 1000);
  const stale = ageSec > env.BLAULICHTSMS_POLL_INTERVAL_SEC * 3;
  return {
    key: "blaulichtsms",
    name: "BlaulichtSMS",
    sub,
    state: s.lastError ? "error" : stale ? "warn" : "ok",
    detail: s.lastError
      ? `Letzter Poll fehlgeschlagen: ${s.lastError}`
      : `Letzter Poll vor ${ageSec} s · ${s.totalNeu} neue Alarme insgesamt seit Start`,
    metrics: { ageSec, totalNeu: s.totalNeu, totalPolls: s.totalPolls },
  };
}

async function checkSyBos(): Promise<HealthItem> {
  const sub = "Personal & Material · tägl. 04:00";
  if (!hasSyBos()) {
    return {
      key: "sybos",
      name: "syBOS",
      sub,
      state: "off",
      detail: "SYBOS_API_URL / SYBOS_TOKEN nicht gesetzt — keine Stammdaten-Synchronisation aktiv.",
    };
  }
  const s = getSyBosState();
  if (!s.lastSyncAt) {
    return {
      key: "sybos",
      name: "syBOS",
      sub,
      state: "warn",
      detail: "Credentials gesetzt, aber noch kein Sync gelaufen. Trigger manuell im Personal-Tab.",
    };
  }
  const ageH = (Date.now() - new Date(s.lastSyncAt).getTime()) / 1000 / 3600;
  const stale = ageH > 36;
  return {
    key: "sybos",
    name: "syBOS",
    sub,
    state: s.lastOk ? (stale ? "warn" : "ok") : "error",
    detail: s.lastOk
      ? `${s.personalCount} Personen · ${s.materialCount} Material · ${s.abteilungenCount} Abteilungen · letzter Sync vor ${formatAge(ageH)}`
      : `Letzter Sync fehlgeschlagen: ${s.lastError ?? "unbekannt"}`,
    metrics: {
      ageHours: Number(ageH.toFixed(2)),
      personalCount: s.personalCount,
      materialCount: s.materialCount,
    },
  };
}

function checkWasserkarte(): HealthItem {
  const sub = "Hydranten-Layer";
  if (!hasWasserkarte()) {
    return {
      key: "wasserkarte",
      name: "wasserkarte.info",
      sub,
      state: "off",
      detail: "Access-Key noch nicht beantragt. Anfrage bei wasserkarte.info nötig.",
    };
  }
  return {
    key: "wasserkarte",
    name: "wasserkarte.info",
    sub,
    state: "ok",
    detail: "Access-Key gesetzt — Hydranten-Layer aktiv.",
  };
}

async function checkCouch(): Promise<HealthItem> {
  const sub = "PWA ⇄ Backend · Replication";
  try {
    const info = await couch.db.get(env.COUCH_DB);
    const docCount = (info as { doc_count?: number }).doc_count ?? 0;
    // Aktive Replication-Sessions zählen (Continuous läuft pro Tablet)
    const activeTablets = await countActiveTablets();
    return {
      key: "couch",
      name: "CouchDB-Replikation",
      sub,
      state: "ok",
      detail: `${docCount} Dokumente · ${activeTablets} Tablet-Replikationen aktiv · DB ${env.COUCH_DB} OK`,
      metrics: { docCount, activeTablets },
    };
  } catch (err) {
    return {
      key: "couch",
      name: "CouchDB-Replikation",
      sub,
      state: "error",
      detail: `CouchDB nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Zählt _active_tasks vom Typ replication die zu unserer DB sprechen. */
async function countActiveTablets(): Promise<number> {
  try {
    // CouchDB-Server-Endpoint /_active_tasks listet alle laufenden Jobs
    const basic = Buffer.from(`${env.COUCH_USER}:${env.COUCH_PASS}`).toString("base64");
    const r = await fetch(env.COUCH_URL + "/_active_tasks", {
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return 0;
    const tasks = (await r.json()) as Array<{ type?: string; target?: string; source?: string }>;
    return tasks.filter(
      (t) =>
        t.type === "replication" &&
        ((t.target && t.target.includes(env.COUCH_DB)) ||
          (t.source && t.source.includes(env.COUCH_DB))),
    ).length;
  } catch {
    return 0;
  }
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} Tagen`;
}

export { db };
