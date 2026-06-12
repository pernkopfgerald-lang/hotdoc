import { AlertTriangle, CheckCircle2, ClipboardList, FileText, Lock, Trash2, Unlock } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAndOpenBlob } from "../api/client";
import {
  abschluss,
  getEinsatz,
  loeschenEinsatz,
  reaktivieren,
  type EinsatzListItem,
  type EinsatzTyp,
} from "../api/einsaetze";
import { TypBadge } from "../pages/Verwaltung";

interface Props {
  id: string;
  onChange: () => void;
  /** AUDIT-15 (SF-09): nach erfolgreichem Endgueltig-Loeschen — der
   *  Aufrufer muss die Auswahl leeren BEVOR er neu laedt, sonst bleibt
   *  eine Geist-Detailansicht mit aktiven Buttons stehen. */
  onDeleted: () => void;
}

export function BerichtDetail({ id, onChange, onDeleted }: Props) {
  const [doc, setDoc] = useState<(EinsatzListItem & Record<string, unknown>) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reaktivModal, setReaktivModal] = useState(false);
  const [grund, setGrund] = useState("");
  // Issue 2 (Einsatz-Test 2026-06-02): Loesch-Modal mit Pflicht-Grund.
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteGrund, setDeleteGrund] = useState("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const d = await getEinsatz(id);
      setDoc(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAbschluss() {
    if (!confirm("Bericht jetzt abschließen? Danach ist er schreibgeschützt.")) return;
    setBusy(true);
    try {
      await abschluss(id);
      await load();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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
              faelschlich als "BlaulichtSMS" etikettiert). */}
          <TypBadge typ={(doc.einsatzTyp ?? "alarm") as EinsatzTyp} />
          {doc.status === "aktiv" ? (
            <span className="badge ok" style={{ gap: 6, padding: "4px 10px" }}>
              <Unlock size={11} /> aktiv
            </span>
          ) : (
            <span className="badge neutral" style={{ gap: 6, padding: "4px 10px" }}>
              <Lock size={11} /> geschützt
            </span>
          )}
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
            onClick={onAbschluss}
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
            <CheckCircle2 size={16} /> Abschließen
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
          title="PDF-Bericht in neuem Tab oeffnen"
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
          title="Abtipphilfe fuer die syBOS-Erfassung (HTML, neuer Tab)"
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
          title="Endgueltig loeschen (inkl. aller Fahrzeugberichte)"
        >
          <Trash2 size={16} /> Löschen …
        </button>
      </footer>

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
          versehentliches Loeschen, der Grund ist Audit-Pflicht. */}
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
              Einsatz endgueltig loeschen?
            </h4>
            <p style={{ marginTop: 6, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5 }}>
              Der Einsatz <strong>{doc._id}</strong> und ALLE Fahrzeugberichte werden in der Datenbank
              als geloescht markiert. Der Audit-Trail behaelt den Grund + Username, der Inhalt der
              Berichte ist danach NICHT mehr abrufbar. Diese Aktion ist nicht rueckgaengig zu machen.
            </p>
            <div className="field" style={{ marginTop: 14 }}>
              <label className="caption">Grund (optional, fuer Audit)</label>
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
                Endgueltig loeschen
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

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
