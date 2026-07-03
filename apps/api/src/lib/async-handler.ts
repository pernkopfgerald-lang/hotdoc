/**
 * Async-Handler-Wrapper fuer Express 4 (A-02, Audit 2026-07).
 *
 * Express 4 faengt Rejections aus async-Route-Handlern NICHT ab: wirft ein
 * `await` im Handler (z. B. CouchDB nicht erreichbar), landet der Fehler nur
 * als unhandledRejection im Prozess-Log — der HTTP-Request bekommt NIE eine
 * Response und haengt bis zum Client-Timeout. `ah(...)` leitet die Rejection
 * an `next(err)` weiter, damit der globale Error-Handler (server.ts) eine
 * saubere JSON-Fehlerantwort schickt.
 *
 * Bewusst ohne npm-Dependency (express-async-errors o. ae.) — CLAUDE.md §1:
 * keine neuen Pakete ohne Freigabe.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";

export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}
