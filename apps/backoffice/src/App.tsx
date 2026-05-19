import { useState } from "react";
import { clearToken, getToken } from "./api/client";
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

  if (!auth) {
    return <Login onLoggedIn={setAuth} />;
  }
  return <Verwaltung auth={auth} onLogout={() => setAuth(null)} />;
}
