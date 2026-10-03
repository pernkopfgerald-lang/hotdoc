/**
 * Ausruestungs-Check: Regeln aus dem Backoffice (config:ausruestungs-regeln)
 * laden und lokal cachen — das Tablet prueft beim Abschluss offline-faehig
 * mit dem zuletzt bekannten Stand. Keine Regeln = kein Check.
 */

import { useEffect, useState } from "react";
import type { AusruestungsRegel } from "@hotdoc/shared";
import { apiCall } from "./api";

const CACHE_KEY = "hotdoc.ausruestungsregeln.v1";
const POLL_INTERVAL_MS = 5 * 60 * 1000;

function sanitize(raw: unknown): AusruestungsRegel[] {
  if (!Array.isArray(raw)) return [];
  const out: AusruestungsRegel[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (
      typeof o.id !== "string" ||
      typeof o.stichwort !== "string" ||
      typeof o.fahrzeug !== "string" ||
      !Array.isArray(o.geraete) ||
      (o.pruefart !== "MUSS" && o.pruefart !== "INFO")
    ) {
      continue;
    }
    out.push({
      id: o.id,
      stichwort: o.stichwort,
      fahrzeug: o.fahrzeug,
      geraete: o.geraete.filter((g): g is string => typeof g === "string"),
      pruefart: o.pruefart,
      ...(typeof o.gueltigAb === "string" && o.gueltigAb ? { gueltigAb: o.gueltigAb } : {}),
      ...(typeof o.notiz === "string" && o.notiz ? { notiz: o.notiz } : {}),
      ...(o.aktiv === false ? { aktiv: false } : {}),
    });
  }
  return out;
}

function readCache(): AusruestungsRegel[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function useAusruestungsRegeln(): AusruestungsRegel[] {
  const [regeln, setRegeln] = useState<AusruestungsRegel[]>(readCache);

  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const r = await apiCall<{ ok: boolean; data: { regeln?: unknown } }>(
          "/api/config/ausruestungs-regeln",
        );
        if (cancelled) return;
        const clean = sanitize(r.data?.regeln);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(clean));
        } catch {
          // Quota / Private-Mode — der naechste Abruf holt es erneut.
        }
        setRegeln(clean);
      } catch {
        // Offline / 401: zuletzt gecachter Stand bleibt gueltig.
      }
    }
    void fetchOnce();
    const t = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return regeln;
}
