/**
 * ELS-Endpoints (Funkstatus + Positionen der Fahrzeuge).
 *
 *  - GET /api/els/status     Funkstatus + Position je Fahrzeug (Florianstation,
 *                            Fahrzeug-Tablets lesen mit — wie /api/positions).
 *  - GET /api/els/diagnose   Funktionaer: alle Einheiten roh (mit Zuordnung),
 *                            damit die Zuordnung zu unseren Fahrzeugen geprueft
 *                            werden kann. Keine Anruferdaten.
 *
 * Die Zuordnung ELS-Einheit -> Fahrzeug steht in config:els-zuordnung
 * (PUT /api/config/els-zuordnung, Backoffice).
 */

import { funkstatusAusUnitStatus, funkstatusText } from "@hotdoc/shared";
import { Router } from "express";
import { hasEls } from "../config.js";
import { ah } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { getElsPollStand, holeSnapshot, ladeZuordnung, snapshotAlterSec } from "../services/els/state.js";
import { ordneUnitZu } from "../services/els/logik.js";
import { leseVerlauf, VERLAUF_TAGE } from "../services/els/verlauf.js";

export const elsRouter: Router = Router();

/** Daten, die aelter sind, gelten als veraltet (Poll alle 60 s). */
const STALE_SEC = 5 * 60;

elsRouter.get("/api/els/status", requireAuth(), ah(async (_req, res) => {
  const snap = await holeSnapshot();
  const alter = snapshotAlterSec(snap);
  const frisch = snap !== null && alter !== null && alter <= STALE_SEC;
  res.json({
    ok: true,
    enabled: hasEls(),
    fetchedAt: snap?.fetchedAt ?? null,
    stale: !frisch,
    items: frisch
      ? snap.status.map((s) => ({
          fahrzeugId: s.fahrzeugId,
          callname: s.callname,
          status: s.status,
          statusText: funkstatusText(s.status),
          unitStatus: s.unitStatus,
          since: s.since ?? null,
          lat: s.lat,
          lng: s.lng,
          num1: s.num1 || null,
        }))
      : [],
  });
}));

/** Verlauf der Leitstellen-Rohwerte und der HotDoc-Entscheidungen (Diagnose), bis zu VERLAUF_TAGE Tage. */
elsRouter.get("/api/els/verlauf", requireAuth("funktionaer"), ah(async (req, res) => {
  const tage = Number.parseInt(String(req.query.tage ?? "3"), 10);
  const eintraege = await leseVerlauf(Number.isFinite(tage) ? tage : 3);
  res.json({ ok: true, aufbewahrungTage: VERLAUF_TAGE, anzahl: eintraege.length, eintraege });
}));

elsRouter.get("/api/els/diagnose", requireAuth("funktionaer"), ah(async (_req, res) => {
  const snap = await holeSnapshot();
  const override = await ladeZuordnung();
  res.json({
    ok: true,
    enabled: hasEls(),
    poll: getElsPollStand(),
    fetchedAt: snap?.fetchedAt ?? null,
    zuordnung: override,
    units: (snap?.units ?? []).map((u) => ({
      unid: u.unid,
      callname: u.callname,
      unidLong: u.unidLong,
      sName: u.sName,
      unityp: u.unityp,
      unitStatus: u.unitStatus,
      status: u.statusFlorian.trim() || funkstatusAusUnitStatus(u.unitStatus),
      statusText: funkstatusText(u.statusFlorian.trim() || funkstatusAusUnitStatus(u.unitStatus)),
      statusFlorianstationRoh: u.statusFlorian,
      since: u.lastStatusTimestamp ?? null,
      hatPosition: u.lat !== null,
      fahrzeugId: ordneUnitZu(u, override),
    })),
  });
}));
