import { useState } from "react";
import { ApiError, apiCall, setToken } from "../api/client";
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
        setError("Auth-Endpoint noch nicht implementiert (Phase folgt). Hier wird der Login funktional.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="font-condensed text-3xl font-bold tracking-tight">
            <span className="text-red">Hot</span>
            <span className="text-text-1">Doc</span>
          </h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-3">
            Backoffice · FF Eberstalzell
          </p>
        </header>

        <form
          onSubmit={submit}
          className="rounded-m border border-border bg-surface-1 p-6 shadow"
        >
          <label className="block">
            <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
              Benutzername
            </span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              className="mt-1.5 w-full rounded-s border border-border bg-surface-2 px-3 py-2.5 text-text-1 focus:border-border-strong focus:outline-none"
            />
          </label>

          <label className="mt-4 block">
            <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
              Passwort
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1.5 w-full rounded-s border border-border bg-surface-2 px-3 py-2.5 text-text-1 focus:border-border-strong focus:outline-none"
            />
          </label>

          {error && (
            <div className="mt-4 rounded-s border border-red/40 bg-red/10 p-3 text-sm text-red">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-m bg-red px-4 py-3 font-semibold text-white shadow transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Anmelden …" : "Anmelden"}
          </button>
        </form>

        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-wider text-text-3">
          Tablet-Anmeldung läuft automatisch über die SIM-Karte
        </p>
      </div>
    </div>
  );
}
