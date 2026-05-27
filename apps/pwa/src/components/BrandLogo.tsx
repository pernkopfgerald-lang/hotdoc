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
 * offizielle Logo** unter `/ff-eberstalzell-logo.png` — keine SVG-Annäherung,
 * keine selbstgestalteten Wappen. Das Original-Verhältnis ist
 * 656 × 185 ≈ 3.55 : 1 für die Voll-Variante. Bei "mark" zeigen wir nur
 * den linken Wappen-Bereich (≈ 28 % der Breite) damit die Topbar kompakt
 * bleibt.
 */
export function BrandLogo({ variant = "full", size = 56 }: Props) {
  const fullRatio = 656 / 185;
  const markCropFraction = 0.28; // linker Wappen-Bereich des Logos

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
          src="/ff-eberstalzell-logo.png"
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
      src="/ff-eberstalzell-logo.png"
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
