import type { NextFunction, Request, Response } from "express";
import type { Rolle } from "@hotdoc/shared";
import { verifySession, type SessionPayload } from "../services/auth/jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

/**
 * Schützt Routen — extrahiert den Bearer-Token, validiert ihn, hängt
 * die Session ans Request-Objekt. Bei Fehlschlag → 401.
 */
export function requireAuth(minRole?: Rolle) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const auth = req.headers.authorization;
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
      res.status(401).json({ error: "missing_authorization" });
      return;
    }
    const token = auth.slice(7).trim();
    const session = await verifySession(token);
    if (!session) {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    if (minRole && !satisfiesRole(session.rolle, minRole)) {
      // F-38: `actual` mitgeben damit das Frontend (Solo-Tablet-Abschluss-
      // Toast) bei Session-Drift erklaeren kann WAS der User aktuell hat.
      // Beispiel: einsatzleiter-Endpoint angesprochen, Token traegt aber
      // nur mannschaft → das Tablet zeigt "Du bist als mannschaft eingeloggt,
      // benoetigt: einsatzleiter — bitte Tablet neu registrieren".
      res.status(403).json({
        error: "insufficient_role",
        required: minRole,
        actual: session.rolle,
      });
      return;
    }
    req.session = session;
    next();
  };
}

/**
 * Wie requireAuth, aber OHNE Abweisung: liefert die Session, wenn ein gueltiger
 * Bearer-Token mitgeschickt wurde, sonst null (fehlender/ungueltiger Token ist
 * hier kein Fehler). Fuer Routen, die fuer alle erreichbar bleiben, aber
 * Angemeldeten mehr zeigen.
 */
export async function getOptionalSession(
  req: Pick<Request, "headers">,
  minRole?: Rolle,
): Promise<SessionPayload | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) return null;
  const session = await verifySession(auth.slice(7).trim());
  if (!session) return null;
  if (minRole && !satisfiesRole(session.rolle, minRole)) return null;
  return session;
}

const RANG: Record<Rolle, number> = {
  mannschaft: 1,
  einsatzleiter: 2,
  funktionaer: 3,
  admin: 4,
};

function satisfiesRole(actual: Rolle, required: Rolle): boolean {
  return RANG[actual] >= RANG[required];
}
