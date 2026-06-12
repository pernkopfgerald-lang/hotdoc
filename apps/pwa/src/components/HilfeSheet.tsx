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
 * Kategorien sind beim Öffnen ALLE EXPANDED — der User kann sofort
 * scrollen und alles sehen. Suche filtert live.
 *
 * Layout: zwei feste Elemente (Header + Such-Input) oben, scrollbarer
 * Inhalt darunter. Modal selbst hat feste Position 5vh vom Top und
 * 90vh maximaler Höhe.
 */
export function HilfeSheet({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  // Default: alle Kategorien offen (User-Wunsch "sofort aufklappen")
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(KATEGORIEN.map((k) => k.id)),
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ESC schließt
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Beim Öffnen: State zurücksetzen, alle Kategorien aufklappen
  useEffect(() => {
    if (open) {
      setQuery("");
      setOpenSections(new Set(KATEGORIEN.map((k) => k.id)));
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 0 });
      });
    }
  }, [open]);

  // Volltextsuche
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

  // Bei aktiver Suche: alle gefilterten Kategorien expanded zeigen
  const visibleSections = query.trim()
    ? new Set(filtered.map((k) => k.id))
    : openSections;

  return (
    <>
      {/* Backdrop — separat positioniert, click schließt */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        aria-hidden="true"
      />
      {/* Modal — eigenes z-index über Backdrop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hilfe-title"
        style={{
          position: "fixed",
          top: "5vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(640px, calc(100vw - 32px))",
          height: "90vh",
          maxHeight: "90vh",
          zIndex: 9999,
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header — fix oben */}
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
              flexShrink: 0,
            }}
          >
            <HelpCircle size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              id="hilfe-title"
              style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--fg)" }}
            >
              Hilfe-Center
            </h3>
            <div
              style={{
                fontSize: 14,
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
            aria-label="Schließen"
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
              flexShrink: 0,
            }}
          >
            <X size={20} />
          </button>
        </header>

        {/* Such-Input — fix unter Header */}
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
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="In der Hilfe suchen — z. B. Abschluss, Atemschutz, Übergabe …"
              style={{
                width: "100%",
                padding: "10px 38px 10px 38px",
                fontSize: 17.5,
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
                fontSize: 14,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: totalHits === 0 ? "var(--warn)" : "var(--fg-3)",
              }}
            >
              {totalHits} Treffer
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
            background: "var(--bg)",
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
                      background: "var(--surface)",
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
                            fontSize: 17.5,
                            fontWeight: 700,
                            color: "var(--fg)",
                          }}
                        >
                          {kat.titel}
                        </div>
                        <div
                          style={{
                            fontSize: 14,
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
                          gap: 12,
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

          {/* Footer */}
          <div
            style={{
              marginTop: 18,
              padding: "12px 14px",
              background: "var(--info-tint)",
              border: "1px solid var(--blue-border)",
              borderRadius: 10,
              fontSize: 15.5,
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
              Wende dich an einen Funktionär der FF Eberstalzell oder schreibe
              in den HotDoc-Test-WhatsApp-Chat. Je konkreter du beschreibst was
              du gemacht hast und was passiert ist, desto schneller lässt sich
              das Problem fixen.
            </div>
          </div>
        </div>
      </div>
    </>
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
      <div style={{ fontSize: 17.5, fontWeight: 700, color: "var(--fg)" }}>
        Nichts gefunden zu '{query}'
      </div>
      <div style={{ fontSize: 15.5, color: "var(--fg-2)", lineHeight: 1.55 }}>
        Versuche kürzere Begriffe oder Synonyme.
        Tipp: 'Mannschaft', 'Atemschutz', 'PDF', 'Handy'.
      </div>
    </div>
  );
}

function FaqEintrag({ item, query }: { item: FaqItem; query: string }) {
  const q = query.trim();
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 17.5,
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
          fontSize: 16.5,
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
                fontSize: 13,
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
  {
    id: "erste-schritte",
    titel: "Erste Schritte",
    icon: <BookOpen size={16} />,
    color: "var(--info)",
    tint: "var(--info-tint)",
    items: [
      {
        frage: "Wofür ist HotDoc?",
        antwort:
          "HotDoc ist der digitale Einsatzbericht der FF Eberstalzell. Ersetzt das Klemmbrett im Fahrzeug: " +
          "Mannschaft erfassen, Atemschutz-Trupps eintragen, Strecke automatisch, Chronik per Diktat, " +
          "PDF-Endbericht auf Knopfdruck. Zentral koordiniert über die Florianstation im Gerätehaus.",
        tags: ["was ist das", "zweck", "überblick"],
      },
      {
        frage: "Wie melde ich mich auf einem Tablet an?",
        antwort:
          "Beim ersten Start: Du siehst die Fahrzeug-Auswahl. Tippe auf das Fahrzeug, das dieses Tablet vertritt " +
          "(z. B. TLF-A 4000). Dann erscheint ein Bestätigungs-Dialog mit PIN-Eingabe. " +
          "Den PIN bekommst du vom Funktionär oder aus der Test-WhatsApp.\n\n" +
          "Nach korrekter PIN ist das Tablet als dieses Fahrzeug registriert — dauerhaft, bis ein " +
          "Funktionär es zurücksetzt.",
        tags: ["pin", "login", "anmelden", "setup"],
      },
      {
        frage: "Wie wechsle ich das Fahrzeug am Tablet?",
        antwort:
          "Oben in der Topbar gibt es den Button 'Fahrzeug wechseln'. Tippe ihn an, wähle das neue Fahrzeug. " +
          "Achtung: dabei werden nicht-abgespeicherte Eingaben aus dem laufenden Bericht verworfen — wenn " +
          "ein Auftrag läuft, vorher abschließen oder bewusst verwerfen.",
        tags: ["umstellen", "anderes auto", "kdo tlf lfa-b mtf"],
      },
      {
        frage: "Was ist die Florianstation?",
        antwort:
          "Die Florianstation (Funkrufname 'Florian Eberstalzell') ist die Einsatz-Zentrale im FF-Haus. " +
          "Dort sitzt der Einsatzleiter, sieht alle Fahrzeuge live, füllt den Hauptbericht, weist Personal " +
          "zu und schließt am Ende ab. Auf den Fahrzeug-Tablets siehst du jeweils nur den eigenen " +
          "Fahrzeugbericht, in der Florianstation alles zusammen.",
        tags: ["zentrale", "einsatzleitung", "el"],
      },
    ],
  },
  {
    id: "einsatz-anlegen",
    titel: "Einsatz anlegen & führen",
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
          "Bei der manuellen Anlage wählst du den Typ:\n" +
          "  · Einsatz ohne Alarm — z. B. Türöffnung, Tierrettung\n" +
          "  · Lotsendienst — Begleitung für Polizei/Rettung\n" +
          "  · Übung — interne Schulung mit Atemschutz-Zeiten\n\n" +
          "Anschließend Adresse eintragen oder GPS übernehmen, optional Stichwort, fertig.",
        tags: ["neu", "manuell", "plus", "anlegen", "blaulichtsms"],
      },
      {
        frage: "Wie wähle ich das Einsatz-Stichwort?",
        antwort:
          "Im 'Neuer Einsatz'-Dialog ist eine Liste von Stichwörtern — alphabetisch sortiert. " +
          "Du kannst oben tippen um zu filtern (z. B. 'Brand' zeigt nur Brand-Stichworte). " +
          "Häufig verwendete Stichworte erscheinen ganz oben unter 'Häufig'.\n\n" +
          "Wenn dein Stichwort nicht dabei ist: das Feld 'Eigenes Stichwort' darunter — Freitext.",
        tags: ["stichwort", "einsatzart", "kategorie", "brand technisch"],
      },
      {
        frage: "Wie füge ich Mannschaft hinzu?",
        antwort:
          "Im Fahrzeugbericht gibt es Slots für Fahrer, Fahrzeug-Kdt und Mannschaft. " +
          "Tippe auf den leeren Slot — die Personen-Auswahl öffnet sich (synchronisiert mit syBOS). " +
          "Suche nach Name oder Dienstgrad, tippe die Person an. Fertig.\n\n" +
          "Pro Person kannst du zusätzlich 'Atemschutz aktiv' (AS) anhaken — wichtig für die " +
          "Atemschutz-Erfassung.",
        tags: ["personal", "kameraden", "fahrer", "kdt", "kommandant"],
      },
      {
        frage: "Wie trage ich Geräte ein?",
        antwort:
          "In der Sektion 'Geräte' sind die Smart-Chips: Atemschutzgeräte, Löschdecke, " +
          "Notstromaggregat usw. Tippe die Chips an, die im Einsatz verwendet wurden — " +
          "fertig. Mehrfach-Auswahl möglich.",
        tags: ["material", "ausrüstung", "lösch", "pumpe"],
      },
      {
        frage: "Was ist ein Folge-Auftrag?",
        antwort:
          "Ein neuer Einsatz, der während des aktuellen Berichts hinzukommt — z. B. Brand → " +
          "direkt anschließend Verkehrsunfall an gleicher Stelle. " +
          "Personal (Fahrer, Kdt, Mannschaft) wird automatisch übernommen, du musst nicht alles " +
          "neu eintippen.\n\n" +
          "So legst du an: Plus-Button in der Tab-Leiste → 'Einsatz ohne Alarm' → die Mannschaft " +
          "ist schon befüllt.",
        tags: ["nachfolger", "anschluss", "übernehmen personal"],
      },
      {
        frage: "Wie schließe ich den Fahrzeugbericht ab?",
        antwort:
          "Unten im Bericht: roter Button 'Fahrzeugbericht abschließen'. Vorher checkt das Tablet " +
          "ob alle Pflichtfelder gefüllt sind (Fahrer, Kdt, mind. eine Mannschafts-Person, " +
          "Einsatzort). Bei Lücken zeigt das Tablet was fehlt.\n\n" +
          "Nach Bestätigung wird der Bericht an die Florianstation gesendet, der Einsatzleiter " +
          "schließt dort den Hauptauftrag.",
        tags: ["fertig", "abschluss", "senden", "übermitteln"],
      },
    ],
  },
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
          "  · Aktive Aufträge als Tab-Leiste oben — Wechsel per Tipp.\n\n" +
          "Alles live: was die Fahrzeug-Tablets tippen, siehst du sofort.",
        tags: ["zentrale", "übersicht", "hauptbericht"],
      },
      {
        // AUDIT-12/EL-15 (b): Die Zuweisung passiert NICHT im Anlage-Dialog,
        // sondern in der Sektion "Fahrzeug-Disposition" im Hauptbericht-Editor.
        frage: "Wie weise ich Fahrzeuge einem Einsatz zu?",
        antwort:
          "In der Florian-Zentrale gibt es im Hauptbericht-Editor die Sektion " +
          "'Fahrzeug-Disposition'. Keine Auswahl → alle Fahrzeug-Tablets sehen den " +
          "Einsatz (Default bei BlaulichtSMS-Alarm). Eine Auswahl filtert die " +
          "Sichtbarkeit auf die markierten Fahrzeuge — nützlich z. B. bei Sturm, " +
          "um Adressen aufzuteilen.\n\n" +
          "Der jeweilige Fahrzeug-Kdt entscheidet am Tablet, ob das Fahrzeug ausrückt.",
        tags: ["disposition", "fahrzeug zuteilen", "alarmieren", "sichtbarkeit"],
      },
      {
        // AUDIT-12/EL-15 (a): reale Button-Beschriftung + Fundort + Brand-Sonderfall.
        frage: "Wie schließe ich den Einsatz (Hauptbericht) ab?",
        antwort:
          "In der Sektion 'Abschluss & PDF' (unten im Hauptbericht) sitzt der rote " +
          "Button 'Einsatz abschließen & archivieren'. Klick → Bestätigungs-Dialog " +
          "(inkl. Verrechenbar-Abfrage) → Bericht wird schreibgeschützt archiviert; " +
          "das PDF holst du über den Button 'PDF-Bericht' in derselben Sektion.\n\n" +
          "Bei Brandeinsätzen öffnet sich zuerst der syBOS-Brand-Statistik-Assistent, " +
          "danach die Abschluss-Bestätigung.\n\n" +
          "Falls ein Fahrzeug-Kdt den Tablet-Bericht NICHT mehr abschließen kann (z. B. Akku " +
          "leer, Tablet defekt): du kannst per 'Trotzdem abschliessen (mit Grund)' den " +
          "Override-Pfad nehmen. Der Grund wandert ins Audit-Log und auf das PDF.",
        tags: ["beenden", "ende", "pdf erzeugen", "override", "hauptauftrag", "archivieren"],
      },
      {
        // AUDIT-12/EL-15 (d): an die echten Fahrzeug-Badges angeglichen
        // (Status kommt aus den Fahrzeugberichten, nicht aus dem GPS-Ping).
        frage: "Was bedeuten die Status-Farben bei den Fahrzeugen?",
        antwort:
          "  · Grün — Fahrzeugbericht abgeschlossen\n" +
          "  · Gelb/Amber — im Einsatz (Bericht in Arbeit)\n" +
          "  · Grau — wartend (noch kein Fahrzeugbericht angelegt)\n\n" +
          "Auf der Lagekarte zeigt zusätzlich ein 'offline seit …'-Label, wenn ein " +
          "Tablet länger keine Position gesendet hat.",
        tags: ["ampel", "farbe", "online offline", "badge"],
      },
      {
        frage: "Was zeigt 'AS-Träger am Fahrzeug'?",
        antwort:
          "Die Anzahl Atemschutz-Geräteträger, die in der Mannschaft eingetragen sind und " +
          "AS-Markierung gesetzt haben. Es ist KEINE Atemschutz-ÜBERWACHUNG (Trupp-Timer) — " +
          "nur eine Verfügbarkeits-Anzeige für die Einsatzleitung.\n\n" +
          "Beispiel: '3 AS-Träger am Fz' = 3 Personen könnten unter PA gehen.",
        tags: ["atemschutz", "pa", "pressluftatmer", "trupp"],
      },
    ],
  },
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
          "Bei 'Uhrzeit bis': wenn du das Feld leer lässt, wird beim Abschluss automatisch " +
          "die aktuelle Uhrzeit eingetragen. Wenn du selbst was eintippst, bleibt deine Eingabe " +
          "erhalten — und 'manuell überschrieben' wird daneben angezeigt.",
        tags: ["uhrzeit", "von bis", "alarmierung"],
      },
      // AUDIT-12/EL-15 (c): Vidierung-Eintrag ERSATZLOS entfernt — das
      // Feature existiert in der PWA nicht (einziger Treffer war dieser
      // Hilfetext selbst).
      {
        frage: "Was bedeutet 'aktiv' vs. 'abgeschlossen'?",
        antwort:
          "  · Aktiv — Bericht in Bearbeitung, Änderungen möglich, Tab sichtbar\n" +
          "  · Abgeschlossen — Bericht fertig, schreibgeschützt, Tab verschwindet aus der " +
          "Leiste. Nur noch im Archiv sichtbar.\n\n" +
          "Reaktivieren geht über das Archiv (Florian-Zentrale oder Fahrzeug-Tablet) — " +
          "immer mit Grund-Pflicht, der Grund landet im Audit-Log und auf dem PDF.",
        tags: ["status", "fertig", "archiv", "reaktivieren"],
      },
      {
        frage: "Was passiert wenn ein Einsatz lange offen bleibt?",
        antwort:
          "Wenn ein Einsatz 6 Stunden lang keine Änderung sieht (kein Mannschafts-Update, " +
          "kein Geräte-Klick, kein Diktat), wird er automatisch abgeschlossen — mit " +
          "Hinweis 'Auto-Abschluss nach 6 h Inaktivität'.\n\n" +
          "Das passiert weil sonst vergessene Einsätze die Statistik blockieren. Falls das " +
          "passiert obwohl ihr aktiv gearbeitet habt: Reaktivieren über Florian-Archiv mit " +
          "Grund.",
        tags: ["auto-close", "vergessen", "inaktiv"],
      },
    ],
  },
  {
    id: "spezialfaelle",
    titel: "Spezialfälle (Übung, Lotsendienst, Öl …)",
    icon: <AlertCircle size={16} />,
    color: "var(--warn)",
    tint: "var(--warn-tint)",
    items: [
      {
        frage: "Wie lege ich eine Übung an?",
        antwort:
          "Florian: Plus-Button → 'Übung'. Du gibst ein:\n" +
          "  · Übungs-Thema (Freitext)\n" +
          "  · Übungsleiter (Person aus dem syBOS-Verzeichnis)\n" +
          "  · Übungs-Typ (Atemschutz, THL, Höhenrettung, Sanität, Funk, Bewerb …)\n\n" +
          "Anschließend tragen die Fahrzeug-Tablets die Teilnehmer ein wie bei einem Einsatz. " +
          "AS-Stunden werden automatisch erfasst. Endet in der Statistik als Übung, nicht als " +
          "Einsatz.",
        tags: ["schulung", "training", "atemschutz übung"],
      },
      {
        frage: "Wie funktioniert ein Lotsendienst?",
        antwort:
          "Florian: Plus-Button → 'Lotsendienst'. Felder:\n" +
          "  · Auftraggeber (z. B. Bezirkshauptmannschaft, Polizei)\n" +
          "  · Rechnungsadresse (wenn verrechenbar)\n" +
          "  · Strecke / Route (Freitext)\n\n" +
          "Das Fahrzeug-Tablet bekommt den Auftrag, trägt Mannschaft + KM ein. " +
          "Beim PDF gibts einen eigenen Verrechnungs-Block — kann der Sachbearbeiter direkt " +
          "für die Rechnung verwenden.",
        tags: ["begleitung", "konvoi", "verrechnung", "rechnung"],
      },
      {
        frage: "Was ist der Pflichtbereich?",
        antwort:
          "Der Pflichtbereich ist das eigene Gemeindegebiet der FF Eberstalzell. " +
          "Wenn der Einsatzort dort liegt, wird die Box automatisch angekreuzt — du musst " +
          "nichts tun. Änderbar bei Sondersituationen (z. B. überörtliche Hilfe ist " +
          "AUSSERHALB des Pflichtbereichs).",
        tags: ["gemeinde", "einsatzzone", "überörtlich"],
      },
      {
        frage: "Wann brauche ich Ölbindemittel?",
        antwort:
          "Bei Verkehrsunfällen oder anderen Einsätzen mit ausgelaufenen Betriebsstoffen " +
          "(Diesel, Hydrauliköl, Kühlmittel). Trage hier die Anzahl der wirklich verwendeten " +
          "Säcke ein — die Florianstation rechnet das automatisch in den Endbericht.",
        tags: ["öl", "diesel", "säcke", "verkehrsunfall"],
      },
      {
        frage: "Wie tracke ich Atemschutz-Einsätze?",
        antwort:
          "Bei jeder Person in der Mannschafts-Liste kannst du 'Atemschutz aktiv' anhaken. " +
          "Damit ist die Person als Atemschutz-Geräteträger für diesen Einsatz markiert. " +
          "Im PDF erscheint die Person mit AS-Markierung; in der Statistik werden " +
          "AS-Einsatzstunden gezählt.\n\n" +
          "HINWEIS: HotDoc überwacht NICHT die Einsatz-Zeiten (kein Trupp-Timer). " +
          "Das ist Aufgabe der Atemschutz-Überwachung am Gerät (Standard FwDV 7).",
        tags: ["pa", "atemschutztrupp", "geräteträger"],
      },
      {
        frage: "Was bedeutet 'Brand aus' und 'Lage unter Kontrolle'?",
        antwort:
          "Zwei wichtige Zeitmarken bei Brandeinsätzen — werden von der Einsatzleitung in " +
          "der Florianstation eingetragen:\n" +
          "  · Lage unter Kontrolle — Brand greift nicht weiter aus, kein Personen-/Sachgefahr-" +
          "Zuwachs mehr\n" +
          "  · Brand aus — kein Feuer mehr sichtbar (vor Nachlöschen / Brandwache)\n\n" +
          "Beide Felder sind im Bericht-PDF und im syBOS-Spickzettel relevant.",
        tags: ["brandbekämpfung", "löschung", "zeitmarke"],
      },
    ],
  },
  {
    id: "tablet-bedienung",
    titel: "Tablet-Bedienung",
    icon: <Smartphone size={16} />,
    color: "var(--info)",
    tint: "var(--info-tint)",
    items: [
      {
        frage: "Wie übergebe ich an mein Handy?",
        antwort:
          "Falls der Tablet-Akku leer ist oder du das Tablet wegstellen musst: " +
          "Tippe auf das Smartphone-Symbol oben in der Topbar ('Übergeben'). Es erscheint " +
          "ein QR-Code. Scanne ihn mit der Handy-Kamera, dein Handy übernimmt die Sitzung, " +
          "das Tablet loggt sich aus.\n\n" +
          "Der Code ist 5 Minuten gültig. Wenn er abläuft: 'Neuen Code anfordern' tippen.",
        tags: ["handoff", "übergabe", "qr-code", "akku leer"],
      },
      {
        frage: "Wie aktualisiere ich die App?",
        antwort:
          "Wenn ein Update verfügbar ist, erscheint oben ein Banner mit Update verfügbar — v0.1.x. " +
          "Tippe drauf → APK wird heruntergeladen → Tablet installiert das Update " +
          "(kann nach Installation aus unbekannter Quelle erlauben fragen — einmal " +
          "bestätigen). Nach dem Update neu starten.\n\n" +
          "Im Browser (PWA): Tab schließen + neu öffnen, dann zeigt der Service-Worker " +
          "das Update an.",
        tags: ["update", "version", "neue version", "apk"],
      },
      {
        frage: "Funktioniert HotDoc auch offline?",
        antwort:
          "Teilweise. Die App ist Progressive-Web-App — gecachte Daten und das letzte UI " +
          "sind offline verfügbar. ABER: neue Einsätze, BlaulichtSMS-Alarme und Live-Sync " +
          "mit der Florianstation brauchen Netz (WLAN oder Mobilfunk).\n\n" +
          "Im Tablet-Setup hilft Tailscale-VPN damit auch ohne FF-WLAN die Verbindung steht. " +
          "Frag den Funktionär wenn du den Zugang brauchst.",
        tags: ["wlan", "kein netz", "offline-modus", "pwa"],
      },
      {
        frage: "Wie schließe ich einen Tab/Bericht?",
        antwort:
          "An jedem Tab oben siehst du ein X-Symbol. Tippe drauf → Schließen-Dialog mit " +
          "zwei Optionen:\n" +
          "  · 'Bericht jetzt abschliessen & PDF erzeugen' (grün, Standard) — Bericht " +
          "wandert ins Archiv.\n" +
          "  · 'Ohne Speichern verwerfen' (rot, mit 2. Bestätigung + Grund) — Bericht wird " +
          "als verworfen markiert. Nur für Fehlanlagen / Doppel-Einträge.\n\n" +
          "Achtung: Ein Einsatz-Tab betrifft den GESAMTEN Einsatz für alle Fahrzeuge — " +
          "der Dialog zeigt dazu einen roten Warnhinweis und führt durch dieselbe " +
          "Abschluss-Prüfung wie der Abschluss-Button.\n\n" +
          "Abgeschlossene Berichte sind nicht mehr in der Tab-Leiste — nur im Archiv.",
        tags: ["tab schließen", "verwerfen", "abbrechen"],
      },
      {
        frage: "Was tun wenn das Tablet hängt?",
        antwort:
          "1. App neu starten (Wischen → App schließen → wieder öffnen).\n" +
          "2. Tablet neu starten (Power-Knopf 10 s halten → Neu starten).\n" +
          "3. Wenn auch das nicht hilft: an einen Funktionär melden, ggf. Reset im " +
          "About-Dialog (Achtung: das setzt Tablet auf Fahrzeug-Auswahl zurück).",
        tags: ["absturz", "hängt", "reboot", "neu starten"],
      },
    ],
  },
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
          "Rechenzentrum Frankfurt). Verschlüsselt at-rest. Backup täglich.\n\n" +
          "Auf dem Tablet selbst speichert die App nur den Setup-State (Fahrzeug + Token) " +
          "und einen lokalen Cache für Offline-Fähigkeit.",
        tags: ["datenbank", "speicherort", "backup", "couchdb"],
      },
      {
        frage: "Speichert die App automatisch?",
        antwort:
          "Ja. Jede Änderung (Mannschaft, Geräte, KM, Diktat) wird nach ca. 1,5 s automatisch " +
          "an die Florianstation gesendet. Du musst nicht aktiv 'Speichern' drücken.\n\n" +
          "Unten im Footer siehst du den Status: 'Automatisch gespeichert · 14:23'. " +
          "Zusätzlich sichert die App den Arbeitsstand lokal am Gerät — auch ein " +
          "App-Neustart im Funkloch verliert keine Eingaben.",
        tags: ["auto-save", "speichern", "verloren"],
      },
      {
        frage: "Wer kann was sehen?",
        antwort:
          "  · Fahrzeug-Tablet — sieht nur die ihm zugewiesenen Einsätze und den eigenen " +
          "Fahrzeugbericht\n" +
          "  · Florianstation — sieht ALLES (alle aktiven Einsätze, alle Fahrzeugberichte, " +
          "alle Live-Daten)\n" +
          "  · Funktionär / Sachbearbeiter — Zugriff aufs Backoffice mit Username + Passwort " +
          "(Administration, Stammdaten, Archiv)\n\n" +
          "Berichte für andere FF (z. B. Bezirks-FW-Kommando) werden über syBOS " +
          "weitergegeben — nicht direkt aus HotDoc.",
        tags: ["rolle", "berechtigung", "rechte"],
      },
      {
        frage: "Werden Personaldaten an Externe gegeben?",
        antwort:
          "Nein. Personaldaten kommen aus syBOS (offizielle FF-Software in Oberösterreich) " +
          "und bleiben im internen FF-Eberstalzell-System. Die App liest nur Vorname/Nachname/" +
          "Dienstgrad und Atemschutz-Status — keine Adressen, keine Geburtsdaten an Externe.\n\n" +
          "Datenschutz-Hinweis: Test-Phase nur mit Mitgliedern, nicht mit unbeteiligten " +
          "Bürgern oder Externen testen.",
        tags: ["dsgvo", "datenschutz", "personaldaten", "namen"],
      },
    ],
  },
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
          "1. Prüfe ob das Tablet überhaupt online ist (Statusbanner oben).\n" +
          "2. Prüfe ob das Tablet als Fahrzeug registriert ist (Setup-Screen).\n" +
          "3. Im Florianstation: 'Schnittstellen'-Panel zeigt 'BlaulichtSMS letzter Poll vor …'\n" +
          "4. Manuell anlegen über Plus-Button (Einsatz ohne Alarm), wenn der echte Alarm " +
          "verloren ging.\n\n" +
          "Fällt einer Bug auf? An Funktionär melden mit Uhrzeit + Stichwort des verloren " +
          "Alarms.",
        tags: ["alarmierung fehlt", "kein alarm"],
      },
      {
        frage: "Mein Bericht lässt sich nicht abschließen — was fehlt?",
        antwort:
          "Beim Klick auf 'Fahrzeugbericht abschließen' zeigt das Tablet eine Checkliste:\n" +
          "  · Fahrer\n" +
          "  · Fahrzeug-Kommandant (Kdt)\n" +
          "  · Mindestens 1 Person in der Mannschaft\n" +
          "  · Einsatzadresse (wird normalerweise automatisch aus dem Alarm übernommen)\n\n" +
          "Fehlende Punkte kannst du direkt beheben — oder bewusst mit 'Trotzdem " +
          "schließen' übersteuern, wenn ein Punkt für diesen Einsatz nicht zutrifft. " +
          "Wenn gar nichts geht: Funktionär informieren + Screenshot machen.",
        tags: ["pflichtfeld", "fehler beim abschluss", "trotzdem schließen"],
      },
      {
        frage: "Falsche Person eingetragen — wie raus?",
        antwort:
          "Tippe auf die Person in der Mannschafts-Liste — der Personen-Picker öffnet sich. " +
          "Oben rechts: 'Person löschen'. Bestätigen, Slot ist wieder leer.\n\n" +
          "Bei Fahrer/Kdt funktioniert es analog.",
        tags: ["löschen", "rausnehmen", "korrigieren"],
      },
      {
        frage: "GPS-Position stimmt nicht / kommt nicht — was tun?",
        antwort:
          "1. Prüf ob GPS am Tablet aktiviert ist (Android-Einstellungen → Standort).\n" +
          "2. Topbar zeigt GPS-Status: 'GPS gut' (grün), 'GPS schwach' (gelb), 'GPS aus' (rot). " +
          "Bei 'GPS aus' helfen Settings.\n" +
          "3. Im Gerätehaus ist GPS-Empfang manchmal schlecht — sobald das Tablet im Freien " +
          "ist, kommt die Position rein.\n\n" +
          "Adresse manuell eintragen ist immer möglich, das überschreibt die GPS-Position.",
        tags: ["standort", "navigation", "koordinaten"],
      },
      {
        frage: "Wie melde ich einen Bug?",
        antwort:
          "Bitte mit Kontext melden:\n" +
          "  · Was hast du gemacht? (Klick auf …, Eingabe in Feld …)\n" +
          "  · Was hast du erwartet?\n" +
          "  · Was ist tatsächlich passiert?\n" +
          "  · Wenn möglich: Screenshot mit dem Tablet aufnehmen (Power + Vol-Down halten)\n" +
          "  · Im PDF-Footer steht die Versions-Nummer — bitte mitschicken.\n\n" +
          "Senden an: HotDoc-Test-WhatsApp oder direkt an Gerald.",
        tags: ["fehler melden", "report", "bug", "feedback"],
      },
    ],
  },
];
