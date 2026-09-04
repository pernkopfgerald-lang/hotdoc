import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Trash2,
  Truck,
  Unlock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, fetchAndOpenBlob } from "../api/client";
import {
  abschluss,
  getEinsatz,
  listFahrzeugberichte,
  loeschenEinsatz,
  reaktivieren,
  type AutoAbschlussGrund,
  type EinsatzListItem,
  type EinsatzTyp,
  type FahrzeugberichtItem,
} from "../api/einsaetze";
import { listPersonen, personName, type PersonItem } from "../api/personen";
import { LifecycleBadges, TypBadge } from "../pages/Verwaltung";

interface Props {
  id: string;
  onChange: () => void;
  /** AUDIT-15 (SF-09): nach erfolgreichem Endgueltig-Loeschen — der
   *  Aufrufer muss die Auswahl leeren BEVOR er neu laedt, sonst bleibt
   *  eine Geist-Detailansicht mit aktiven Buttons stehen. */
  onDeleted: () => void;
}

// ─── D-07: Vollstaendigkeits-Pruefung ────────────────────────

interface FzgZeile {
  fzgId: string;
  kdtPersonId: number | undefined;
  fahrerPersonId: number | undefined;
  mannschaftN: number;
  km: number;
  status: string;
  /** Kein Kdt, kein Fahrer, keine Mannschaft, 0 km, kein Bericht-Text. */
  leer: boolean;
  chips: string[];
}

interface Vollstaendigkeit {
  zeilen: FzgZeile[];
  /** Einsatzweite Warnungen ("kein Fahrzeugbericht", "kein Einsatzleiter"). */
  warnungen: string[];
  /** Alle Chips (einsatzweit + pro Fahrzeug) fuer das Abschluss-Modal. */
  alleChips: string[];
}

/** Fahrzeug-Kennung aus dem Doc; Fallback letztes ID-Segment "fzgber:<einsatz>:<fzg>". */
function fzgKennung(b: FahrzeugberichtItem): string {
  if (typeof b.fahrzeugId === "string" && b.fahrzeugId) return b.fahrzeugId;
  return b._id.split(":").pop() ?? b._id;
}

/**
 * D-07 (Audit R3): Reine Pruef-Funktion — je Fahrzeugbericht eine Zeile
 * (Kdt/Fahrer/Mannschaft/km/Status) plus Warn-Chips. Ein Bericht ohne
 * Kdt, Fahrer, Mannschaft, km und Text ist ein "Phantom" (Tablet hat
 * gestartet, aber niemand hat etwas eingetragen) — dafuer nur EIN Chip
 * statt "Kdt fehlt" + "KM 0", damit der echte Befund nicht untergeht.
 * "kein Einsatzleiter" = kein Fahrzeug-Kdt als EL markiert UND kein
 * einsatzleiterPersonId am Einsatz-Doc (D-04b).
 */
function pruefeVollstaendigkeit(
  doc: EinsatzListItem & Record<string, unknown>,
  berichte: FahrzeugberichtItem[],
): Vollstaendigkeit {
  const zeilen: FzgZeile[] = berichte.map((b) => {
    const mannschaftN = (b.mannschaft ?? []).filter(
      (m) => typeof m.personId === "number" && m.personId > 0,
    ).length;
    const km = typeof b.km?.gefahrenKm === "number" ? b.km.gefahrenKm : 0;
    const kdtPersonId = typeof b.fahrzeugKdtPersonId === "number" ? b.fahrzeugKdtPersonId : undefined;
    const fahrerPersonId = typeof b.fahrerPersonId === "number" ? b.fahrerPersonId : undefined;
    const leer =
      kdtPersonId === undefined &&
      fahrerPersonId === undefined &&
      mannschaftN === 0 &&
      km <= 0 &&
      !(b.taetigkeitsbericht ?? "").trim();
    const chips: string[] = [];
    if (leer) {
      chips.push("leer (Phantom)");
    } else {
      if (kdtPersonId === undefined) chips.push("Kdt fehlt");
      if (km <= 0) chips.push("KM 0");
    }
    return {
      fzgId: fzgKennung(b),
      kdtPersonId,
      fahrerPersonId,
      mannschaftN,
      km,
      status: b.status ?? "in_arbeit",
      leer,
      chips,
    };
  });

  const warnungen: string[] = [];
  if (berichte.length === 0) warnungen.push("kein Fahrzeugbericht");
  const elViaKdt = berichte.some(
    (b) => b.kdtIstEinsatzleiter === true && typeof b.fahrzeugKdtPersonId === "number",
  );
  const elViaDoc = typeof doc.einsatzleiterPersonId === "number";
  if (!elViaKdt && !elViaDoc) warnungen.push("kein Einsatzleiter");

  const alleChips = [
    ...warnungen,
    ...zeilen.flatMap((z) => z.chips.map((c) => `${z.fzgId}: ${c}`)),
  ];
  return { zeilen, warnungen, alleChips };
}

/** D-06: Auto-Abschluss-Grund in Klartext. Unbekannte Gruende roh anzeigen. */
function autoGrundText(grund: AutoAbschlussGrund | undefined): string {
  switch (grund) {
    case "unbefuellt-1h":
      return "1 h ohne Eingaben — Phantom-Bericht";
    case "inaktiv-6h":
      return "6 h ohne Aktivität";
    case "reaktivierung-wieder-geschlossen":
      return "nach Reaktivierung wieder geschlossen";
    default:
      return grund ?? "Grund unbekannt";
  }
}

export function BerichtDetail({ id, onChange, onDeleted }: Props) {
  const [doc, setDoc] = useState<(EinsatzListItem & Record<string, unknown>) | null>(null);
  const [fzgBerichte, setFzgBerichte] = useState<FahrzeugberichtItem[]>([]);
  const [personen, setPersonen] = useState<PersonItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reaktivModal, setReaktivModal] = useState(false);
  const [grund, setGrund] = useState("");
  // Issue 2 (Einsatz-Test 2026-06-02): Loesch-Modal mit Pflicht-Grund.
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteGrund, setDeleteGrund] = useState("");
  // D-10 (Audit R3): Abschluss-Modal statt confirm() — Verrechnung +
  // Vollstaendigkeits-Warnungen vor dem Sperren sichtbar machen.
  const [abschlussModal, setAbschlussModal] = useState(false);
  const [verrechenbar, setVerrechenbar] = useState(false);
  const [rechnungsadresse, setRechnungsadresse] = useState("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Personen einmalig fuer Namens-Aufloesung (Kdt/Fahrer/EL). Fehler still —
  // dann stehen die syBosIds als "#123" da, der Rest funktioniert.
  useEffect(() => {
    let cancelled = false;
    void listPersonen()
      .then((r) => {
        if (!cancelled) setPersonen(r.items);
      })
      .catch(() => {
        /* Fallback: IDs anzeigen */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const d = await getEinsatz(id);
      setDoc(d);
      // D-07: Fahrzeugberichte separat — ein Fehler hier darf die Detail-
      // Ansicht nicht leeren, deshalb eigener catch (Fehlertext bleibt sichtbar).
      try {
        setFzgBerichte(await listFahrzeugberichte(id));
      } catch (e) {
        setFzgBerichte([]);
        setErr(`Fahrzeugberichte konnten nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function openAbschlussModal() {
    if (!doc) return;
    const v = doc.verrechnung as { verrechenbar?: boolean; rechnungsadresse?: string } | undefined;
    // Default: gespeicherter Stand; Lotsendienst ist praktisch immer verrechenbar.
    setVerrechenbar(v?.verrechenbar ?? doc.einsatzTyp === "lotsendienst");
    setRechnungsadresse(v?.rechnungsadresse ?? "");
    setAbschlussModal(true);
  }

  async function onAbschluss() {
    if (!doc) return;
    setBusy(true);
    setErr(null);
    try {
      const istUebung = doc.einsatzTyp === "uebung";
      // clientTs = Zeitpunkt des Klicks — Server lehnt mit 409 stale_abschluss
      // ab, wenn seither jemand reaktiviert hat (L-08).
      await abschluss(
        id,
        istUebung
          ? { clientTs: new Date().toISOString() }
          : { verrechenbar, rechnungsadresse, clientTs: new Date().toISOString() },
      );
      setAbschlussModal(false);
      await load();
      onChange();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr(
          "Abschluss abgelehnt: Der Bericht wurde zwischenzeitlich reaktiviert oder ist bereits abgeschlossen — bitte neu laden.",
        );
        setAbschlussModal(false);
        await load();
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onReaktivieren() {
    // Grund ist optional (User-Wunsch): wer etwas einträgt, gut — wer nicht,
    // hat auch seine Gründe. Kein Mindestlängen-Zwang mehr.
    setBusy(true);
    try {
      await reaktivieren(id, grund.trim());
      setReaktivModal(false);
      setGrund("");
      await load();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLoeschen() {
    // Grund optional (User-Wunsch) — kein Mindestlängen-Zwang.
    setBusy(true);
    try {
      await loeschenEinsatz(id, deleteGrund.trim());
      setDeleteModal(false);
      setDeleteGrund("");
      // Doc ist weg → onDeleted raeumt die Auswahl + laedt die Liste neu.
      // KEIN load() — das wuerde fuer das Tombstone-Doc nur einen 404 ziehen.
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!doc) {
    return (
      <div
        className="card"
        style={{
          textAlign: "center",
          color: "var(--fg-3)",
          fontSize: 14,
          padding: 24,
        }}
      >
        {busy ? "lädt …" : err ?? "—"}
      </div>
    );
  }

  // AUDIT-15: typabhaengige Zusatzfelder aus dem bereits geladenen Doc —
  // defensiv gecastet, weil das Listen-Item-Interface nur die Stammfelder
  // typisiert. berichtNummer kommt erst mit AUDIT-11 (Counter beim Abschluss).
  const verrechnung = doc.verrechnung as
    | { verrechenbar?: boolean; rechnungsadresse?: string }
    | undefined;
  const berichtNummer =
    typeof doc.berichtNummer === "string" ? doc.berichtNummer : undefined;
  const istUebung = doc.einsatzTyp === "uebung";
  const vollst = pruefeVollstaendigkeit(doc, fzgBerichte);
  // D-06: gibt es ueberhaupt einen Lifecycle-Hinweis fuer die Warn-Box?
  const hatLifecycleHinweis =
    doc.verworfen === true ||
    doc.autoAbgeschlossen === true ||
    !!doc.abschlussOverrideHinweis ||
    !!doc.moeglichesDuplikatVon;

  function openBlob(pfad: string) {
    void fetchAndOpenBlob(pfad).catch((e: unknown) => {
      setErr(e instanceof Error ? e.message : String(e));
    });
  }

  return (
    <article className="card">
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--fg)" }}>
            {(doc as { einsatzart?: string; einsatzartFreitext?: string }).einsatzart ??
              (doc as { einsatzartFreitext?: string }).einsatzartFreitext ??
              "(ohne Einsatzart)"}
          </h3>
          <p style={{ marginTop: 4, fontSize: 14, color: "var(--fg-2)" }}>{doc.einsatzort}</p>
          <p
            style={{
              marginTop: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
            }}
          >
            {doc._id}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* AUDIT-15: TypBadge statt Freitext-Kuerzel — eine Wahrheit fuer
              Archiv, Liste und Detail (uebung/lotsendienst waren vorher
              faelschlich als "BlaulichtSMS" etikettiert).
              D-06: LifecycleBadges (verworfen / Phantom / auto-geschlossen +
              Status) aus Verwaltung.tsx — identisch zum Archiv. */}
          <TypBadge typ={(doc.einsatzTyp ?? "alarm") as EinsatzTyp} />
          <LifecycleBadges item={doc} />
        </div>
      </header>

      {err && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--red-tint)",
            color: "var(--red)",
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid var(--red-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertTriangle size={16} /> {err}
        </div>
      )}

      {/* D-06 (Audit R3): Lifecycle-Warn-Box. Rot wenn verworfen (kein
          echter Einsatz), sonst amber. Zeigt Auto-Abschluss-Grund, den
          Abschluss-Override-Hinweis (offene Fahrzeugberichte beim manuellen
          Abschluss) und den Duplikat-Verdacht des Pollers. */}
      {hatLifecycleHinweis && (
        <section
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 12,
            background: doc.verworfen ? "var(--red-tint)" : "var(--warn-tint)",
            border: `1px solid ${doc.verworfen ? "var(--red-border)" : "var(--amber-border)"}`,
            color: "var(--fg)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <header
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: doc.verworfen ? "var(--red)" : "var(--warn)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AlertTriangle size={12} /> Hinweise zum Bericht
          </header>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {doc.verworfen === true && (
              <li>
                <strong>Verworfen:</strong> Vom Phantom-Cleanup als leerer Bericht markiert — kein echter
                Einsatz, keine Berichtsnummer.
              </li>
            )}
            {doc.autoAbgeschlossen === true && (
              <li>
                <strong>Automatisch abgeschlossen:</strong> {autoGrundText(doc.autoAbgeschlossenGrund)}.
              </li>
            )}
            {doc.abschlussOverrideHinweis && (
              <li>
                <strong>Abschluss-Hinweis:</strong> {doc.abschlussOverrideHinweis}
              </li>
            )}
            {doc.moeglichesDuplikatVon && (
              <li>
                <strong>Möglicherweise Duplikat</strong> von{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>{doc.moeglichesDuplikatVon}</span> — bitte
                prüfen, ob derselbe Alarm doppelt angelegt wurde.
              </li>
            )}
          </ul>
        </section>
      )}

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        <Field label="Alarmierung">{formatDateTime((doc as { alarmierungZeit: string }).alarmierungZeit)}</Field>
        <Field label="Status">{doc.status}</Field>
        <Field label="Schreibschutz">{doc.schreibschutz ? "JA" : "NEIN"}</Field>
        {doc.einsatzende && <Field label="Einsatzende">{formatDateTime(doc.einsatzende)}</Field>}
        {(doc as unknown as { alarmierungAuthor?: string }).alarmierungAuthor && (
          <Field label="Alarmiert von">
            {(doc as unknown as { alarmierungAuthor: string }).alarmierungAuthor}
          </Field>
        )}
        {/* D-04b: Einsatzleiter aus dem Einsatz-Doc (im Florian-Editor pflegbar). */}
        {typeof doc.einsatzleiterPersonId === "number" && (
          <Field label="Einsatzleiter">{personName(personen, doc.einsatzleiterPersonId)}</Field>
        )}
        {/* AUDIT-15: typabhaengige Felder — vorher mussten Schriftfuehrer
            fuer Uebungs-/Lotsendienst-Details das PDF oeffnen. */}
        {berichtNummer && (
          <Field label="Berichts-Nr">
            <span style={{ fontFamily: "var(--font-mono)" }}>{berichtNummer}</span>
          </Field>
        )}
        {doc.einsatzTyp === "uebung" && (
          <>
            <Field label="Übungsthema">{doc.uebungThema ?? "—"}</Field>
            <Field label="Übungsleiter">{doc.uebungsleiter ?? "—"}</Field>
            <Field label="Übungstyp">{doc.uebungsTyp ?? "—"}</Field>
          </>
        )}
        {doc.einsatzTyp === "lotsendienst" && (
          <>
            <Field label="Auftraggeber">{doc.lotsendienstAuftraggeber ?? "—"}</Field>
            <Field label="Route">{doc.lotsendienstRoute ?? "—"}</Field>
          </>
        )}
        {verrechnung?.verrechenbar !== undefined && (
          <Field label="Verrechenbar">{verrechnung.verrechenbar ? "JA" : "NEIN"}</Field>
        )}
        {verrechnung?.rechnungsadresse && (
          <Field label="Rechnungsadresse">{verrechnung.rechnungsadresse}</Field>
        )}
      </dl>

      {/* D-07 (Audit R3): Vollstaendigkeit — eine Zeile je Fahrzeugbericht
          plus Warn-Chips. Vor dem Abschluss sieht der Schriftfuehrer so,
          ob Kdt/Fahrer/km fehlen oder ein Tablet nur ein Phantom hinterlassen
          hat, ohne jedes PDF zu oeffnen. */}
      <section
        style={{
          marginTop: 20,
          padding: 14,
          borderRadius: 12,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Truck size={12} /> Vollständigkeit · {fzgBerichte.length} Fahrzeugbericht
            {fzgBerichte.length === 1 ? "" : "e"}
          </span>
          <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {vollst.warnungen.length === 0 && vollst.zeilen.every((z) => z.chips.length === 0) ? (
              <span className="badge ok" style={{ gap: 4 }}>
                <CheckCircle2 size={10} /> vollständig
              </span>
            ) : (
              vollst.warnungen.map((w) => (
                <span key={w} className="badge warn" style={{ gap: 4 }}>
                  <AlertTriangle size={10} /> {w}
                </span>
              ))
            )}
          </span>
        </header>
        {vollst.zeilen.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--fg-3)" }}>
            Noch kein Fahrzeug hat einen Bericht angelegt.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={vollTh}>Fahrzeug</th>
                <th style={vollTh}>Kdt</th>
                <th style={vollTh}>Fahrer</th>
                <th style={vollTh}>Mannschaft</th>
                <th style={vollTh}>km</th>
                <th style={vollTh}>Status</th>
                <th style={vollTh}>Hinweise</th>
              </tr>
            </thead>
            <tbody>
              {vollst.zeilen.map((z) => (
                <tr
                  key={z.fzgId}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    opacity: z.leer ? 0.6 : 1,
                  }}
                >
                  <td style={vollTd}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{z.fzgId}</span>
                  </td>
                  <td style={vollTd}>
                    {z.kdtPersonId !== undefined ? personName(personen, z.kdtPersonId) : "—"}
                  </td>
                  <td style={vollTd}>
                    {z.fahrerPersonId !== undefined ? personName(personen, z.fahrerPersonId) : "—"}
                  </td>
                  <td style={vollTd}>
                    <span className="num">{z.mannschaftN}</span>
                  </td>
                  <td style={vollTd}>
                    <span className="num">{z.km}</span>
                  </td>
                  <td style={vollTd}>
                    <span className={z.status === "abgeschlossen" ? "badge ok" : "badge warn"}>
                      {z.status === "abgeschlossen" ? "fertig" : "offen"}
                    </span>
                  </td>
                  <td style={vollTd}>
                    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                      {z.chips.map((c) => (
                        <span
                          key={c}
                          className={c === "leer (Phantom)" ? "badge neutral" : "badge warn"}
                          style={{ gap: 4 }}
                        >
                          {c}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {doc.reaktivierungen && doc.reaktivierungen.length > 0 && (
        <section
          style={{
            marginTop: 20,
            padding: 14,
            borderRadius: 12,
            background: "var(--warn-tint)",
            border: "1px solid var(--amber-border)",
          }}
        >
          <header
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--warn)",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AlertTriangle size={12} /> Reaktivierungs-Audit
          </header>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {doc.reaktivierungen.map((r, i) => (
              <li
                key={i}
                style={{
                  borderLeft: "2px solid var(--warn)",
                  paddingLeft: 10,
                  fontSize: 12,
                  color: "var(--fg)",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>
                  {formatDateTime(r.am)}
                </span>{" "}
                · {r.grund}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {doc.status === "aktiv" ? (
          <button
            type="button"
            onClick={openAbschlussModal}
            disabled={busy}
            className="cta"
            style={{
              width: "auto",
              padding: "12px 18px",
              fontSize: 14,
              background: "linear-gradient(180deg, var(--ok) 0%, color-mix(in srgb, var(--ok) 70%, #000) 100%)",
              boxShadow: "0 4px 12px rgba(22, 163, 74, 0.30)",
            }}
          >
            <CheckCircle2 size={16} /> Abschließen …
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setReaktivModal(true)}
            disabled={busy}
            className="cta"
            style={{
              width: "auto",
              padding: "12px 18px",
              fontSize: 14,
              background: "linear-gradient(180deg, var(--warn) 0%, color-mix(in srgb, var(--warn) 70%, #000) 100%)",
              boxShadow: "0 4px 12px rgba(217, 119, 6, 0.30)",
            }}
          >
            <Unlock size={16} /> Reaktivieren …
          </button>
        )}
        {/* AUDIT-15 (SF-05/SF-12): PDF + syBOS-Spickzettel direkt aus dem
            Backoffice-Arbeitsplatz oeffnen. Blob-Fetch mit Bearer-Header
            (window.open ohne Auth → 403), identische Nutzung im ArchivPanel. */}
        <button
          type="button"
          onClick={() => openBlob(`/api/einsaetze/${encodeURIComponent(id)}/pdf`)}
          disabled={busy}
          className="cta"
          style={{
            width: "auto",
            padding: "12px 18px",
            fontSize: 14,
            background: "linear-gradient(180deg, var(--info) 0%, color-mix(in srgb, var(--info) 70%, #000) 100%)",
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.30)",
          }}
          title="PDF-Bericht in neuem Tab öffnen"
        >
          <FileText size={16} /> PDF öffnen
        </button>
        <button
          type="button"
          onClick={() => openBlob(`/api/einsaetze/${encodeURIComponent(id)}/spickzettel`)}
          disabled={busy}
          className="cta"
          style={{
            width: "auto",
            padding: "12px 18px",
            fontSize: 14,
            background: "transparent",
            color: "var(--info)",
            border: "1px solid var(--info)",
          }}
          title="Abtipphilfe für die syBOS-Erfassung (HTML, neuer Tab)"
        >
          <ClipboardList size={16} /> syBOS-Spickzettel
        </button>
        {/* Issue 2 (Einsatz-Test 2026-06-02): Loesch-Button.
            Bewusst sekundaer gestaltet (rot, ohne Schatten) damit er nicht
            zufaellig statt "Abschliessen" geklickt wird. */}
        <button
          type="button"
          onClick={() => setDeleteModal(true)}
          disabled={busy}
          className="cta"
          style={{
            width: "auto",
            padding: "12px 18px",
            fontSize: 14,
            background: "transparent",
            color: "var(--red)",
            border: "1px solid var(--red-border)",
            marginLeft: "auto",
          }}
          title="Endgültig löschen (inkl. aller Fahrzeugberichte und Fotos)"
        >
          <Trash2 size={16} /> Löschen …
        </button>
      </footer>

      {/* D-10 (Audit R3): Abschluss-Modal. Ersetzt das nackte confirm():
          Verrechnung (JA/NEIN + Rechnungsadresse, bei Uebung ausgeblendet —
          der Server ignoriert sie dort ohnehin, U-05) und die D-07-Warnungen
          werden VOR dem Sperren gezeigt. Escape/Abbrechen schliesst ohne
          Wirkung. */}
      {abschlussModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            background: "rgba(0, 0, 0, 0.55)",
            padding: 16,
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAbschlussModal(false);
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 520 }}>
            <h4 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>
              Bericht abschließen
            </h4>
            <p style={{ marginTop: 6, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5 }}>
              Danach ist der Bericht schreibgeschützt und bekommt seine Berichtsnummer. Offene
              Fahrzeugberichte werden mit abgeschlossen. Zum Nachbearbeiten muss reaktiviert werden.
            </p>

            {vollst.alleChips.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 10,
                  background: "var(--warn-tint)",
                  border: "1px solid var(--amber-border)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--warn)",
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <AlertTriangle size={11} /> Unvollständig — trotzdem abschließen?
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {vollst.alleChips.map((c) => (
                    <span key={c} className="badge warn" style={{ gap: 4 }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!istUebung && (
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                <div className="field">
                  <label className="caption">Verrechenbar</label>
                  <div style={{ display: "flex", gap: 16, paddingTop: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                      <input
                        type="radio"
                        name="verrechenbar"
                        checked={verrechenbar}
                        onChange={() => setVerrechenbar(true)}
                        style={{ accentColor: "var(--ok)" }}
                      />
                      JA
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                      <input
                        type="radio"
                        name="verrechenbar"
                        checked={!verrechenbar}
                        onChange={() => setVerrechenbar(false)}
                        style={{ accentColor: "var(--fg-2)" }}
                      />
                      NEIN
                    </label>
                  </div>
                </div>
                <div className="field">
                  <label className="caption">Rechnungsadresse {verrechenbar ? "" : "(optional)"}</label>
                  <textarea
                    value={rechnungsadresse}
                    onChange={(e) => setRechnungsadresse(e.target.value)}
                    rows={2}
                    className="input"
                    style={{ resize: "vertical" }}
                    placeholder="Firma / Name, Straße, PLZ Ort"
                  />
                </div>
              </div>
            )}
            {istUebung && (
              <p style={{ marginTop: 12, fontSize: 12, color: "var(--fg-3)" }}>
                Übungen werden nicht verrechnet — keine Verrechnungsangaben nötig.
              </p>
            )}

            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setAbschlussModal(false)}
                className="themetoggle"
                style={{ width: "auto", padding: "0 14px" }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void onAbschluss()}
                disabled={busy}
                className="cta"
                style={{
                  width: "auto",
                  padding: "10px 16px",
                  fontSize: 14,
                  background: "linear-gradient(180deg, var(--ok) 0%, color-mix(in srgb, var(--ok) 70%, #000) 100%)",
                }}
              >
                <CheckCircle2 size={14} /> {busy ? "schließt ab …" : "Abschließen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reaktivModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            background: "rgba(0, 0, 0, 0.55)",
            padding: 16,
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 480 }}>
            <h4 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>
              Bericht reaktivieren
            </h4>
            <p style={{ marginTop: 6, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5 }}>
              Der Bericht wurde am{" "}
              <strong>{doc.einsatzende ? formatDateTime(doc.einsatzende) : "—"}</strong>{" "}
              abgeschlossen. Eine Reaktivierung wird mit Audit-Trail dokumentiert.
            </p>
            <div className="field" style={{ marginTop: 14 }}>
              <label className="caption">Grund (optional)</label>
              <textarea
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                rows={3}
                className="input"
                style={{ resize: "vertical" }}
              />
            </div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setReaktivModal(false)}
                className="themetoggle"
                style={{ width: "auto", padding: "0 14px" }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={onReaktivieren}
                disabled={busy}
                className="cta"
                style={{
                  width: "auto",
                  padding: "10px 16px",
                  fontSize: 14,
                  background: "linear-gradient(180deg, var(--warn) 0%, color-mix(in srgb, var(--warn) 70%, #000) 100%)",
                }}
              >
                Reaktivieren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue 2 (Einsatz-Test 2026-06-02): Loesch-Bestaetigung. Bewusst
          mit zwei Schritten: Klick auf "Loeschen" → Modal mit Pflicht-
          Grund → "Endgueltig loeschen". Der Trash-Icon-Button verhindert
          versehentliches Loeschen, der Grund ist Audit-Pflicht.
          D-05 (Audit R3): Text nennt jetzt auch die Fotos — die Cascade
          loescht foto:-Docs mit. */}
      {deleteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            background: "rgba(0, 0, 0, 0.55)",
            padding: 16,
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 480, borderColor: "var(--red-border)" }}>
            <h4 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--red)" }}>
              Einsatz endgültig löschen?
            </h4>
            <p style={{ marginTop: 6, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5 }}>
              Der Einsatz <strong>{doc._id}</strong> sowie ALLE zugehörigen Fahrzeugberichte und Fotos
              werden in der Datenbank als gelöscht markiert. Der Audit-Trail behält den Grund + Username,
              der Inhalt der Berichte ist danach NICHT mehr abrufbar. Diese Aktion ist nicht rückgängig zu
              machen.
            </p>
            <div className="field" style={{ marginTop: 14 }}>
              <label className="caption">Grund (optional, für Audit)</label>
              <textarea
                value={deleteGrund}
                onChange={(e) => setDeleteGrund(e.target.value)}
                rows={3}
                className="input"
                style={{ resize: "vertical" }}
                placeholder="z. B. Test-Eintrag aus Sprint 2026-06"
              />
            </div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setDeleteModal(false);
                  setDeleteGrund("");
                }}
                className="themetoggle"
                style={{ width: "auto", padding: "0 14px" }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={onLoeschen}
                disabled={busy}
                className="cta"
                style={{
                  width: "auto",
                  padding: "10px 16px",
                  fontSize: 14,
                  background: "linear-gradient(180deg, var(--red) 0%, color-mix(in srgb, var(--red) 70%, #000) 100%)",
                }}
              >
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

const vollTh: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 6px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--fg-3)",
};

const vollTd: React.CSSProperties = {
  padding: "6px 6px",
  verticalAlign: "middle",
  color: "var(--fg)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <dt className="caption" style={{ marginBottom: 4 }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: "var(--fg)",
        }}
      >
        {children}
      </dd>
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}
