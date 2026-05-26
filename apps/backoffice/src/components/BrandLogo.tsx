import { useEffect, useState } from "react";

interface Props {
  /** "mark" = nur Schild (kompakt, für Topbar). "full" = inkl. Schriftzug. */
  variant?: "mark" | "full";
  size?: number;
}

/**
 * Markenlogo der FF Eberstalzell.
 *
 * - Versucht zuerst /ff-eberstalzell-logo.png (sobald die offizielle
 *   Logo-Datei dort liegt, übernimmt diese ohne Code-Änderung)
 * - Fallback: /ff-eberstalzell-logo.svg mit Wappen + Schriftzug
 * - Für "mark" wird nur das rote FF-Schild gerendert (perfekt für Topbar)
 */
export function BrandLogo({ variant = "mark", size = 38 }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    // PNG-Check: wenn ein Voll-Logo unter /ff-eberstalzell-logo.png liegt,
    // nutzen wir das (z. B. nach manuellem Upload durch Funktionär).
    fetch("/ff-eberstalzell-logo.png", { method: "HEAD" })
      .then((r) => {
        if (r.ok) setSrc("/ff-eberstalzell-logo.png");
        else setSrc("/ff-eberstalzell-logo.svg");
      })
      .catch(() => setSrc("/ff-eberstalzell-logo.svg"));
  }, []);

  if (variant === "mark") {
    // Roter Schild mit Helm + Beilen — kompakte 38px Marke für Headers
    return (
      <span
        aria-label="FF Eberstalzell"
        style={{
          display: "grid",
          placeItems: "center",
          width: size,
          height: size,
          borderRadius: size > 40 ? 14 : 11,
          background: "#C8102E",
          boxShadow: "0 2px 8px rgba(200,16,46,0.25)",
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 32 38" width={size * 0.62} height={size * 0.74}>
          {/* Schild-Hintergrund */}
          <path
            d="M2 2 H30 V24 L16 36 L2 24 Z"
            fill="#C8102E"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
          />
          {/* Helm */}
          <path
            d="M9 13 Q16 6 23 13 L23 17 H9 Z"
            fill="#F4D6B5"
            stroke="#1A0F08"
            strokeWidth="0.5"
          />
          <rect x="10" y="16" width="12" height="2" fill="#1A0F08" />
          {/* gekreuzte Beile in Gold */}
          <g stroke="#FFD700" strokeWidth="1.6" strokeLinecap="round">
            <line x1="5" y1="20" x2="27" y2="32" />
            <line x1="27" y1="20" x2="5" y2="32" />
          </g>
          {/* Beil-Köpfe */}
          <path d="M3 19 L7 17 L9 21 L5 23 Z" fill="#FFD700" stroke="#1A0F08" strokeWidth="0.4" />
          <path d="M29 19 L25 17 L23 21 L27 23 Z" fill="#FFD700" stroke="#1A0F08" strokeWidth="0.4" />
        </svg>
      </span>
    );
  }

  // Voll-Logo (inkl. Schriftzug) — für Login / Setup
  if (!src) {
    return (
      <div
        style={{
          width: size * 3,
          height: size,
          background: "var(--surface-2)",
          borderRadius: 12,
        }}
      />
    );
  }
  return <img src={src} alt="FF Eberstalzell" style={{ height: size, width: "auto", display: "block" }} />;
}
