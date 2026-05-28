import { Loader2, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiCall } from "../lib/api";

export interface GeocodeMatch {
  label: string;
  description?: string;
  lat: number;
  lng: number;
  osmType?: string;
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** Wird zusätzlich gerufen wenn der User einen Treffer aus der Liste klickt. */
  onPick?: (match: GeocodeMatch) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Pause zwischen Tastendruck und Suche (ms). */
  debounceMs?: number;
}

/**
 * Adress-Autocomplete-Eingabe mit Dropdown.
 *
 * - Eingabe ≥ 2 Zeichen → debounced Backend-Call /api/geocode
 * - Treffer werden als Liste unter dem Input gezeigt
 * - Klick → übernimmt formatierten String UND ruft onPick mit Koordinaten,
 *   damit das Parent-Modal die Lat/Lng-Info ans Einsatz-Doc anhängt
 * - Touch-tauglich: Tap auf Treffer schließt das Dropdown
 * - Datenquelle: Photon (OpenStreetMap) via Backend-Proxy
 *
 * Hinweis: das Dropdown ist absolut positioniert UNTER dem Input. Es nutzt
 * Glas-Optik (var(--glass-1)) damit es sich von dahinter liegenden
 * Modal-Inhalten abhebt. z-index 5 reicht weil das Modal selbst 1500
 * hat — der Dropdown bleibt innerhalb dessen Stacking-Context.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  placeholder = "z. B. Solarstraße 5, 4653 Eberstalzell",
  autoFocus = false,
  debounceMs = 250,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<GeocodeMatch[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Speichert was zuletzt vom User getippt wurde, damit wir nach einem
   *  Treffer-Pick die nächste Suche unterdrücken (sonst öffnet das
   *  Dropdown direkt wieder mit dem gepickten Wert als Query). */
  const justPickedRef = useRef(false);

  // ─── Debounced Search ───
  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setMatches([]);
      setError(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const handle = setTimeout(async () => {
      try {
        const r = await apiCall<{ items: GeocodeMatch[] }>(
          `/api/geocode?q=${encodeURIComponent(q)}`,
        );
        setMatches(r.items.slice(0, 6));
        setError(null);
        setOpen(true);
        setActiveIdx(-1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMatches([]);
      } finally {
        setBusy(false);
      }
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [value, debounceMs]);

  // ─── Outside-Click schließt Dropdown ───
  useEffect(() => {
    if (!open) return;
    function onDocClick(ev: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocClick);
    return () => document.removeEventListener("pointerdown", onDocClick);
  }, [open]);

  function pickMatch(m: GeocodeMatch) {
    justPickedRef.current = true;
    onChange(m.label);
    onPick?.(m);
    setOpen(false);
    setActiveIdx(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) {
      if (e.key === "ArrowDown" && matches.length > 0) {
        setOpen(true);
        setActiveIdx(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setActiveIdx((i) => (i + 1) % matches.length);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActiveIdx((i) => (i <= 0 ? matches.length - 1 : i - 1));
      e.preventDefault();
    } else if (e.key === "Enter" && activeIdx >= 0) {
      const m = matches[activeIdx];
      if (m) {
        pickMatch(m);
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  const showDropdown =
    open && (busy || matches.length > 0 || error !== null);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div className="input-row filled" style={{ paddingLeft: 14 }}>
        <MapPin size={16} color="var(--fg-3)" />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (matches.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
        />
        {busy ? (
          <Loader2
            size={14}
            className="animate-spin"
            color="var(--fg-3)"
            style={{ marginRight: 10 }}
          />
        ) : null}
      </div>

      {showDropdown ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 10,
            background: "var(--glass-1)",
            backdropFilter: "var(--blur-1)",
            WebkitBackdropFilter: "var(--blur-1)",
            border: "1px solid var(--glass-border-strong)",
            borderRadius: "var(--radius-m)",
            boxShadow: "var(--glass-shadow-1)",
            maxHeight: 280,
            overflowY: "auto",
            padding: 6,
            animation: "glass-reveal 180ms var(--ease-decel) both",
          }}
        >
          {error ? (
            <div
              style={{
                padding: "12px 14px",
                fontSize: 12,
                color: "var(--red)",
                background: "var(--red-tint)",
                borderRadius: "var(--radius-s)",
              }}
            >
              Adress-Suche nicht erreichbar — manuelle Eingabe weiter möglich.
            </div>
          ) : matches.length === 0 && !busy ? (
            <div
              style={{
                padding: "12px 14px",
                fontSize: 12.5,
                color: "var(--fg-3)",
                fontStyle: "italic",
              }}
            >
              Keine Treffer. Tippe weiter oder gib die Adresse manuell ein.
            </div>
          ) : (
            matches.map((m, i) => {
              const active = i === activeIdx;
              return (
                <button
                  key={`${m.label}-${m.lat}-${m.lng}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onPointerDown={(e) => {
                    // PointerDown statt onClick — sonst greift der Outside-Click
                    // vor dem onClick und das Dropdown schließt zuerst.
                    e.preventDefault();
                    pickMatch(m);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "var(--radius-s)",
                    background: active ? "var(--glass-3)" : "transparent",
                    border: "1px solid transparent",
                    borderColor: active ? "var(--glass-border)" : "transparent",
                    color: "var(--fg)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 120ms var(--ease-smooth)",
                  }}
                >
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: "var(--info-tint)",
                      color: "var(--info)",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {m.osmType === "house" || m.osmType === "street" ? (
                      <MapPin size={14} />
                    ) : (
                      <Search size={14} />
                    )}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--fg)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.label}
                    </span>
                    {m.description ? (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "var(--tracking-caps)",
                          textTransform: "uppercase",
                          color: "var(--fg-3)",
                        }}
                      >
                        {m.description}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
