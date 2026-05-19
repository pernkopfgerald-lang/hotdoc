/**
 * Entwickler-Endpoints für lokales Testen ohne echte externe Services.
 * Werden nur in NODE_ENV !== "production" exponiert.
 */

import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config.js";
import { logger } from "../lib/logger.js";
import { pushMockAlarm } from "../services/blaulichtsms/client.js";
import { pollOnce } from "../workers/blaulichtsms-poller.js";

export const devRouter: Router = Router();

devRouter.use((req, res, next) => {
  if (env.NODE_ENV === "production") {
    res.status(404).end();
    return;
  }
  next();
});

const TriggerSchema = z.object({
  einsatzort: z.string().default("Eberstalzeller Straße 5, 4653 Eberstalzell"),
  alarmText: z.string().default("Brand KFZ"),
  koordinaten: z
    .object({ lat: z.number(), lng: z.number() })
    .default({ lat: 48.11, lng: 13.961 }),
  authorName: z.enum(["BWST", "LWZ"]).default("BWST"),
});

/** Triggert einen Mock-Alarm — der nächste Poll legt einen Einsatz an. */
devRouter.post("/api/dev/blaulichtsms/trigger", (async (req, res) => {
  const parsed = TriggerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const alarmId = `MOCK-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4)}`;
  pushMockAlarm({
    customerId: "mock",
    alarmId,
    alarmDate: new Date().toISOString(),
    authorName: parsed.data.authorName,
    alarmText: parsed.data.alarmText,
    geolocation: {
      address: parsed.data.einsatzort,
      coordinates: parsed.data.koordinaten,
    },
  });
  const result = await pollOnce();
  logger.info({ alarmId, result }, "Mock-Alarm konsumiert");
  res.json({ ok: true, alarmId, einsatzId: `einsatz:${alarmId}`, ...result });
}) as RequestHandler);

/** Manueller Poll-Trigger ohne Cron-Intervall abzuwarten. */
devRouter.post("/api/dev/blaulichtsms/poll", (async (_req, res) => {
  const result = await pollOnce();
  res.json({ ok: true, ...result });
}) as RequestHandler);
