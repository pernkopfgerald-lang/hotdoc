import { jwtVerify, SignJWT } from "jose";
import { env } from "../../config.js";
import type { Rolle } from "@hotdoc/shared";

const SECRET_BYTES = new TextEncoder().encode(env.JWT_SECRET);

export interface SessionPayload {
  sub: string; // benutzerId
  username: string;
  rolle: Rolle;
  fahrzeugId?: string;
}

/** Erzeugt einen signierten JWT-Token mit konfiguriertem TTL. */
export async function signSession(payload: SessionPayload): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SEC * 1000);
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setSubject(payload.sub)
    .sign(SECRET_BYTES);
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_BYTES);
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      username: String(payload.username ?? ""),
      rolle: payload.rolle as Rolle,
      ...(payload.fahrzeugId ? { fahrzeugId: String(payload.fahrzeugId) } : {}),
    };
  } catch {
    return null;
  }
}
