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
  key: "blaulichtsms" | "sybos" | "wasserkarte" | "couch" | "fcm";
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
  // wasserkarte.info wurde aus V1.0-Scope entfernt — der Hydranten-Layer wird
  // optional in einer späteren Phase wieder aktiviert. Bis dahin bleibt
  // `checkWasserkarte()` als Dead-Code vorhanden (nicht aufgerufen) damit
  // die Re-Aktivierung trivial ist.
  const items: HealthItem[] = [
    await checkBlaulichtSms(),
    await checkSyBos(),
    await checkCouch(),
    await checkFcm(),
  ];
  return { items, checkedAt };
}

/** FCM-Konfig + Anzahl registrierte Tablets. */
async function checkFcm(): Promise<HealthItem> {
  const sub = "Android-APK · Background-Push · HTTP v1";
  const configured = !!env.FCM_SERVICE_ACCOUNT_JSON;
  const legacyOnly = !!env.FCM_SERVER_KEY && !configured;
  let registered = 0;
  try {
    const list = await db.list({
      startkey: "device:",
      endkey: "device:￰",
      limit: 1000,
    });
    registered = list.rows.filter((r) =>
      String(r.id ?? "").startsWith("device:"),
    ).length;
  } catch {
    // egal — Couch-Health-Block oben deckt das
  }
  if (!configured) {
    return {
      key: "fcm" as HealthItem["key"],
      name: "FCM Push",
      sub,
      state: "off",
      detail: legacyOnly
        ? "Nur FCM_SERVER_KEY (Legacy) gesetzt — diese API ist seit 20.06.2024 von Google abgeschaltet. Bitte Service-Account-JSON als FCM_SERVICE_ACCOUNT_JSON setzen (Doku: apps/pwa/android/FCM-SETUP.md)."
        : registered
        ? `${registered} Tablet(s) registriert, aber FCM_SERVICE_ACCOUNT_JSON nicht gesetzt — Alarm-Pushes werden nur geloggt, nicht versendet.`
        : "FCM_SERVICE_ACCOUNT_JSON nicht gesetzt, keine Tablets registriert. Doku: apps/pwa/android/FCM-SETUP.md",
      metrics: { registered, configured: 0 },
    };
  }
  return {
    key: "fcm" as HealthItem["key"],
    name: "FCM Push",
    sub,
    state: registered === 0 ? "warn" : "ok",
    detail: `${registered} Tablet(s) registriert · FCM_SERVICE_ACCOUNT_JSON gesetzt (HTTP v1)${
      registered === 0
        ? " — aber noch keine App hat sich registriert (APK installieren + Login)"
        : ""
    }`,
    metrics: { registered, configured: 1 },
  };
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
        "BLAULICHTSMS_CUSTOMER_ID / _USER / _PW nicht gesetzt — Poller ist inaktiv, es kommen keine Alarme an. Credentials in fly secrets setzen und API redeployen.",
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

/**
 * Ausgangs-IP des API-Servers (Egress) — die IP, mit der dieser Server bei
 * syBOS anklopft. syBOS hat eine IP-Whitelist; bei "Falsche IP Adresse" muss
 * GENAU diese IP dort eingetragen werden. fly.io vergibt dynamische Egress-IPs,
 * deshalb hier zur Laufzeit ermittelt + 10 min gecacht (ipify ist gratis).
 */
let egressIpCache: { ip: string; at: number } | null = null;
async function getEgressIp(): Promise<string | null> {
  const now = Date.now();
  if (egressIpCache && now - egressIpCache.at < 10 * 60_000) return egressIpCache.ip;
  try {
    const r = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return egressIpCache?.ip ?? null;
    const ip = (await r.text()).trim();
    if (ip) egressIpCache = { ip, at: now };
    return ip || (egressIpCache?.ip ?? null);
  } catch {
    return egressIpCache?.ip ?? null;
  }
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
  const egress = await getEgressIp();
  const egressHint = egress
    ? ` · Server-Egress-IP (in syBOS unter „Server-IPs" whitelisten): ${egress}`
    : "";
  const s = getSyBosState();
  if (!s.lastSyncAt) {
    return {
      key: "sybos",
      name: "syBOS",
      sub,
      state: "warn",
      detail: `Credentials gesetzt, aber noch kein Sync gelaufen. Trigger manuell im Personal-Tab.${egressHint}`,
      ...(egress ? { metrics: { egressIp: egress } } : {}),
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
      : `Letzter Sync fehlgeschlagen: ${s.lastError ?? "unbekannt"}${egressHint}`,
    metrics: {
      ageHours: Number(ageH.toFixed(2)),
      personalCount: s.personalCount,
      materialCount: s.materialCount,
      ...(egress ? { egressIp: egress } : {}),
    },
  };
}

/**
 * @deprecated Wasserkarte/Hydranten-Layer ist aus V1.0-Scope entfernt.
 * Wird aktuell NICHT aufgerufen — Funktion bleibt für Re-Aktivierung
 * in einer späteren Phase als Skelett bestehen.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function checkWasserkarte(): HealthItem {
  const sub = "Hydranten-Layer";
  if (!hasWasserkarte()) {
    return {
      key: "wasserkarte",
      name: "wasserkarte.info",
      sub,
      state: "off",
      detail: "Aus V1.0-Scope entfernt — Re-Aktivierung in späterer Phase.",
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
