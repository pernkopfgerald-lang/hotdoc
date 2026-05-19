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
      res.status(403).json({ error: "insufficient_role", required: minRole });
      return;
    }
    req.session = session;
    next();
  };
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
