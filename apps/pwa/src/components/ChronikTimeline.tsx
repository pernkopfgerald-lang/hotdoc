import { Pencil, X, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ChronikEintrag {
  id: string;
  zeitstempel: string;
  funkrufname: string;
  text: string;
  pending?: boolean;
  source: "blaulichtsms" | "fahrzeug" | "manuell" | "atemschutz";
  // Issue 6 (Einsatz-Test 2026-06-02): fahrzeugId wird vom
  // chronik-Broadcast mitgeschickt. BerichtPage braucht das fuer den
  // canEdit-Check ("nur eigene Eintraege bearbeiten").
  fahrzeugId?: string;
  /** Issue 6: Wer hat zuletzt editiert + wann (ISO). */
  editiertAm?: string;
  editiertVon?: string;
  /** Foto-Funktion (2026-06-03): Referenz auf das foto:-Doc, falls der
   *  Eintrag ein Foto trägt. Das Bild selbst wird per loadFoto nachgeladen. */
  fotoId?: string;
}

interface Props {
  eintraege: ChronikEintrag[];
  /**
   * Foto-Funktion (2026-06-03): Lädt die Bild-Data-URL zu einer fotoId
   * (lokal aus PouchDB am aufnehmenden Tablet). Liefert null wenn das Foto
   * nicht lokal vorliegt → dann wird nur das 📷-Symbol gezeigt. Optional —
   * Aufrufer ohne loadFoto zeigen Fotos gar nicht als Bild.
   */
  loadFoto?: (fotoId: string) => Promise<string | null>;
  /**
   * Issue 6 (Einsatz-Test 2026-06-02): Predikat ob ein Eintrag editierbar
   * ist. Default = `false` fuer alle (rueckwaertskompatibel — Aufrufer
   * ohne canEdit zeigen keine Edit-Buttons). Auf BerichtPage z. B.
   * `(e) => !abgeschlossen && e.fahrzeugId === eigeneFahrzeugId`, auf
   * der Florianstation `() => !schreibschutz`.
   */
  canEdit?: (entry: ChronikEintrag) => boolean;
  /**
   * Issue 6: Save-Callback. Rueft den PUT-Endpoint auf und liefert true
   * bei Erfolg (Edit-Mode schliesst dann). false = Fehler (UI-Hint im
   * Eintrag bleibt sichtbar, Mode bleibt offen damit User retryen kann).
   */
  onSaveEdit?: (entryId: string, newText: string) => Promise<boolean>;
}

/**
 * ChronikTimeline — Design `.timeline` / `.tl-row` / `.tl-body` mit
 * Border-Linie links und Dot. Farbe nach Source: rot=BlaulichtSMS,
 * blau=Fahrzeug-default, grün=Atemschutz, amber=pending.
 *
 * Issue 6 (Einsatz-Test 2026-06-02): Eintraege koennen inline editiert
 * werden (Pencil-Icon rechts an jedem Eintrag fuer den editiert-werden-
 * darf-Eintrag). Edit-Mode oeffnet ein Textarea + Save/Cancel.
 */
export function ChronikTimeline({ eintraege, canEdit, onSaveEdit, loadFoto }: Props) {
  // Foto-Funktion (2026-06-03): geladene Bild-Data-URLs cachen (fotoId → dataUrl
  // | null = lokal nicht vorhanden). Lightbox zeigt ein angetipptes Foto groß.
  const [fotoCache, setFotoCache] = useState<Record<string, string | null>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!loadFoto) return;
    let cancelled = false;
    const offen = eintraege
      .map((e) => e.fotoId)
      .filter((id): id is string => !!id && !(id in fotoCache));
    if (offen.length === 0) return;
    void (async () => {
      for (const id of offen) {
        const url = await loadFoto(id).catch(() => null);
        if (cancelled) return;
        setFotoCache((prev) => ({ ...prev, [id]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eintraege, loadFoto, fotoCache]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [errId, setErrId] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Wenn der Edit-Mode aktiv wird, Fokus + Auto-Resize.
  useEffect(() => {
    if (editingId && taRef.current) {
      taRef.current.focus();
      taRef.current.setSelectionRange(
        taRef.current.value.length,
        taRef.current.value.length,
      );
    }
  }, [editingId]);

  function beginEdit(e: ChronikEintrag) {
    setEditingId(e.id);
    setDraft(e.text);
    setErrId(null);
  }
  function cancelEdit() {
    setEditingId(null);
    setDraft("");
    setErrId(null);
  }
  async function saveEdit(entryId: string) {
    if (!onSaveEdit) return;
    const cleaned = draft.trim();
    if (cleaned.length < 1) return;
    setBusy(true);
    setErrId(null);
    try {
      const ok = await onSaveEdit(entryId, cleaned);
      if (ok) {
        setEditingId(null);
        setDraft("");
      } else {
        setErrId(entryId);
      }
    } catch {
      setErrId(entryId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="timeline">
      {eintraege.map((e) => {
        const variant =
          e.source === "blaulichtsms"
            ? "red"
            : e.source === "atemschutz"
              ? "ok"
              : e.pending
                ? "warn"
                : "";
        const sourceLabel =
          e.source === "blaulichtsms" ? "BlaulichtSMS" : e.funkrufname;
        const isEditing = editingId === e.id;
        const allowEdit = !!canEdit && !!onSaveEdit && canEdit(e);
        return (
          <div className="tl-row" key={e.id}>
            <div className="tl-time">{formatTime(e.zeitstempel)}</div>
            <div className="tl-body" style={{ position: "relative" }}>
              <span className={`tl-dot${variant ? " " + variant : ""}`} />
              <div className={`tl-source${variant ? " " + variant : ""}`}>
                {sourceLabel}
                {e.editiertAm ? (
                  <span
                    style={{
                      marginLeft: 6,
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 500,
                      color: "var(--fg-3)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                    title={`Editiert am ${e.editiertAm}${e.editiertVon ? ` von ${e.editiertVon}` : ""}`}
                  >
                    · editiert
                  </span>
                ) : null}
              </div>
              {isEditing ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    marginTop: 4,
                    width: "100%",
                  }}
                >
                  {/* Issue 6 (Einsatz-Test 2026-06-02): spellCheck de-AT
                      damit der Korrektur-Flow vom Web-Speech-Diktat genau
                      die Tippfehler markiert die der Recognizer geliefert hat. */}
                  <textarea
                    ref={taRef}
                    className="input"
                    rows={3}
                    value={draft}
                    onChange={(ev) => setDraft(ev.target.value)}
                    spellCheck
                    lang="de-AT"
                    disabled={busy}
                    maxLength={2000}
                    style={{ resize: "vertical", fontSize: 13 }}
                    onKeyDown={(ev) => {
                      // Ctrl/Cmd+Enter speichert, Esc bricht ab.
                      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
                        ev.preventDefault();
                        void saveEdit(e.id);
                      } else if (ev.key === "Escape") {
                        ev.preventDefault();
                        cancelEdit();
                      }
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      justifyContent: "flex-end",
                    }}
                  >
                    {errId === e.id ? (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--red)",
                          marginRight: "auto",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        Speichern fehlgeschlagen
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={busy}
                      aria-label="Bearbeitung abbrechen"
                      title="Abbrechen (Esc)"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 10px",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "var(--fg-2)",
                        cursor: busy ? "wait" : "pointer",
                        minHeight: 0,
                      }}
                    >
                      <X size={12} />
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEdit(e.id)}
                      disabled={busy || draft.trim().length < 1}
                      aria-label="Eintrag speichern"
                      title="Speichern (Strg+Enter)"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 10px",
                        background: "var(--ok-tint)",
                        border: "1px solid var(--ok-border)",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--ok)",
                        cursor:
                          busy || draft.trim().length < 1
                            ? "not-allowed"
                            : "pointer",
                        opacity: draft.trim().length < 1 ? 0.5 : 1,
                        minHeight: 0,
                      }}
                    >
                      <Check size={12} />
                      {busy ? "Speichere…" : "Speichern"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="tl-text">{stripAuftragsPrefix(e.text)}</div>
                  {allowEdit ? (
                    <button
                      type="button"
                      onClick={() => beginEdit(e)}
                      aria-label="Eintrag bearbeiten"
                      title="Eintrag bearbeiten"
                      style={{
                        // OPT-2 (Audit 2026-06-03): Touch-Target von 28px auf
                        // 44px. Negativer Offset hält die optische Position am
                        // rechten Rand, vergrößert aber die Trefferfläche für
                        // Handschuhe (Icon bleibt visuell klein).
                        position: "absolute",
                        top: -8,
                        right: -8,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 44,
                        height: 44,
                        padding: 0,
                        background: "transparent",
                        border: "1px solid transparent",
                        borderRadius: 8,
                        color: "var(--fg-3)",
                        cursor: "pointer",
                        transition: "color 120ms ease, background 120ms ease, border-color 120ms ease",
                      }}
                      onMouseEnter={(ev) => {
                        ev.currentTarget.style.color = "var(--info)";
                        ev.currentTarget.style.background = "var(--info-tint)";
                        ev.currentTarget.style.borderColor =
                          "var(--blue-border)";
                      }}
                      onMouseLeave={(ev) => {
                        ev.currentTarget.style.color = "var(--fg-3)";
                        ev.currentTarget.style.background = "transparent";
                        ev.currentTarget.style.borderColor = "transparent";
                      }}
                    >
                      <Pencil size={12} strokeWidth={2.2} />
                    </button>
                  ) : null}
                  {/* Foto-Funktion (2026-06-03): Thumbnail (4:3) wenn der
                      Eintrag ein Foto trägt. Tipp öffnet die Großansicht. */}
                  {e.fotoId ? (
                    fotoCache[e.fotoId] ? (
                      <button
                        type="button"
                        onClick={() => setLightbox(fotoCache[e.fotoId!] ?? null)}
                        aria-label="Foto groß anzeigen"
                        style={{
                          marginTop: 6,
                          padding: 0,
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          overflow: "hidden",
                          width: 160,
                          height: 120,
                          background: "var(--surface-2)",
                          cursor: "pointer",
                          display: "block",
                          minHeight: 0,
                        }}
                      >
                        <img
                          src={fotoCache[e.fotoId] ?? ""}
                          alt="Einsatz-Foto"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      </button>
                    ) : (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: "var(--fg-3)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {fotoCache[e.fotoId] === null ? "📷 Foto (im Bericht enthalten)" : "📷 Foto lädt …"}
                      </div>
                    )
                  ) : null}
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Foto-Funktion (2026-06-03): Lightbox-Vollbild. Tipp irgendwo schließt. */}
      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <img
            src={lightbox}
            alt="Einsatz-Foto groß"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Schließen"
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              width: 48,
              height: 48,
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,0.4)",
              background: "rgba(0,0,0,0.5)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={22} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Backwards-Compat: alte Chronik-Eintraege haben einen "Auftrag begonnen: "-
 * Prefix, neue nicht mehr (Issue 23). Beim Rendern strippen wir den Prefix
 * damit alte Daten und neue Daten konsistent angezeigt werden.
 */
function stripAuftragsPrefix(text: string): string {
  return text.replace(/^Auftrag begonnen:\s*/i, "");
}
