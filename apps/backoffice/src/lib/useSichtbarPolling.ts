import { useEffect } from "react";

/**
 * Ruft `fn` sofort und danach alle `intervalMs` auf — aber nur, solange der
 * Browser-Tab sichtbar ist. Ein versteckter Tab (anderer Tab, minimiertes
 * Fenster) pausiert den Poll; beim Sichtbarwerden wird sofort nachgeladen.
 *
 * `fn` sollte per useCallback stabil sein: Aendert sich ihre Identitaet
 * (z. B. weil sich die Auswahl aendert), startet der Poll neu — mit
 * sofortigem Abruf. Fehler muss `fn` selbst behandeln.
 */
export function useSichtbarPolling(fn: () => void | Promise<void>, intervalMs: number): void {
  useEffect(() => {
    void fn();
    const id = setInterval(() => {
      if (!document.hidden) void fn();
    }, intervalMs);
    const onVisibility = () => {
      if (!document.hidden) void fn();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fn, intervalMs]);
}
