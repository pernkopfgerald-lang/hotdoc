/**
 * Schlanker In-Memory-Rate-Limiter — pro fly-Machine.
 *
 * Für Login-Brute-Force-Schutz: 5 fehlgeschlagene Versuche pro IP in
 * 15 min → IP wird 30 min gesperrt. In-Memory bedeutet:
 *   - 2 Fly-Machines = doppelte effektive Limits (akzeptabel)
 *   - Restart resetiert den Zustand (akzeptabel — Brute-Force-Versuche
 *     vor Restart waren in echtem Zeitraum, wir starten "frisch")
 *
 * Für stärkere Anforderungen wäre Redis oder CouchDB-Backed besser,
 * aber für eine FF mit < 50 Usern reicht das.
 */

import type { Request, Response, NextFunction } from "express";

interface Attempt {
  count: number;
  firstAt: number;
  blockedUntil?: number;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 30 * 60 * 1000; // 30 min
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

const attempts = new Map<string, Attempt>();

// Aufräumen alter Einträge alle 5 min damit die Map nicht wächst.
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of attempts) {
    const stillBlocked = a.blockedUntil && a.blockedUntil > now;
    const stillCounting = now - a.firstAt < WINDOW_MS;
    if (!stillBlocked && !stillCounting) attempts.delete(ip);
  }
}, CLEANUP_INTERVAL_MS).unref?.();

function clientIp(req: Request): string {
  // fly setzt X-Forwarded-For — Express's req.ip respektiert das wenn
  // app.set('trust proxy', true). Wir machen das in der Server-Init.
  return req.ip || "unknown";
}

/**
 * Middleware: blockt Requests von IPs die zu oft Login-Failures hatten.
 * Verwendung: nur auf Login-/Auth-Routen anwenden, NICHT auf andere.
 */
export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const now = Date.now();
  const a = attempts.get(ip);
  if (a?.blockedUntil && a.blockedUntil > now) {
    const minLeft = Math.ceil((a.blockedUntil - now) / 60_000);
    res.status(429).json({
      error: "rate_limited",
      message: `Zu viele fehlgeschlagene Login-Versuche. Bitte ${minLeft} min warten.`,
      retryAfterMinutes: minLeft,
    });
    return;
  }
  next();
}

/** Wird vom Login-Handler aufgerufen wenn ein Login fehlgeschlagen ist. */
export function recordFailedLogin(req: Request): void {
  const ip = clientIp(req);
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.firstAt > WINDOW_MS) {
    // Frischer Eintrag — Fenster begann jetzt.
    attempts.set(ip, { count: 1, firstAt: now });
    return;
  }
  a.count++;
  if (a.count >= MAX_ATTEMPTS) {
    a.blockedUntil = now + BLOCK_DURATION_MS;
  }
}

/** Reset nach erfolgreichem Login — IP ist legitim. */
export function recordSuccessfulLogin(req: Request): void {
  attempts.delete(clientIp(req));
}
