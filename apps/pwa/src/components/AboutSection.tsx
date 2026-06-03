import { Mail, Phone, ExternalLink } from "lucide-react";
import { RELEASE_NOTES } from "@hotdoc/shared";
import { APP_VERSION, APP_BUILD } from "../version";

/**
 * About-Seite — wird in der Setup-Page (vor Login) und im Florian/Bericht-
 * Footer-Modal angezeigt. Enthaelt:
 *   - Entwickler-Kontakt
 *   - Nutzungsbedingungen + Lizenz
 *   - Vollstaendige Release-Notes-Historie (aus @hotdoc/shared)
 *
 * Wird per Modal aufgerufen — daher hier nur der Content-Block, das
 * Wrap-Modal kommt vom Aufrufer.
 */
export function AboutSection() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        fontFamily: "var(--font-sans)",
        color: "var(--fg)",
      }}
    >
      {/* Header */}
      <div
        className="card"
        style={{
          padding: 22,
          background:
            "linear-gradient(135deg, var(--glass-2), color-mix(in srgb, var(--red) 6%, var(--glass-2)))",
          borderRadius: "var(--radius-l)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background:
                "linear-gradient(135deg, var(--red), var(--red-strong))",
              color: "#fff",
              fontWeight: 700,
              fontSize: 27.5,
              letterSpacing: "-0.02em",
              boxShadow: "var(--glow-red-soft)",
            }}
          >
            HD
          </span>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 27.5,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              HotDoc
            </h2>
            <div
              style={{
                fontSize: 15.5,
                color: "var(--fg-2)",
                marginTop: 2,
              }}
            >
              Einsatzdokumentation für die Freiwillige Feuerwehr Eberstalzell
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 18,
            marginTop: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: "var(--fg-3)",
          }}
        >
          <span>Version {APP_VERSION}</span>
          <span>Build {APP_BUILD}</span>
        </div>
      </div>

      {/* Entwickler */}
      <div className="card" style={{ padding: 22 }}>
        <div
          className="caption"
          style={{ marginBottom: 8, color: "var(--fg-3)" }}
        >
          Entwicklung und Umsetzung
        </div>
        <div
          style={{
            fontSize: 21.5,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Ing. Gerald Pernkopf
        </div>
        <div
          style={{
            fontSize: 16.5,
            color: "var(--red)",
            fontWeight: 600,
            marginTop: 2,
            marginBottom: 14,
          }}
        >
          Ingenieurbüro Pernkopf e.U.
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 16.5,
            color: "var(--fg-2)",
          }}
        >
          <div>Eckhofstraße 6/1, 4653 Eberstalzell</div>
          <a
            href="tel:+436802202099"
            style={{
              color: "var(--red)",
              textDecoration: "none",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Phone size={14} /> 0680 / 220 20 99
          </a>
          <a
            href="mailto:pernkopf.gerald@p-ing.at"
            style={{
              color: "var(--red)",
              textDecoration: "none",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Mail size={14} /> pernkopf.gerald@p-ing.at
          </a>
          <a
            href="https://www.p-ing.at"
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--red)",
              textDecoration: "none",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ExternalLink size={14} /> www.p-ing.at
          </a>
        </div>
      </div>

      {/* Nutzungsbedingungen */}
      <div className="card" style={{ padding: 22 }}>
        <div
          className="caption"
          style={{ marginBottom: 10, color: "var(--fg-3)" }}
        >
          Nutzungsbedingungen und Lizenzhinweise
        </div>
        <div
          style={{
            fontSize: 16.5,
            color: "var(--fg-2)",
            lineHeight: 1.65,
          }}
        >
          <p style={{ margin: "0 0 10px" }}>
            Diese Software wurde speziell für die Nutzung in der Freiwilligen
            Feuerwehr Eberstalzell entwickelt. Mit der Nutzung erkennt der
            Anwender die folgenden Bedingungen an.
          </p>

          <Section title="1. Urheberrecht & Eigentum">
            Das geistige Eigentum, der Quellcode sowie sämtliche
            Urheberrechte an dieser Software liegen ausschließlich bei{" "}
            <b style={{ color: "var(--fg)" }}>Ing. Gerald Pernkopf</b>{" "}
            (nachfolgend „Urheber" genannt).
          </Section>

          <Section title="2. Nutzungsrecht">
            Der Freiwilligen Feuerwehr Eberstalzell wird ein nicht-exklusives,
            zeitlich unbegrenztes Recht eingeräumt, die Software für den
            bestimmungsgemäßen Einsatz- und Übungsbetrieb zu verwenden.
          </Section>

          <Section title="3. Nutzungsbeschränkungen">
            <b>Keine kommerzielle Nutzung:</b> Eine gewerbliche Nutzung,
            Weiterverkauf oder Vermietung an Dritte ist untersagt.
            <br />
            <b>Verbot der Vervielfältigung:</b> Kopien der Software sind —
            abgesehen von notwendigen Datensicherungen im Rahmen des FF-Betriebs
            — nicht gestattet.
            <br />
            <b>Keine Veränderung:</b> Der Nutzer ist nicht berechtigt, die
            Software zu dekompilieren, zu modifizieren, zu erweitern oder
            Teile davon in andere Programme zu integrieren.
          </Section>

          <Section title="4. Ausschluss von Support und Weiterentwicklung">
            Die Software wird in der vorliegenden Form („as is") zur Verfügung
            gestellt. Es besteht kein Anspruch auf technischen Support,
            Wartung oder Hilfestellung bei der Installation. Es besteht keine
            Verpflichtung des Urhebers zu Produktverbesserungen, Updates,
            Fehlerbehebungen oder funktionalen Weiterentwicklungen. Jegliche
            weitere Betreuung erfolgt ausschließlich auf freiwilliger Basis
            nach Absprache.
          </Section>

          <Section title="5. Haftungsausschluss">
            Die Software wurde nach bestem Wissen und Gewissen erstellt. Der
            Urheber übernimmt jedoch keine Haftung für Schäden, die aus der
            Nutzung der Software entstehen (insbesondere Datenverlust oder
            verzögerte Alarmierungen). Die rechtsverbindliche
            Einsatzdokumentation bleibt Sache der Einsatzleitung — HotDoc ist
            ein Werkzeug zur Vereinfachung der Erfassung.
          </Section>
        </div>
      </div>

      {/* Release-Notes */}
      <div className="card" style={{ padding: 22 }}>
        <div
          className="caption"
          style={{ marginBottom: 12, color: "var(--fg-3)" }}
        >
          Release-Notes
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {RELEASE_NOTES.map((r) => (
            <div key={r.version}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 6,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 16.5,
                    fontWeight: 700,
                    color: "var(--red)",
                    letterSpacing: "0.04em",
                  }}
                >
                  v{r.version}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 14,
                    color: "var(--fg-3)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {r.date}
                </span>
                <span
                  style={{
                    fontSize: 15.5,
                    fontWeight: 700,
                    color: "var(--fg)",
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                  }}
                >
                  {r.title}
                </span>
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 16.5,
                  color: "var(--fg-2)",
                  lineHeight: 1.6,
                }}
              >
                {r.bullets.map((b, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontWeight: 700,
          color: "var(--fg)",
          marginBottom: 4,
          fontSize: 17,
        }}
      >
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}
