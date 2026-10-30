import { useEffect, useState } from "react";
import { clearToken, getToken, onSessionExpired } from "./api/client";
import { Login } from "./pages/Login";
import { Verwaltung } from "./pages/Verwaltung";
import type { AuthResponse } from "@hotdoc/shared";

export function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(() => {
    // Token kann da sein, aber wir wissen ohne API-Roundtrip nicht ob er noch gilt.
    // In Phase 5 (Auth) ergänzen wir einen /api/auth/me-Endpoint, der validiert.
    // Für jetzt: kein Auto-Login, immer frisch anmelden.
    if (getToken()) clearToken();
    return null;
  });
  // Hinweis auf der Anmeldeseite, wenn der Server die Sitzung beendet hat (401).
  const [loginHinweis, setLoginHinweis] = useState<string | null>(null);

  useEffect(
    () =>
      onSessionExpired(() => {
        setLoginHinweis("Sitzung abgelaufen – bitte neu anmelden.");
        setAuth(null);
      }),
    [],
  );

  if (!auth) {
    return (
      <Login
        notice={loginHinweis}
        onLoggedIn={(a) => {
          setLoginHinweis(null);
          setAuth(a);
        }}
      />
    );
  }
  return <Verwaltung auth={auth} onLogout={() => setAuth(null)} />;
}
