import { HelpCircle, X } from "lucide-react";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * HilfeSheet — kleine FAQ-Liste mit den haeufigsten Tablet-Fragen.
 *
 * Statisches Sheet, kein Backend. Inhalte in einfacher Sprache,
 * Feuerwehr-Fachwoerter werden direkt im Antworttext erklaert.
 *
 * Wird ueber den "?"-Button in der Topbar geoeffnet (nur Florianstation).
 * Auf den Fahrzeug-Tablets sind die wichtigen Tooltips direkt an den
 * Feldern (Vidierung, Atemschutz, Pflichtbereich, Oelbindemittel,
 * Folge-Auftrag).
 */
export function HilfeSheet({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hilfe-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2400,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          padding: 0,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <HelpCircle size={20} style={{ color: "var(--info)" }} />
          <h3
            id="hilfe-title"
            style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}
          >
            Hilfe &amp; haeufige Fragen
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schliessen"
            className="icon-btn"
            style={{ width: 36, height: 36 }}
          >
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          {FAQ.map((item) => (
            <div key={item.frage}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--fg)",
                  marginBottom: 4,
                }}
              >
                {item.frage}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-2)",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {item.antwort}
              </div>
            </div>
          ))}

          <div
            style={{
              marginTop: 8,
              padding: "10px 12px",
              background: "var(--info-tint)",
              border: "1px solid var(--blue-border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--info)",
              lineHeight: 1.5,
            }}
          >
            Bei Problemen wende dich an einen Funktionaer der FF Eberstalzell
            oder schreibe in den HotDoc-Test-WhatsApp-Chat.
          </div>
        </div>
      </div>
    </div>
  );
}

interface FaqItem {
  frage: string;
  antwort: string;
}

// FAQ-Liste — einfache Sprache, ohne Tech-Jargon. Die Antworten erklaeren
// jeden Fachbegriff (Vidierung, Pflichtbereich, etc.) direkt im Satz.
const FAQ: FaqItem[] = [
  {
    frage: "Wie lege ich einen Einsatz an?",
    antwort:
      "Tippe in der Tab-Leiste oben auf das Plus (+). Dann waehlst du:\n" +
      "  · Einsatz ohne Alarm — z. B. Tueroeffnung, Tierrettung\n" +
      "  · Lotsendienst — Begleitung fuer Polizei/Rettung\n" +
      "  · Uebung — interne Schulung mit Atemschutz-Zeiten\n\n" +
      "Anschliessend Adresse eintragen oder GPS uebernehmen, optional Stichwort, fertig.",
  },
  {
    frage: "Was bedeuten die Zeitmarken im Bericht?",
    antwort:
      "Drei wichtige Uhrzeiten:\n" +
      "  · Alarmierung — kommt automatisch vom BlaulichtSMS\n" +
      "  · Uhrzeit von — Start der Bearbeitung im Fahrzeug\n" +
      "  · Uhrzeit bis — Ende des Einsatzes. Wenn leer, wird beim Abschluss automatisch die aktuelle Uhrzeit eingetragen.",
  },
  {
    frage: "Was tut die Vidierung?",
    antwort:
      "Die Vidierung ist die inhaltliche Pruefung des Berichts durch einen zweiten Funktionaer. Bei BlaulichtSMS-Alarmen mit Personenschaden ist sie Pflicht. Der Hauptbericht wird erst nach erfolgter Vidierung an syBOS uebergeben.",
  },
  {
    frage: "Wie uebergebe ich an mein Handy?",
    antwort:
      "Falls der Tablet-Akku leer ist: Tippe auf das Smartphone-Symbol oben in der Topbar (Uebergeben). Es erscheint ein QR-Code. Scanne ihn mit der Handy-Kamera, dein Handy uebernimmt die Sitzung, das Tablet loggt sich aus.\n\n" +
      "Der Code ist 5 Minuten gueltig. Mit \"Neuer Code anfordern\" kannst du ihn verlaengern.",
  },
  {
    frage: "Was ist der Pflichtbereich?",
    antwort:
      "Der Pflichtbereich ist das eigene Gemeindegebiet der FF Eberstalzell. Wenn der Einsatzort dort liegt, wird die Box automatisch angekreuzt — du musst nichts tun. Aenderbar bei Sondersituationen.",
  },
  {
    frage: "Wann brauche ich Oelbindemittel?",
    antwort:
      "Bei Verkehrsunfaellen oder anderen Einsaetzen mit ausgelaufenen Betriebsstoffen (Diesel, Hydraulikoel). Trage hier die Anzahl der wirklich verwendeten Saecke ein — die Florianstation rechnet das automatisch in den Endbericht.",
  },
  {
    frage: "Was ist ein Folge-Auftrag?",
    antwort:
      "Ein neuer Einsatz, der waehrend des aktuellen Berichts hinzukommt — z. B. Brand → direkt anschliessend Verkehrsunfall an gleicher Stelle. Personal (Fahrer, Kdt, Mannschaft) wird automatisch uebernommen, du musst nicht alles neu eintippen.",
  },
];
