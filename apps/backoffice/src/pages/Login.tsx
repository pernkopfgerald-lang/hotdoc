import { useState } from "react";
import { ApiError, apiCall, setToken } from "../api/client";
import { BrandLogo } from "../components/BrandLogo";
import type { AuthResponse, LoginRequest } from "@hotdoc/shared";

interface Props {
  onLoggedIn: (auth: AuthResponse) => void;
}

export function Login({ onLoggedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: LoginRequest = { username, password };
      const auth = await apiCall<AuthResponse>("/api/auth/login", { method: "POST", body });
      setToken(auth.token);
      onLoggedIn(auth);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Benutzername oder Passwort ungültig");
      } else if (err instanceof ApiError && err.status === 404) {
        setError("Auth-Endpoint noch nicht implementiert.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setBusy(false);
    }
  }

  return (
    <main
      className="page"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <header style={{ textAlign: "center", marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <BrandLogo variant="full" size={56} />
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
            }}
          >
            HotDoc
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
            }}
          >
            Backoffice · FF Eberstalzell
          </p>
        </header>

        <form onSubmit={submit} className="card">
          <div className="field">
            <label className="caption">Benutzername</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              className="input"
            />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label className="caption">Passwort</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="input"
            />
          </div>

          {error && (
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--red-tint)",
                color: "var(--red)",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--red-border)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="cta"
            style={{ marginTop: 20, padding: "16px 20px", fontSize: 15 }}
          >
            {busy ? "Anmelden …" : "Anmelden"}
          </button>
        </form>

        <p
          style={{
            marginTop: 18,
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--fg-3)",
          }}
        >
          Tablet-Anmeldung läuft automatisch über die SIM-Karte
        </p>
      </div>
    </main>
  );
}
