import { X } from "lucide-react";
import { AboutSection } from "./AboutSection";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal-Wrap fuer die About-Seite. Wird ueber den "Über" Link im Footer
 * oder Setup-Screen geoeffnet.
 */
export function AboutModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1900,
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        backdropFilter: "blur(12px) saturate(150%)",
        WebkitBackdropFilter: "blur(12px) saturate(150%)",
        animation: "glass-reveal 220ms var(--ease-decel) both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, calc(100% - 24px))",
          maxHeight: "calc(100dvh - 32px)",
          overflow: "auto",
          background: "var(--glass-1)",
          backdropFilter: "var(--blur-1)",
          WebkitBackdropFilter: "var(--blur-1)",
          color: "var(--fg)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--glass-border-strong)",
          boxShadow: "var(--glass-shadow-1)",
          padding: 22,
          animation: "glass-reveal 320ms var(--ease-spring) both",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Über HotDoc
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="icon-btn"
          >
            <X size={16} />
          </button>
        </header>
        <AboutSection />
      </div>
    </div>
  );
}
