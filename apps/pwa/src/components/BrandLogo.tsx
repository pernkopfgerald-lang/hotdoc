/**
 * Logo wird via Vite-Asset-Import gebunden — Vite generiert beim Build
 * einen hash-versionierten Pfad wie `/assets/ff-eberstalzell-logo-abc123.png`.
 * Das umgeht das Caddy-Cache-Problem: bei jedem Logo-Update kriegt die
 * Datei einen neuen Hash, Browser laden zwangsweise neu — kein
 * "max-age=31536000, immutable"-Lock-In mehr.
 */
import logoUrl from "../assets/ff-eberstalzell-logo.png";

interface Props {
  /**
   * "full" = volles Logo (Wappen + Schriftzug). Standard.
   * "mark" = nur das linke Doppelwappen — kompakt für Topbar etc.
   *          Rendert dasselbe Bild aber clippt rechts den Schriftzug weg.
   */
  variant?: "mark" | "full";
  /** Höhe in Pixeln. Breite skaliert proportional. */
  size?: number;
}

/**
 * Markenlogo der FF Eberstalzell. **Verwendet ausschließlich das
 * offizielle Logo** (importiert als Vite-Asset, kein public/-Pfad).
 * Originalverhältnis 656 × 185 ≈ 3.55 : 1. Bei "mark" zeigen wir nur
 * den linken Wappen-Bereich (≈ 28 % der Breite) damit die Topbar kompakt
 * bleibt.
 */
export function BrandLogo({ variant = "full", size = 56 }: Props) {
  const fullRatio = 656 / 185;
  const markCropFraction = 0.28;

  if (variant === "mark") {
    const height = size;
    const visibleWidth = Math.round(height * fullRatio * markCropFraction);
    const fullWidth = Math.round(height * fullRatio);
    return (
      <span
        aria-label="FF Eberstalzell"
        title="FF Eberstalzell"
        style={{
          display: "inline-block",
          width: visibleWidth,
          height,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <img
          src={logoUrl}
          alt="FF Eberstalzell"
          width={fullWidth}
          height={height}
          style={{ display: "block", objectFit: "contain" }}
        />
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt="Freiwillige Feuerwehr Eberstalzell"
      style={{
        height: size,
        width: "auto",
        maxWidth: "100%",
        display: "block",
      }}
    />
  );
}
