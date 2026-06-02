import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  HelpCircle,
  Radio,
  Search,
  Settings,
  Shield,
  Smartphone,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * HilfeSheet — Hilfe-Center mit Suche und kategorisiertem FAQ.
 *
 * - Sticky Header + Such-Input damit beim Scrollen immer sichtbar
 * - 8 Kategorien mit Icon, kollabierbar
 * - Volltext-Suche live filtert ueber Fragen + Antworten + Tags
 * - Einfache Sprache, FF-Fachbegriffe direkt erklaert
 * - Tabs / Tab-X / "X" zum Schliessen, ESC funktioniert
 *
 * Wird ueber den "?"-Button in der Topbar geoeffnet (nur Florianstation).
 */
export function HilfeSheet({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(["erste-schritte"]),
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ESC zum Schliessen
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Beim Oeffnen: Scroll an den Anfang + State zuruecksetzen
  useEffect(() => {
    if (open) {
      setQuery("");
      setOpenSections(new Set(["erste-schritte"]));
      // Asynchron damit der DOM gerendert ist
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      });
    }
  }, [open]);

  // Volltextsuche: filtert FAQ-Items + zeigt automatisch alle Kategorien
  // expanded wenn Treffer drin sind
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return KATEGORIEN;
    return KATEGORIEN.map((kat) => ({
      ...kat,
      items: kat.items.filter((item) => {
        const haystack = (
          item.frage +
          " " +
          item.antwort +
          " " +
          (item.tags ?? []).join(" ")
        ).toLowerCase();
        return haystack.includes(q);
      }),
    })).filter((kat) => kat.items.length > 0);
  }, [query]);

  // Wenn Suche aktiv: alle Treffer-Kategorien expanded zeigen
  const visibleSections = useMemo(() => {
    if (query.trim()) {
      return new Set(filtered.map((k) => k.id));
    }
    return openSections;
  }, [query, filtered, openSections]);

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!open) return null;

  const totalHits = filtered.reduce((sum, k) => sum + k.items.length, 0);
  const totalEntries = KATEGORIEN.reduce((sum, k) => sum + k.items.length, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hilfe-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2500,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: "16px 16px 24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          height: "100%",
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        {/* Sticky Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--info-tint)",
              color: "var(--info)",
              border: "1px solid var(--blue-border)",
            }}
          >
            <HelpCircle size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              id="hilfe-title"
              style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--fg)" }}
            >
              Hilfe-Center
            </h3>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginTop: 2,
              }}
            >
              {totalEntries} Themen · FF Eberstalzell
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schliessen"
            style={{
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
              borderRadius: 10,
              background: "transparent",
              border: 0,
              color: "var(--fg-2)",
              cursor: "pointer",
            }}
          >
            <X size={20} />
          </button>
        </header>

        {/* Sticky Such-Input */}
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                color: "var(--fg-3)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Frage eingeben — z. B. Vidierung, Atemschutz, Übergabe …"
              style={{
                width: "100%",
                padding: "10px 38px 10px 38px",
                fontSize: 14,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--fg)",
                outline: "none",
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Suche leeren"
                style={{
                  position: "absolute",
                  right: 6,
                  width: 28,
                  height: 28,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 6,
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--fg-3)",
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {query && (
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: totalHits === 0 ? "var(--warn)" : "var(--fg-3)",
              }}
            >
              {totalHits} {totalHits === 1 ? "Treffer" : "Treffer"}
              {totalHits === 0 ? " — andere Begriffe versuchen?" : ""}
            </div>
          )}
        </div>

        {/* Scroll-Container */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 18px 16px",
          }}
        >
          {filtered.length === 0 ? (
            <EmptyState query={query} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((kat) => {
                const expanded = visibleSections.has(kat.id);
                return (
                  <section
                    key={kat.id}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(kat.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        color: "var(--fg)",
                      }}
                    >
                      <span
                        style={{
                          display: "grid",
                          placeItems: "center",
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: kat.tint,
                          color: kat.color,
                          flexShrink: 0,
                        }}
                      >
                        {kat.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "var(--fg)",
                          }}
                        >
                          {kat.titel}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontFamily: "var(--font-mono)",
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--fg-3)",
                            marginTop: 1,
                          }}
                        >
                          {kat.items.length} {kat.items.length === 1 ? "Thema" : "Themen"}
                        </div>
                      </div>
                      {expanded ? (
                        <ChevronUp size={18} style={{ color: "var(--fg-3)" }} />
                      ) : (
                        <ChevronDown size={18} style={{ color: "var(--fg-3)" }} />
                      )}
                    </button>
                    {expanded && (
                      <div
                        style={{
                          padding: "4px 14px 14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 14,
                        }}
                      >
                        {kat.items.map((item) => (
                          <FaqEintrag key={item.frage} item={item} query={query} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {/* Footer-Hinweis */}
          <div
            style={{
              marginTop: 18,
              padding: "12px 14px",
              background: "var(--info-tint)",
              border: "1px solid var(--blue-border)",
              borderRadius: 10,
              fontSize: 12.5,
              color: "var(--info)",
              lineHeight: 1.55,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Frage nicht beantwortet?</strong>
              <br />
              Wende dich an einen Funktionaer der FF Eberstalzell oder schreibe
              in den HotDoc-Test-WhatsApp-Chat. Je konkreter du beschreibst was
              du gemacht hast und was passiert ist, desto schneller laesst sich
              das Problem fixen.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "32px 24px",
        gap: 8,
      }}
    >
      <Search size={32} style={{ color: "var(--fg-3)", marginBottom: 6 }} />
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>
        Nichts gefunden zu &quot;{query}&quot;
      </div>
      <div style={{ fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.55 }}>
        Versuche kuerzere Begriffe oder Synonyme.
        Tipp: &quot;Mannschaft&quot;, &quot;Atemschutz&quot;,
        &quot;PDF&quot;, &quot;Handy&quot;.
      </div>
    </div>
  );
}

function FaqEintrag({ item, query }: { item: FaqItem; query: string }) {
  const q = query.trim();
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--fg)",
          marginBottom: 4,
          lineHeight: 1.35,
        }}
      >
        {highlight(item.frage, q)}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--fg-2)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {highlight(item.antwort, q)}
      </div>
      {item.tags && item.tags.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          {item.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10.5,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                background: "var(--surface-3)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mini-Hilight fuer Such-Treffer im Antwort-Text. */
function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark
        style={{
          background: "var(--warn-tint)",
          color: "var(--fg)",
          padding: "1px 2px",
          borderRadius: 3,
        }}
      >
        {match}
      </mark>
      {highlight(after, query)}
    </>
  );
}

interface FaqItem {
  frage: string;
  antwort: string;
  /** Synonyme / Stichworte fuer Suche — z. B. "PA", "Pressluftatmer" fuer "Atemschutz". */
  tags?: string[];
}

interface Kategorie {
  id: string;
  titel: string;
  icon: ReactNode;
  color: string;
  tint: string;
  items: FaqItem[];
}

// ===================================================================
// HILFE-INHALTE
// ===================================================================
const KATEGORIEN: Kategorie[] = [
  // ───────────────────────────────────────────────────────────────
  {
    id: "erste-schritte",
    titel: "Erste Schritte",
    icon: <BookOpen size={16} />,
    color: "var(--info)",
    tint: "var(--info-tint)",
    items: [
      {
        frage: "Wofuer ist HotDoc?",
        antwort:
          "HotDoc ist der digitale Einsatzbericht der FF Eberstalzell. Ersetzt das Klemmbrett im Fahrzeug: " +
          "Mannschaft erfassen, Atemschutz-Trupps eintragen, Strecke automatisch, Chronik per Diktat, " +
          "PDF-Endbericht auf Knopfdruck. Zentral koordiniert ueber die Florianstation im Geraetehaus.",
        tags: ["was ist das", "zweck", "ueberblick"],
      },
      {
        frage: "Wie melde ich mich auf einem Tablet an?",
        antwort:
          "Beim ersten Start: Du siehst die Fahrzeug-Auswahl. Tippe auf das Fahrzeug, das dieses Tablet vertritt " +
          "(z. B. TLF-A 4000). Dann erscheint ein Bestaetigungs-Dialog mit PIN-Eingabe. " +
          "Den PIN bekommst du vom Funktionaer oder aus der Test-WhatsApp.\n\n" +
          "Nach korrekter PIN ist das Tablet als dieses Fahrzeug registriert — dauerhaft, bis ein " +
          "Funktionaer es zuruecksetzt.",
        tags: ["pin", "login", "anmelden", "setup"],
      },
      {
        frage: "Wie wechsle ich das Fahrzeug am Tablet?",
        antwort:
          "Oben in der Topbar gibt es den Button 'Fahrzeug wechseln'. Tippe ihn an, waehle das neue Fahrzeug. " +
          "Achtung: dabei werden nicht-abgespeicherte Eingaben aus dem laufenden Bericht verworfen — wenn " +
          "ein Auftrag laeuft, vorher abschliessen oder bewusst verwerfen.",
        tags: ["umstellen", "anderes auto", "kdo tlf lfa-b mtf"],
      },
      {
        frage: "Was ist die Florianstation?",
        antwort:
          "Die Florianstation (Funkrufname 'Florian Eberstalzell') ist die Einsatz-Zentrale im FF-Haus. " +
          "Dort sitzt der Einsatzleiter, sieht alle Fahrzeuge live, fuellt den Hauptbericht, weist Personal " +
          "zu und schliesst am Ende ab. Auf den Fahrzeug-Tablets siehst du jeweils nur den eigenen " +
          "Fahrzeugbericht, in der Florianstation alles zusammen.",
        tags: ["zentrale", "einsatzleitung", "el"],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────
  {
    id: "einsatz-anlegen",
    titel: "Einsatz anlegen & fuehren",
    icon: <Flame size={16} />,
    color: "var(--red)",
    tint: "var(--red-tint)",
    items: [
      {
        frage: "Wie lege ich einen Einsatz an?",
        antwort:
          "Zwei Wege:\n" +
          "  1. BlaulichtSMS-Alarm: der Einsatz erscheint automatisch auf allen Tablets, sobald die SMS reinkommt.\n" +
          "  2. Manuell: Tippe in der Tab-Leiste oben auf 'Neuer Einsatz' (Plus-Symbol).\n\n" +
          "Bei der manuellen Anlage waehlst du den Typ:\n" +
          "  · Einsatz ohne Alarm — z. B. Tueroeffnung, Tierrettung\n" +
          "  · Lotsendienst — Begleitung fuer Polizei/Rettung\n" +
          "  · Uebung — interne Schulung mit Atemschutz-Zeiten\n\n" +
          "Anschliessend Adresse eintragen oder GPS uebernehmen, optional Stichwort, fertig.",
        tags: ["neu", "manuell", "plus", "anlegen", "blaulichtsms"],
      },
      {
        frage: "Wie waehle ich das Einsatz-Stichwort?",
        antwort:
          "Im 'Neuer Einsatz'-Dialog ist eine Liste von Stichwoertern — alphabetisch sortiert. " +
          "Du kannst oben tippen um zu filtern (z. B. 'Brand' zeigt nur Brand-Stichworte). " +
          "Haeufig verwendete Stichworte erscheinen ganz oben unter 'Haeufig'.\n\n" +
          "Wenn dein Stichwort nicht dabei ist: das Feld 'Eigenes Stichwort' darunter — Freitext.",
        tags: ["stichwort", "einsatzart", "kategorie", "brand technisch"],
      },
      {
        frage: "Wie fuege ich Mannschaft hinzu?",
        antwort:
          "Im Fahrzeugbericht gibt es Slots fuer Fahrer, Fahrzeug-Kdt und Mannschaft. " +
          "Tippe auf den leeren Slot — die Personen-Auswahl oeffnet sich (synchronisiert mit syBOS). " +
          "Suche nach Name oder Dienstgrad, tippe die Person an. Fertig.\n\n" +
          "Pro Person kannst du zusaetzlich 'Atemschutz aktiv' (AS) anhaken — wichtig fuer die " +
          "Atemschutz-Erfassung.",
        tags: ["personal", "kameraden", "fahrer", "kdt", "kommandant"],
      },
      {
        frage: "Wie trage ich Geraete ein?",
        antwort:
          "In der Sektion 'Geraete' sind die Smart-Chips: Atemschutzgeraete, Loeschdecke, " +
          "Notstromaggregat usw. Tippe die Chips an, die im Einsatz verwendet wurden — " +
          "fertig. Mehrfach-Auswahl moeglich.",
        tags: ["material", "ausruestung", "loesch", "pumpe"],
      },
      {
        frage: "Was ist ein Folge-Auftrag?",
        antwort:
          "Ein neuer Einsatz, der waehrend des aktuellen Berichts hinzukommt — z. B. Brand → " +
          "direkt anschliessend Verkehrsunfall an gleicher Stelle. " +
          "Personal (Fahrer, Kdt, Mannschaft) wird automatisch uebernommen, du musst nicht alles " +
          "neu eintippen.\n\n" +
          "So legst du an: Plus-Button in der Tab-Leiste → 'Einsatz ohne Alarm' → die Mannschaft " +
          "ist schon befuellt.",
        tags: ["nachfolger", "anschluss", "uebernehmen personal"],
      },
      {
        frage: "Wie schliesse ich den Fahrzeugbericht ab?",
        antwort:
          "Unten im Bericht: roter Button 'Fahrzeugbericht abschliessen'. Voher checkt das Tablet " +
          "ob alle Pflichtfelder gefuellt sind (Fahrer, Kdt, mind. eine Mannschafts-Person, " +
          "Einsatzort). Bei Luecken zeigt das Tablet was fehlt.\n\n" +
          "Nach Bestaetigung wird der Bericht an die Florianstation gesendet, der Einsatzleiter " +
          "schliesst dort den Hauptauftrag.",
        tags: ["fertig", "abschluss", "senden", "uebermitteln"],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────
  {
    id: "florianstation",
    titel: "Florianstation (Einsatzleitung)",
    icon: <Radio size={16} />,
    color: "var(--info)",
    tint: "var(--info-tint)",
    items: [
      {
        frage: "Was sehe ich in der Florianstation?",
        antwort:
          "Drei Bereiche:\n" +
          "  · Live-Karte mit allen Fahrzeug-Positionen + Einsatzort\n" +
          "  · Hauptbericht mit allen Stamm-Feldern (Stichwort, Adresse, Zeitmarken, " +
          "Beteiligte Stellen, Meldung Einsatzleitung)\n" +
          "  · Aktive Auftraege als Tab-Leiste oben — Wechsel per Tipp.\n\n" +
          "Alles live: was die Fahrzeug-Tablets tippen, siehst du sofort.",
        tags: ["zentrale", "uebersicht", "hauptbericht"],
      },
      {
        frage: "Wie weise ich Fahrzeuge einem Einsatz zu?",
        antwort:
          "Wenn du im Florian einen manuellen Einsatz anlegst (z. B. Uebung), kannst du im " +
          "Anlage-Dialog Fahrzeuge auswaehlen. Diese bekommen den Einsatz automatisch als " +
          "neuen Auftrag auf ihren Tablets.\n\n" +
          "Bei BlaulichtSMS-Alarmen sind alle Fahrzeuge per Default involviert — sie sehen den " +
          "Auftrag, der jeweilige Kdt entscheidet ob das Fahrzeug ausrueckt.",
        tags: ["disposition", "fahrzeug zuteilen", "alarmieren"],
      },
      {
        frage: "Wie schliesse ich den Hauptauftrag ab?",
        antwort:
          "Wenn alle Fahrzeugberichte abgeschlossen sind, ist der Button 'Hauptauftrag abschliessen' " +
          "aktiv. Klick → Confirm-Dialog → PDF wird erstellt → fertig fuer syBOS.\n\n" +
          "Falls ein Fahrzeug-Kdt den Tablet-Bericht NICHT mehr abschliessen kann (z. B. Akku " +
          "leer, Tablet defekt): du kannst per 'Trotzdem abschliessen (mit Grund)' den " +
          "Override-Pfad nehmen. Dann wird im PDF vermerkt, dass dieser Fahrzeugbericht " +
          "unvollstaendig war.",
        tags: ["beenden", "ende", "pdf erzeugen", "override"],
      },
      {
        frage: "Was bedeuten die Status-Farben bei den Fahrzeugen?",
        antwort:
          "  · Gruen — Fahrzeug ist eingeloggt + sendet aktuelle Position\n" +
          "  · Gelb — Fahrzeug hat sich nicht innerhalb 10 min gemeldet (Position stale)\n" +
          "  · Grau — Fahrzeug nicht in diesem Einsatz oder Tablet offline",
        tags: ["ampel", "farbe", "online offline"],
      },
      {
        frage: "Was zeigt 'AS-Traeger am Fahrzeug'?",
        antwort:
          "Die Anzahl Atemschutz-Geraetetraeger, die in der Mannschaft eingetragen sind und " +
          "AS-Markierung gesetzt haben. Es ist KEINE Atemschutz-UEBERWACHUNG (Trupp-Timer) — " +
          "nur eine Verfuegbarkeits-Anzeige fuer die Einsatzleitung.\n\n" +
          "Beispiel: '3 AS-Traeger am Fz' = 3 Personen koennten unter PA gehen.",
        tags: ["atemschutz", "pa", "pressluftatmer", "trupp"],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────
  {
    id: "zeitmarken-status",
    titel: "Zeitmarken & Status",
    icon: <Clock size={16} />,
    color: "var(--warn)",
    tint: "var(--warn-tint)",
    items: [
      {
        frage: "Was bedeuten die Zeitmarken im Bericht?",
        antwort:
          "Drei wichtige Uhrzeiten:\n" +
          "  · Alarmierung — kommt automatisch vom BlaulichtSMS\n" +
          "  · Uhrzeit von — Start der Bearbeitung im Fahrzeug\n" +
          "  · Uhrzeit bis — Ende des Einsatzes\n\n" +
          "Bei 'Uhrzeit bis': wenn du das Feld leer laesst, wird beim Abschluss automatisch " +
          "die aktuelle Uhrzeit eingetragen. Wenn du selbst was eintippst, bleibt deine Eingabe " +
          "erhalten — und 'manuell ueberschrieben' wird daneben angezeigt.",
        tags: ["uhrzeit", "von bis", "alarmierung"],
      },
      {
        frage: "Was tut die Vidierung?",
        antwort:
          "Die Vidierung ist die inhaltliche Pruefung des Berichts durch einen zweiten Funktionaer. " +
          "Bei BlaulichtSMS-Alarmen mit Personenschaden ist sie Pflicht. " +
          "Der Hauptbericht wird erst nach erfolgter Vidierung an syBOS uebergeben.",
        tags: ["pruefung", "kontrolle", "vier-augen"],
      },
      {
        frage: "Was bedeutet 'aktiv' vs. 'abgeschlossen'?",
        antwort:
          "  · Aktiv — Bericht in Bearbeitung, Aenderungen moeglich, Tab sichtbar\n" +
          "  · Abgeschlossen — Bericht fertig, schreibgeschuetzt, Tab verschwindet aus der " +
          "Leiste. Nur noch im Archiv sichtbar.\n\n" +
          "Reaktivieren ist nur im Florianstation-Archiv durch einen Funktionaer moeglich " +
          "(mit Grund-Pflicht).",
        tags: ["status", "fertig", "archiv"],
      },
      {
        frage: "Was passiert wenn ein Einsatz lange offen bleibt?",
        antwort:
          "Wenn ein Einsatz 6 Stunden lang keine Aenderung sieht (kein Mannschafts-Update, " +
          "kein Geraete-Klick, kein Diktat), wird er automatisch abgeschlossen — mit " +
          "Hinweis 'Auto-Abschluss nach 6 h Inaktivitaet'.\n\n" +
          "Das passiert weil sonst vergessene Einsaetze die Statistik blockieren. Falls das " +
          "passiert obwohl ihr aktiv gearbeitet habt: Reaktivieren ueber Florian-Archiv mit " +
          "Grund.",
        tags: ["auto-close", "vergessen", "inaktiv"],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────
  {
    id: "spezialfaelle",
    titel: "Spezialfaelle (Uebung, Lotsendienst, Oel …)",
    icon: <AlertCircle size={16} />,
    color: "var(--warn)",
    tint: "var(--warn-tint)",
    items: [
      {
        frage: "Wie lege ich eine Uebung an?",
        antwort:
          "Florian: Plus-Button → 'Uebung'. Du gibst ein:\n" +
          "  · Uebungs-Thema (Freitext)\n" +
          "  · Uebungsleiter (Person aus dem syBOS-Verzeichnis)\n" +
          "  · Uebungs-Typ (Atemschutz, THL, Hoehenrettung, Sanitaet, Funk, Bewerb …)\n\n" +
          "Anschliessend tragen die Fahrzeug-Tablets die Teilnehmer ein wie bei einem Einsatz. " +
          "AS-Stunden werden automatisch erfasst. Endet in der Statistik als Uebung, nicht als " +
          "Einsatz.",
        tags: ["schulung", "training", "atemschutz uebung"],
      },
      {
        frage: "Wie funktioniert ein Lotsendienst?",
        antwort:
          "Florian: Plus-Button → 'Lotsendienst'. Felder:\n" +
          "  · Auftraggeber (z. B. Bezirkshauptmannschaft, Polizei)\n" +
          "  · Rechnungsadresse (wenn verrechenbar)\n" +
          "  · Strecke / Route (Freitext)\n\n" +
          "Das Fahrzeug-Tablet bekommt den Auftrag, traegt Mannschaft + KM ein. " +
          "Beim PDF gibt's einen eigenen Verrechnungs-Block — kann der Sachbearbeiter direkt " +
          "fuer die Rechnung verwenden.",
        tags: ["begleitung", "konvoi", "verrechnung", "rechnung"],
      },
      {
        frage: "Was ist der Pflichtbereich?",
        antwort:
          "Der Pflichtbereich ist das eigene Gemeindegebiet der FF Eberstalzell. " +
          "Wenn der Einsatzort dort liegt, wird die Box automatisch angekreuzt — du musst " +
          "nichts tun. Aenderbar bei Sondersituationen (z. B. ueberoertliche Hilfe ist " +
          "AUSSERHALB des Pflichtbereichs).",
        tags: ["gemeinde", "einsatzzone", "ueberoertlich"],
      },
      {
        frage: "Wann brauche ich Oelbindemittel?",
        antwort:
          "Bei Verkehrsunfaellen oder anderen Einsaetzen mit ausgelaufenen Betriebsstoffen " +
          "(Diesel, Hydraulikoel, Kuehlmittel). Trage hier die Anzahl der wirklich verwendeten " +
          "Saecke ein — die Florianstation rechnet das automatisch in den Endbericht.",
        tags: ["oel", "diesel", "saecke", "verkehrsunfall"],
      },
      {
        frage: "Wie tracke ich Atemschutz-Einsaetze?",
        antwort:
          "Bei jeder Person in der Mannschafts-Liste kannst du 'Atemschutz aktiv' anhaken. " +
          "Damit ist die Person als Atemschutz-Geraetetraeger fuer diesen Einsatz markiert. " +
          "Im PDF erscheint die Person mit AS-Markierung; in der Statistik werden " +
          "AS-Einsatzstunden gezaehlt.\n\n" +
          "HINWEIS: HotDoc ueberwacht NICHT die Einsatz-Zeiten (kein Trupp-Timer). " +
          "Das ist Aufgabe der Atemschutz-Ueberwachung am Geraet (Standard FwDV 7).",
        tags: ["pa", "atemschutztrupp", "geraetetraeger"],
      },
      {
        frage: "Was bedeutet 'Brand aus' und 'Lage unter Kontrolle'?",
        antwort:
          "Zwei wichtige Zeitmarken bei Brandeinsaetzen — werden von der Einsatzleitung in " +
          "der Florianstation eingetragen:\n" +
          "  · Lage unter Kontrolle — Brand greift nicht weiter aus, kein Personen-/Sachgefahr-" +
          "Zuwachs mehr\n" +
          "  · Brand aus — kein Feuer mehr sichtbar (vor Nachloeschen / Brandwache)\n\n" +
          "Beide Felder sind im Bericht-PDF und im syBOS-Spickzettel relevant.",
        tags: ["brandbekaempfung", "loeschung", "zeitmarke"],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────
  {
    id: "tablet-bedienung",
    titel: "Tablet-Bedienung",
    icon: <Smartphone size={16} />,
    color: "var(--info)",
    tint: "var(--info-tint)",
    items: [
      {
        frage: "Wie uebergebe ich an mein Handy?",
        antwort:
          "Falls der Tablet-Akku leer ist oder du das Tablet wegstellen musst: " +
          "Tippe auf das Smartphone-Symbol oben in der Topbar ('Uebergeben'). Es erscheint " +
          "ein QR-Code. Scanne ihn mit der Handy-Kamera, dein Handy uebernimmt die Sitzung, " +
          "das Tablet loggt sich aus.\n\n" +
          "Der Code ist 5 Minuten gueltig. Wenn er ablaeuft: 'Neuen Code anfordern' tippen.",
        tags: ["handoff", "uebergabe", "qr-code", "akku leer"],
      },
      {
        frage: "Wie aktualisiere ich die App?",
        antwort:
          "Wenn ein Update verfuegbar ist, erscheint oben ein Banner 'Update verfuegbar — " +
          "v0.1.x'. Tippe drauf → APK wird heruntergeladen → Tablet installiert das Update " +
          "(kann nach 'Installation aus unbekannter Quelle erlauben' fragen — einmal " +
          "bestaetigen). Nach dem Update neu starten.\n\n" +
          "Im Browser (PWA): Tab schliessen + neu oeffnen, dann zeigt der Service-Worker " +
          "das Update an.",
        tags: ["update", "version", "neue version", "apk"],
      },
      {
        frage: "Funktioniert HotDoc auch offline?",
        antwort:
          "Teilweise. Die App ist Progressive-Web-App — gecachte Daten und das letzte UI " +
          "sind offline verfuegbar. ABER: neue Einsaetze, BlaulichtSMS-Alarme und Live-Sync " +
          "mit der Florianstation brauchen Netz (WLAN oder Mobilfunk).\n\n" +
          "Im Tablet-Setup hilft Tailscale-VPN damit auch ohne FF-WLAN die Verbindung steht. " +
          "Frag den Funktionaer wenn du den Zugang brauchst.",
        tags: ["wlan", "kein netz", "offline-modus", "pwa"],
      },
      {
        frage: "Wie schliesse ich einen Tab/Bericht?",
        antwort:
          "An jedem Tab oben siehst du ein X-Symbol. Tippe drauf → Schliessen-Dialog mit " +
          "zwei Optionen:\n" +
          "  · 'Mit Speichern abschliessen' (gruen, Standard) — Bericht wandert ins Archiv, " +
          "PDF wird erzeugt.\n" +
          "  · 'Ohne Speichern verwerfen' (rot, mit 2. Bestaetigung + Grund) — Bericht wird " +
          "als verworfen markiert. Nur fuer Fehlanlagen / Doppel-Eintraege.\n\n" +
          "Abgeschlossene Berichte sind nicht mehr in der Tab-Leiste — nur im Archiv.",
        tags: ["tab schliessen", "verwerfen", "abbrechen"],
      },
      {
        frage: "Was tun wenn das Tablet haengt?",
        antwort:
          "1. App neu starten (Wischen → App schliessen → wieder oeffnen).\n" +
          "2. Tablet neu starten (Power-Knopf 10 s halten → Neu starten).\n" +
          "3. Wenn auch das nicht hilft: an einen Funktionaer melden, ggf. Reset im " +
          "About-Dialog (achtung: das setzt Tablet auf Fahrzeug-Auswahl zurueck).",
        tags: ["absturz", "haengt", "reboot", "neu starten"],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────
  {
    id: "daten-sicherheit",
    titel: "Daten & Sicherheit",
    icon: <Shield size={16} />,
    color: "var(--ok)",
    tint: "var(--ok-tint)",
    items: [
      {
        frage: "Wo werden meine Eingaben gespeichert?",
        antwort:
          "Alle Berichte landen in der CouchDB der FF Eberstalzell (gehostet auf fly.io, " +
          "Rechenzentrum Frankfurt). Verschluesselt at-rest. Backup taeglich.\n\n" +
          "Auf dem Tablet selbst speichert die App nur den Setup-State (Fahrzeug + Token) " +
          "und einen lokalen Cache fuer Offline-Faehigkeit.",
        tags: ["datenbank", "speicherort", "backup", "couchdb"],
      },
      {
        frage: "Speichert die App automatisch?",
        antwort:
          "Ja. Jede Aenderung (Mannschaft, Geraete, KM, Diktat) wird nach 2.5 s automatisch " +
          "an die Florianstation gesendet. Du musst nicht aktiv 'Speichern' druecken.\n\n" +
          "Unten im Footer siehst du den Status: 'Automatisch gespeichert · 14:23'.",
        tags: ["auto-save", "speichern", "verloren"],
      },
      {
        frage: "Wer kann was sehen?",
        antwort:
          "  · Fahrzeug-Tablet — sieht nur die ihm zugewiesenen Einsaetze und den eigenen " +
          "Fahrzeugbericht\n" +
          "  · Florianstation — sieht ALLES (alle aktiven Einsaetze, alle Fahrzeugberichte, " +
          "alle Live-Daten)\n" +
          "  · Funktionaer / Sachbearbeiter — Zugriff aufs Backoffice mit Username + Passwort " +
          "(Administration, Stammdaten, Archiv)\n\n" +
          "Berichte fuer andere FF (z. B. Bezirks-FW-Kommando) werden ueber syBOS " +
          "weitergegeben — nicht direkt aus HotDoc.",
        tags: ["rolle", "berechtigung", "rolle", "rechte"],
      },
      {
        frage: "Werden Personaldaten an Externe gegeben?",
        antwort:
          "Nein. Personaldaten kommen aus syBOS (oeffentliche FF-Software in Oberoesterreich) " +
          "und bleiben im internen FF-Eberstalzell-System. Die App liest nur Vorname/Nachname/" +
          "Dienstgrad und Atemschutz-Status — keine Adressen, keine Geburtsdaten an Externe.\n\n" +
          "Datenschutz-Hinweis: Test-Phase nur mit Mitgliedern, nicht mit unbeteiligten " +
          "Buergern oder Externen testen.",
        tags: ["dsgvo", "datenschutz", "personaldaten", "namen"],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────
  {
    id: "probleme",
    titel: "Bei Problemen",
    icon: <Settings size={16} />,
    color: "var(--warn)",
    tint: "var(--warn-tint)",
    items: [
      {
        frage: "Ein BlaulichtSMS-Alarm ist nicht gekommen — was tun?",
        antwort:
          "1. Pruefe ob das Tablet ueberhaupt online ist (Statusbanner oben).\n" +
          "2. Pruefe ob das Tablet als Fahrzeug registriert ist (Setup-Screen).\n" +
          "3. Im Florianstation: 'Schnittstellen'-Panel zeigt 'BlaulichtSMS letzter Poll vor ...'\n" +
          "4. Manuell anlegen ueber Plus-Button (Einsatz ohne Alarm), wenn der echte Alarm " +
          "verloren ging.\n\n" +
          "Faellt einer Bug auf? An Funktionaer melden mit Uhrzeit + Stichwort des verloren " +
          "Alarms.",
        tags: ["alarmierung fehlt", "kein alarm"],
      },
      {
        frage: "Mein Bericht laesst sich nicht abschliessen — was fehlt?",
        antwort:
          "Beim Klick auf 'Fahrzeugbericht abschliessen' zeigt das Tablet eine Pflichtfeld-" +
          "Pruefung. Folgende Felder sind Pflicht:\n" +
          "  · Fahrer\n" +
          "  · Fahrzeug-Kommandant (Kdt)\n" +
          "  · Mindestens 1 Person in der Mannschaft\n" +
          "  · Einsatzadresse (wird normalerweise automatisch aus dem Alarm uebernommen)\n\n" +
          "Wenn alle gefuellt sind und es immer noch nicht geht: Funktionaer informieren " +
          "+ Screenshot machen.",
        tags: ["pflichtfeld", "fehler beim abschluss"],
      },
      {
        frage: "Falsche Person eingetragen — wie raus?",
        antwort:
          "Tippe auf die Person in der Mannschafts-Liste — der Personen-Picker oeffnet sich. " +
          "Oben rechts: 'Person loeschen'. Bestaetigen, Slot ist wieder leer.\n\n" +
          "Bei Fahrer/Kdt funktioniert es analog.",
        tags: ["loeschen", "rausnehmen", "korrigieren"],
      },
      {
        frage: "GPS-Position stimmt nicht / kommt nicht — was tun?",
        antwort:
          "1. Pruef ob GPS am Tablet aktiviert ist (Android-Einstellungen → Standort).\n" +
          "2. Topbar zeigt GPS-Status: 'GPS gut' (gruen), 'GPS schwach' (gelb), 'GPS aus' (rot). " +
          "Bei 'GPS aus' helfen Settings.\n" +
          "3. Im Geraetehaus ist GPS-Empfang manchmal schlecht — sobald das Tablet im Freien " +
          "ist, kommt die Position rein.\n\n" +
          "Adresse manuell eintragen ist immer moeglich, das ueberschreibt die GPS-Position.",
        tags: ["standort", "navigation", "koordinaten"],
      },
      {
        frage: "Wie melde ich einen Bug?",
        antwort:
          "Bitte mit Kontext melden:\n" +
          "  · Was hast du gemacht? (Klick auf …, Eingabe in Feld …)\n" +
          "  · Was hast du erwartet?\n" +
          "  · Was ist tatsaechlich passiert?\n" +
          "  · Wenn moeglich: Screenshot mit dem Tablet aufnehmen (Power + Vol-Down halten)\n" +
          "  · Im PDF-Footer steht die Versions-Nummer — bitte mitschicken.\n\n" +
          "Senden an: HotDoc-Test-WhatsApp oder direkt an Gerald.",
        tags: ["fehler melden", "report", "bug", "feedback"],
      },
    ],
  },
];
