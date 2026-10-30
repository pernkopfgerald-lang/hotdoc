import { randomUUID } from "node:crypto";
import { env } from "../../config.js";
import { db } from "../../couch/client.js";
import { logger } from "../../lib/logger.js";
import { hashPassword } from "./password.js";

/**
 * Legt beim ersten Server-Start einen Default-Admin an, wenn noch kein Benutzer existiert.
 *
 * Logs ALLE Credentials nur in development — in production werden sie aus
 * fly secrets gesetzt und der Admin loggt sich initial damit ein.
 */
export async function bootstrapInitialAdminIfMissing(): Promise<void> {
  // WARUM list statt Mango-Scan: Benutzer-Docs haben immer die ID `user:<uuid>`
  // (siehe unten). Ein Range-Read mit limit 1 ist O(1); der frueher genutzte
  // Selektor {type:"benutzer"} hatte keinen Index und las die ganze DB.
  const vorhanden = await db.list({ startkey: "user:", endkey: "user:￰", limit: 1 });
  if (vorhanden.rows.length > 0) return;

  const id = `user:${randomUUID()}`;
  const passwordHash = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD);
  await db.insert({
    _id: id,
    type: "benutzer",
    username: env.BOOTSTRAP_ADMIN_USERNAME,
    passwordHash,
    rolle: "admin",
    aktiv: true,
    erstelltAm: new Date().toISOString(),
  });
  logger.warn(
    {
      username: env.BOOTSTRAP_ADMIN_USERNAME,
      password: env.NODE_ENV === "development" ? env.BOOTSTRAP_ADMIN_PASSWORD : "*** see fly secrets ***",
    },
    "Initialer Admin angelegt — bitte Passwort sofort ändern!",
  );
}
