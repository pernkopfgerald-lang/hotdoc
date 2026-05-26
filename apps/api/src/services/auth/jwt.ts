import { jwtVerify, SignJWT } from "jose";
import { env } from "../../config.js";
import type { Rolle } from "@hotdoc/shared";

const SECRET_BYTES = new TextEncoder().encode(env.JWT_SECRET);

export interface SessionPayload {
  sub: string; // benutzerId
  username: string;
  rolle: Rolle;
  fahrzeugId?: string;
  /**
   * Wenn gesetzt, ist der Token nach diesem Zeitpunkt ungültig — auch wenn
   * die Standard-exp-Claim noch nicht abgelaufen ist. Wird nach dem
   * QR-Handoff gesetzt: das Handy bekommt z. B. autoReleaseAt = jetzt + 24h,
   * danach wandert die Sitzung automatisch zurück ans Tablet (das Tablet
   * meldet sich beim nächsten PIN-Login wieder an).
   */
  autoReleaseAt?: string;
  /** True wenn der Token durch eine Notfall-Übergabe entstanden ist. */
  viaHandoff?: boolean;
}

interface SignOptions {
  /** Optional: Token wird zusätzlich nach diesem Zeitpunkt ungültig.
   *  Standard-exp bleibt unverändert (env.SESSION_TTL_SEC). */
  autoReleaseAt?: string;
  /** Markiert den Token als „durch Handoff entstanden" (UI-Anzeige). */
  viaHandoff?: boolean;
}

/** Erzeugt einen signierten JWT-Token mit konfiguriertem TTL. */
export async function signSession(
  payload: SessionPayload,
  options: SignOptions = {},
): Promise<{ token: string; expiresAt: string; autoReleaseAt?: string }> {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SEC * 1000);
  const claims: Record<string, unknown> = { ...payload };
  if (options.autoReleaseAt) claims.autoReleaseAt = options.autoReleaseAt;
  if (options.viaHandoff) claims.viaHandoff = true;
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setSubject(payload.sub)
    .sign(SECRET_BYTES);
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    ...(options.autoReleaseAt ? { autoReleaseAt: options.autoReleaseAt } : {}),
  };
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_BYTES);
    if (typeof payload.sub !== "string") return null;
    // Custom Auto-Release-Logik: wenn der Token einen `autoReleaseAt`-Claim
    // hat (Handoff-Token), und das Datum überschritten ist, lehnen wir
    // den Token ab — exakt als wäre er regulär abgelaufen. So wandert die
    // Sitzung automatisch zurück ans Tablet (Standard-PIN-Login fängt sie
    // wieder ein) ohne dass wir einen Cron-Job brauchen.
    if (typeof payload.autoReleaseAt === "string") {
      const t = new Date(payload.autoReleaseAt).getTime();
      if (!Number.isNaN(t) && t < Date.now()) return null;
    }
    return {
      sub: payload.sub,
      username: String(payload.username ?? ""),
      rolle: payload.rolle as Rolle,
      ...(payload.fahrzeugId ? { fahrzeugId: String(payload.fahrzeugId) } : {}),
      ...(typeof payload.autoReleaseAt === "string" ? { autoReleaseAt: payload.autoReleaseAt } : {}),
      ...(payload.viaHandoff === true ? { viaHandoff: true } : {}),
    };
  } catch {
    return null;
  }
}
