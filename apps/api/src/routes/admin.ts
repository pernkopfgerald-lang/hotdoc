import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { runSyBosSync } from "../workers/sybos-sync.js";
import { collectHealth } from "../services/health.js";
import { loadRecentAuditEvents, writeAuditEvent } from "../services/audit.js";
import { computeStats } from "../services/stats.js";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const adminRouter: Router = Router();

/**
 * Echte Status-Probe aller Schnittstellen — wird vom Backoffice-Tab
 * "Schnittstellen" (SchnittstellenPanel) sowie dem PWA-Login-Bildschirm
 * gepollt.
 *
 * Bleibt absichtlich öffentlich: zeigt nur "Integration X ist online/
 * offline", keine Credentials/IPs. Frontend braucht das vor dem Login
 * fuer den Status-Indikator.
 */
adminRouter.get("/api/admin/health", async (_req, res) => {
  const health = await collectHealth();
  res.json(health);
});

/**
 * Manueller Trigger für syBOS-Sync — z. B. nach syBOS-Stammdaten-Änderung
 * ohne auf den nächsten Cron-Tick warten zu wollen.
 * Data-Modifying → requireAuth("funktionaer").
 */
adminRouter.post("/api/admin/sybos/sync", requireAuth("funktionaer"), (async (req, res) => {
  logger.info({ ua: req.headers["user-agent"], by: req.session?.username }, "Manueller syBOS-Sync angefordert");
  const result = await runSyBosSync();
  res.status(result.ok ? 200 : 500).json(result);
}) as RequestHandler);

/**
 * Read-only Personen-Liste — Tablets brauchen das zum Auflösen von
 * `fahrzeugKdtPersonId` zu Klar-Namen in der Florianstation-Statusliste.
 *
 * Liefert nur die Felder die das UI braucht: syBosId, vorname, nachname,
 * rang, aktiv. KEINE Telefonnummern, KEINE Geburtsdaten — wird per
 * `requireAuth()` zusätzlich geschützt damit nur eingeloggte Tablets/
 * Backoffice-User die Liste sehen.
 */
adminRouter.get("/api/admin/personen", requireAuth(), (async (_req, res) => {
  const list = await db.list({
    startkey: "person:",
    endkey: "person:￰",
    include_docs: true,
    descending: false,
  });
  const items = list.rows
    .map((r) => r.doc as Record<string, unknown> | undefined)
    .filter((d): d is Record<string, unknown> => !!d && d.type === "person")
    .map((d) => ({
      syBosId: d.syBosId as number,
      vorname: d.vorname as string | undefined,
      nachname: d.nachname as string | undefined,
      // dienstgrad ist das echte Feld im person-Doc (vom syBOS-Mapper),
      // wir mappen es nach `rang` damit das UI nicht beide Namen kennen muss.
      rang: (d.dienstgrad as string | undefined) || (d.rang as string | undefined),
      aktiv: d.aktiv as boolean | undefined,
      atemschutzGueltig: d.atemschutzGueltig as boolean | undefined,
    }))
    .filter((p) => p.aktiv !== false);
  res.json({ ok: true, count: items.length, items });
}) as RequestHandler);

/**
 * Audit-Events — die letzten N Events (Default 50). Für Verwaltung-Tab
 * „Aktivität". Nur funktionaer+ darf das sehen (Datenschutz: Login-Fails
 * mit Username/IP sind sensibel).
 */
adminRouter.get("/api/admin/audit", requireAuth("funktionaer"), (async (req, res) => {
  const rawLimit = req.query.limit;
  const limit = Math.min(200, Math.max(1, Number(rawLimit) || 50));
  const items = await loadRecentAuditEvents(limit);
  res.json({ ok: true, count: items.length, items });
}) as RequestHandler);

/**
 * Statistik-Dashboard — Aggregation über Einsätze + Fahrzeugberichte.
 * Query-Params: ?from=YYYY-MM-DD&to=YYYY-MM-DD. Default: aktuelles Jahr.
 * Nur funktionaer+ — sensibel weil Mannschafts-Stunden personalisiert sind.
 */
adminRouter.get("/api/admin/stats", requireAuth("funktionaer"), (async (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const stats = await computeStats({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  res.json(stats);
}) as RequestHandler);

/**
 * Client-side Error-Reports von der PWA Error-Boundary.
 * Bewusst PUBLIC (Bearer ist optional) — auch ein offline-rebootendes
 * Tablet ohne gültigen Token soll den Crash melden können. Wir limitieren
 * Body-Größe, droppen PII (User-Agent ja, Referrer-PII nein).
 */
adminRouter.post("/api/admin/client-error", (async (req, res) => {
  const b = req.body as Record<string, unknown> | undefined;
  if (!b || typeof b !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const message = String(b.message ?? "").slice(0, 500);
  const stack = String(b.stack ?? "").slice(0, 2000);
  const url = String(b.url ?? "").slice(0, 200);
  const ua = String(b.ua ?? "").slice(0, 200);
  logger.error(
    {
      msg: "PWA client-side error",
      clientMessage: message,
      stack,
      url,
      ua,
      ip: req.ip,
    },
    "client_error_report",
  );
  res.json({ ok: true });
}) as RequestHandler);

/**
 * Test-Daten-Cleanup — wipet alle Einsatz-/Bericht-/Handoff-/Tablet-Docs.
 *
 * Behalten:
 *   - config:*           (Auftragstypen, Stichworte, Geräte, Stammdaten, …)
 *   - user:*             (Benutzer-Accounts inkl. admin)
 *   - person:*           (syBOS-Personen — wird sowieso aus syBOS neu gefüllt)
 *   - material:*         (syBOS-Material)
 *   - fahrzeug:*         (Fahrzeug-Konfig, falls vorhanden)
 *
 * Gelöscht je nach scope:
 *   - "test-data"  (Default): einsatz:* + fzgber:* + handoff:* + tablet:*
 *   - "incl-audit": zusätzlich audit:*
 *   - "full":      alles außer der KEEP-Liste oben
 *
 * Sicherheits-Doppelbestätigung: Body muss `{ confirm: "ja-alles-loeschen" }`
 * tragen. Sonst 400. Admin-only.
 */
const WipeSchema = z.object({
  confirm: z.literal("ja-alles-loeschen"),
  scope: z.enum(["test-data", "incl-audit", "full"]).default("test-data"),
});

const KEEP_PREFIXES = ["config:", "user:", "person:", "material:", "fahrzeug:"] as const;

const TEST_DATA_PREFIXES = ["einsatz:", "fzgber:", "handoff:", "tablet:"] as const;

adminRouter.post("/api/admin/wipe-test-data", requireAuth("admin"), (async (req, res) => {
  const parsed = WipeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_body",
      details: parsed.error.flatten(),
      hint: "Body braucht { confirm: \"ja-alles-loeschen\", scope?: \"test-data\"|\"incl-audit\"|\"full\" }",
    });
    return;
  }
  const { scope } = parsed.data;
  const session = req.session!;
  logger.warn({ scope, by: session.username }, "Test-Daten-Cleanup gestartet");

  /** Entscheidet pro Doc ob es gelöscht wird. */
  function shouldDelete(docId: string): boolean {
    if (KEEP_PREFIXES.some((p) => docId.startsWith(p))) return false;
    if (scope === "full") return true;
    if (scope === "incl-audit" && docId.startsWith("audit:")) return true;
    if (TEST_DATA_PREFIXES.some((p) => docId.startsWith(p))) return true;
    return false;
  }

  /** Holt alle Docs (ohne Inhalt — nur _id + _rev). */
  const list = await db.list({ limit: 100000 });
  const rows = list.rows as Array<{ id: string; value: { rev: string } }>;
  const toDelete: Array<{ _id: string; _rev: string; _deleted: true }> = [];
  const byPrefix: Record<string, number> = {};
  let kept = 0;
  for (const r of rows) {
    if (r.id.startsWith("_design/")) {
      kept++;
      continue;
    }
    if (shouldDelete(r.id)) {
      const prefix = r.id.split(":")[0] + ":";
      byPrefix[prefix] = (byPrefix[prefix] ?? 0) + 1;
      toDelete.push({ _id: r.id, _rev: r.value.rev, _deleted: true });
    } else {
      kept++;
    }
  }

  // Bulk-Delete in Chunks zu 500 — CouchDB verkraftet mehr, aber wir
  // wollen die HTTP-Body-Größe und das Memory-Profil im Griff halten.
  let bulkErrors = 0;
  for (let i = 0; i < toDelete.length; i += 500) {
    const chunk = toDelete.slice(i, i + 500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (await db.bulk({ docs: chunk as any })) as Array<{
      ok?: boolean;
      error?: string;
      id?: string;
    }>;
    for (const r of results) {
      if (r.error) {
        bulkErrors++;
        logger.warn({ id: r.id, error: r.error }, "Bulk-Delete-Eintrag fehlgeschlagen");
      }
    }
  }

  await writeAuditEvent({
    type: "config-changed",
    actorUsername: session.username,
    actorRolle: session.rolle,
    details: {
      what: "wipe-test-data",
      scope,
      deleted: toDelete.length,
      bulkErrors,
      byPrefix,
    },
    ipAddress: req.ip,
  });
  logger.warn(
    { scope, deleted: toDelete.length, kept, bulkErrors, byPrefix, by: session.username },
    "Test-Daten-Cleanup fertig",
  );
  res.json({
    ok: true,
    scope,
    deleted: toDelete.length,
    kept,
    bulkErrors,
    byPrefix,
  });
}) as RequestHandler);
