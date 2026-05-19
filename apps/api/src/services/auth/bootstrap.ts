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
  try {
    const result = await db.find({
      selector: { type: "benutzer" },
      limit: 1,
    });
    if (result.docs.length > 0) return;
  } catch (err) {
    // Mango-Index existiert evtl. noch nicht — wir versuchen list als Fallback.
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status !== 404) {
      logger.warn({ err }, "Bootstrap-Check via find fehlgeschlagen, versuche allDocs");
    }
    const fallback = await db.list({ startkey: "user:", endkey: "user:￰", limit: 1 });
    if (fallback.rows.length > 0) return;
  }

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
