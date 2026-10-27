# Einsatzdokumentation für die Feuerwehr — Nachbau-Anleitung für KI-Entwicklungswerkzeuge

> **Zweck dieser Datei:** Sie wird einem KI-Entwicklungswerkzeug ("Vibe-Coding-Tool", z. B. Claude Code, Cursor, Lovable, Bolt, Replit, Windsurf …) übergeben. Das Werkzeug soll damit eine **digitale Einsatzdokumentation für eine bestimmte Feuerwehr** bauen — angepasst an deren Fahrzeuge, Abläufe und Besonderheiten.
>
> **Wichtigste Regel:** Das Werkzeug baut **nicht sofort los**. Es führt zuerst ein **ausführliches Interview** (Teil B) mit der Person, die diese Datei eingelesen hat, fasst die Antworten zusammen, lässt sie bestätigen — und erst dann beginnt es zu planen und zu bauen (Teil G).

---

## Inhaltsverzeichnis

- **Teil A** — Anweisungen an das KI-Werkzeug (Arbeitsweise, Spielregeln)
- **Teil B** — Das Interview (Fragenkatalog in Blöcken)
- **Teil C** — Produktbeschreibung: Was die Anwendung können soll
- **Teil D** — Fachliche Regeln und Berechnungen
- **Teil E** — Fachliche Datenstrukturen (konzeptionell)
- **Teil F** — Qualitätsanforderungen, Design, Sicherheit, Tests
- **Teil G** — Vorgehen und Bauphasen
- **Teil H** — Erfahrungen aus der Praxis (typische Stolperfallen)
- **Anhang 1** — Vorlage "Projektprofil" (wird aus dem Interview gefüllt)
- **Anhang 2** — Glossar
- **Anhang 3** — Abnahme-Checkliste

---

# TEIL A — Anweisungen an das KI-Werkzeug

## A.1 Rolle

Du bist Produktentwickler:in und Softwarearchitekt:in für eine **Feuerwehr-Einsatzdokumentation**. Die Person, mit der du sprichst, ist Feuerwehrmitglied (Kommandant:in, Schriftführer:in, EDV-Verantwortliche:r o. ä.) — **keine Softwareentwickler:in**. Sprich einfach, vermeide Fachjargon, erkläre Entscheidungen in einem Satz.

## A.2 Arbeitsweise in vier Schritten

1. **Interview führen** (Teil B). Nicht bauen, bevor es abgeschlossen ist.
2. **Projektprofil schreiben** (Anhang 1) und von der Person **bestätigen lassen**.
3. **Plan vorlegen** (Teil G): welche Bauphasen, was zuerst, was später. Freigabe einholen.
4. **Phasenweise bauen**, nach jeder Phase **zeigen, testen, Rückmeldung einholen**, erst dann die nächste Phase.

## A.3 Spielregeln für das Interview

- **Blockweise fragen**: pro Nachricht **höchstens 5–7 Fragen** aus **einem** Block. Auf Antworten warten.
- **Vorschläge machen**: Zu jeder Frage gibt es unten einen **Standardvorschlag** ("Default"). Biete ihn an ("Wenn ihr keine Besonderheit habt, nehme ich …"), damit die Person oft nur "ja" sagen muss.
- **Nachfragen, nicht raten**: Unklare oder widersprüchliche Antworten zurückspiegeln und klären. Niemals Namen, Fahrzeuge, Personen, Adressen, Nummern oder Zugangsdaten **erfinden**. Fehlendes bleibt ein **markierter Platzhalter** (`TODO: …`).
- **Mitschreiben**: Halte alle Antworten laufend in einer Datei `PROJEKT-PROFIL.md` fest (Struktur siehe Anhang 1). Diese Datei ist die Wahrheit für den Bau.
- **Beispiele anfordern**: Bitte die Person um **Fotos/Scans/PDFs der heute verwendeten Papier- oder Digitalformulare** (Einsatzbericht, Fahrzeugbericht, Übungsbericht, Statistikmeldung). Diese bestimmen das Layout der Ausgabedokumente.
- **Zusammenfassung zum Schluss**: Fasse das Profil auf einer Seite zusammen, frage "Stimmt das so? Fehlt etwas?", und lass es bestätigen.
- **Umfang begrenzen**: Wenn die Person mehr wünscht, als in die erste Version passt, sortiere gemeinsam in **MUSS (Version 1)**, **SOLL (Version 1.1)**, **KANN (später)**.
- **Datenschutz**: Frage nie nach Passwörtern, Zugangsschlüsseln oder privaten Daten einzelner Personen. Zugangsdaten werden später vom Menschen selbst in die Systemeinstellungen eingetragen, nie in den Chat.

## A.4 Spielregeln für den Bau

- **Einfach halten** ("keep it simple and smart"): jede Funktion muss im Einsatzalltag Zeit sparen oder Fehler vermeiden. Gibt es zwei Lösungen, nimm die einfachere.
- **Keine unnötigen Abhängigkeiten**: Bevor du eine zusätzliche Bibliothek einbaust, frage die Person (oder begründe in einem Satz).
- **Nichts Endgültiges ohne Rückfrage**: löschen, überschreiben, veröffentlichen, E-Mails versenden — nur mit ausdrücklicher Zustimmung.
- **Keine Fantasiedaten in der Produktion**: Testdaten sind klar als solche gekennzeichnet und leicht löschbar.
- **Jede Änderung testen**, bevor du sie als fertig meldest. Sage ehrlich, was du **nicht** testen konntest (z. B. echtes Tablet, echte Alarmierung).
- **Alle sichtbaren Texte auf Deutsch** (Österreich/Deutschland/Schweiz je nach Antwort in Block A), einfache Sprache, keine Entwickler-Fehlermeldungen für Endanwender.

---

# TEIL B — Das Interview

> Die Blöcke sind in **sinnvoller Reihenfolge**. Arbeite sie nacheinander ab. Zu jeder Frage: *Warum wichtig* und ein *Default*. Frage-IDs (z. B. `A-03`) dienen dazu, im Projektprofil darauf zu verweisen.

## Block A — Die Feuerwehr und der Rahmen

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| A-01 | Wie heißt die Feuerwehr (offizieller Name), in welcher Gemeinde/Stadt, in welchem Land/Bundesland/Kanton? | Name, Sprachvarianten, Fachbegriffe, Formulare | — |
| A-02 | Freiwillige Feuerwehr, Berufsfeuerwehr, Betriebs- oder Werkfeuerwehr? Wie viele aktive Mitglieder ungefähr? | Größe der Personalliste, Rollenmodell | Freiwillige FF, 40–120 Aktive |
| A-03 | Wie viele Einsätze und Übungen pro Jahr ungefähr? | Datenmenge, Nummerierung, Archivgröße | 50–150 Einsätze, 30–80 Übungen |
| A-04 | Welche Sprache und Schreibweise (z. B. Deutsch-Österreich, Deutsch-Deutschland, Schweizer Hochdeutsch)? Datumsformat? Uhrzeit 24 h? | Texte, Formate | Deutsch (AT), TT.MM.JJJJ, 24 h |
| A-05 | Wer ist die/der "Auftraggeber:in" dieses Projekts und wer entscheidet bei Streitfragen? Wer testet? | Freigaben, Abnahme | Eine Person als Projektleitung |
| A-06 | Gibt es ein Logo und Farben (Corporate Design) der Feuerwehr? Bitte Logo-Datei bereitstellen. | Kopfzeile in Oberfläche und Berichten | Neutrales Rot, Logo hochladen |
| A-07 | Sollen mehrere Feuerwehren (z. B. Gemeinschaftswehr, Abschnitt) die Anwendung nutzen können oder nur diese eine? | "Mandantenfähigkeit" — verändert die ganze Architektur | Nur diese eine Feuerwehr |

## Block B — Fahrzeuge und Ausrüstung

Frage **pro Fahrzeug** (Schleife), bis die Person "fertig" sagt.

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| B-01 | Welche Einsatzfahrzeuge gibt es? (Pro Fahrzeug: **Kürzel**, **voller Name**, **Funkrufname**, **Fahrzeugtyp**) | Fahrzeugliste, Farben, Berichtsvorlagen | — |
| B-02 | Pro Fahrzeug: Wie viele Sitzplätze insgesamt? Davon **Fahrer:in**, **Fahrzeugkommandant:in**, **Mannschaftsplätze**? | Besatzungsfelder, Plausibilitätsprüfung ("nicht mehr Personen als Sitze") | Fahrer + Kommandant + n Mannschaft |
| B-03 | Gibt es **Anhänger** oder Zusatzeinheiten, die **keine eigenen Fahrzeuge** (ohne eigenes Tablet/Bericht) sind, aber im Bericht erscheinen sollen (z. B. Hochwasser-, Rettungs-, Transportanhänger)? Bei welchem Fahrzeug werden sie mitgeführt? | Zusatzauswahl bei Fahrzeug, Haken im Hauptbericht | Anhänger werden beim ziehenden Fahrzeug angehakt |
| B-04 | Gibt es **Geräte, die ohne Fahrzeug** gebucht werden (z. B. Stapler, Lüfter, Stromaggregat) — wer bucht sie (Zentrale)? | Eigene Buchung in der Zentrale | Zentrale bucht Sondergeräte |
| B-05 | Welche **Geräte/Mittel** gibt es pro Fahrzeug, die im Einsatzbericht angekreuzt werden sollen? (Gern als Liste/Excel/Foto der Beladeliste) | Geräteauswahl pro Fahrzeug | Liste je Fahrzeug, später pflegbar |
| B-06 | Gibt es Verbrauchsmaterial mit **Mengen** (z. B. Ölbindemittel-Säcke, Schaummittel-Kanister, Löschwasser in Litern)? Welche und in welcher Einheit? | Zähler/Stepper statt Haken, Abrechnung | Ölbindemittel in Säcken |
| B-07 | Welche Geräte werden **fast immer** genutzt (die sollen oben stehen)? | Sortierung, "häufig/weitere" | Die zuletzt am häufigsten benutzten |
| B-08 | Gibt es **Atemschutz**-Besonderheiten (maximale Einsatzdauer, Überwachungsintervalle, Truppstärke)? | Atemschutz-Zeitüberwachung | Max. 30 min, Schritte à 5 min |
| B-09 | Gibt es Fahrzeuge, die **gleichzeitig in zwei Einsätzen** nicht sein dürfen? (Soll die Anwendung warnen?) | Parallele Einsätze | Ja, Warnung |

## Block C — Personal

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| C-01 | Woher kommt die **Personalliste**? (Verwaltungssoftware, Excel/CSV, manuell pflegen) | Datenimport, Pflegeaufwand | Excel/CSV-Import + manuelle Pflege |
| C-02 | Welche **Daten pro Person** werden benötigt? (Name, Dienstgrad, Kennung, aktiv/inaktiv, Atemschutz-Berechtigung, Führerschein-Klasse, Funktion) | Auswahllisten, Prüfungen | Name, Dienstgrad, aktiv, Atemschutz ja/nein |
| C-03 | Müssen bestimmte Rollen im Bericht **formal** besetzt sein (z. B. Einsatzleiter:in, Fahrzeugkommandant:in, Schriftführer:in/Bearbeiter:in)? | Pflichtfelder | Fahrer + Kommandant Pflicht |
| C-04 | Wer darf **wen** auswählen? (z. B. nur Aktive, auch Jugend/Reserve, Gäste anderer Feuerwehren) | Filter im Personenauswahldialog | Nur Aktive |
| C-05 | Wie ist die **Sortierung** der Namen gewünscht (Nachname Vorname)? Anzeige mit Dienstgrad? | Lesbarkeit | Nachname Vorname + Dienstgrad |
| C-06 | Dürfen Personen im Bericht **mehrfach** vorkommen (z. B. erst Fahrer auf Fahrzeug A, dann Mannschaft auf Fahrzeug B)? Wie soll gezählt werden (Personen oder Plätze)? | Auswertung "Anzahl eingesetzter Personen" | Personen zählen, nicht Plätze |

## Block D — Einsatzarten, Stichworte, Nummerierung

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| D-01 | Welche **Einsatzarten/Stichworte** gibt es (Brand, technischer Einsatz, Verkehrsunfall, Brandmeldeanlage, Wasserschaden …)? Bitte die **vollständige Liste** oder Foto des Alarmkatalogs. | Auswahllisten, Kategorien | Gängige Standardliste, pflegbar |
| D-02 | Wie werden Einsätze in **Kategorien** eingeteilt (z. B. Brand / Technisch / Sonstige)? Gibt es Stufen (z. B. B1–B3, T1–T3)? | Berichtstypen, Nummernkreise, Statistik | Brand/Technisch mit Stufen |
| D-03 | Wie sieht die **Berichtsnummer** aus (z. B. B26-012 = Brand, Jahr 26, laufende Nummer)? Wird pro Kategorie und Jahr hochgezählt? Werden Übungen separat gezählt? | Nummerierungslogik | Kategorie-Buchstabe + Jahr (2-stellig) + laufende Nummer |
| D-04 | Wann wird die Nummer **vergeben** (beim Anlegen, beim Abschluss)? Was passiert bei verworfenen/Fehlalarm-Berichten (Nummer überspringen oder nicht)? | Lücken in der Nummerierung | Beim Abschluss, verworfene bekommen keine |
| D-05 | Gibt es **Alarmstufen** (Nachalarmierung, Alarmstufe 2/3) und **Zeitmarken**, die dokumentiert werden müssen ("Lage unter Kontrolle", "Brand aus", "Einsatzende")? | Zeitmarken-Felder | Lage unter Kontrolle, Brand aus, Alarmstufe 2/3 |
| D-06 | Welche **beteiligten Stellen** kommen vor (Polizei, Rettung, Bezirks-/Abschnittskommando, Energieversorger, Straßenerhalter, Bürgermeister, Gemeindearbeiter …)? | Auswahlliste "Beteiligte Stellen" | Liste, pflegbar |
| D-07 | Welche **anderen Feuerwehren** sind regelmäßig mit dabei (Nachbarwehren)? | Auswahlliste "Sonstige anwesende Feuerwehren" | Liste der Nachbarwehren |
| D-08 | Gibt es **Pflichtbereich/Einsatzzone/Überörtliche Hilfe** o. ä. Zuständigkeitsfelder? | Zusatzfelder im Hauptbericht | Ja/Nein/Unbekannt-Felder |
| D-09 | Welche **Sonderdienste** gibt es außer Einsatz und Übung (z. B. Lotsendienst, Brandwache, Sicherheitsdienst, Tätigkeit für Veranstaltungen)? Brauchen sie eigene Felder (Auftraggeber, Route, Abrechnung)? | Berichtstypen | Einsatz, Übung, ein Sonderdienst-Typ |
| D-10 | Welche **Übungskategorien** gibt es (Atemschutz, Technische Hilfe, Funk, Schulung/Vortrag, Bewerb …)? | Auswahlliste | Standardliste, pflegbar |

## Block E — Alarmierung und Einsatzablauf

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| E-01 | **Wie kommt ein Einsatz in die Anwendung?** (a) Der Bericht wird **manuell** angelegt, (b) automatisch aus einer **Alarmierungs-App/SMS/E-Mail/Leitstellen-Schnittstelle**, (c) beides. Welche Alarmierungsquelle wird heute verwendet? | Ist die Kernfrage für Version 1 | (a) manuell in Version 1, Alarm-Anbindung später |
| E-02 | Wenn automatisch: Was steht im Alarmtext (Stichwort, Adresse, Koordinaten, Meldebild, Einsatznummer)? Bitte 3–5 echte, anonymisierte Beispiele geben. | Auswertung und Zuordnung | — |
| E-03 | Wer legt bei **manuell** den Bericht an — Zentrale, Fahrzeugkommandant, jeder? | Startablauf | Jeder Kommandant am Fahrzeug, Zentrale kann auch |
| E-04 | Gibt es eine **Zentrale/Einsatzleitung** (z. B. im Feuerwehrhaus, "Florian") mit PC/Bildschirm, die den Hauptbericht führt? Oder dokumentiert alles die Fahrzeugmannschaft? | Rollen, Oberflächen | Ja, Zentrale-PC mit Hauptbericht |
| E-05 | Wie arbeiten **mehrere Fahrzeuge** am gleichen Einsatz? (Jedes Fahrzeug führt einen eigenen Fahrzeugbericht, die Zentrale führt den Hauptbericht?) | Kern des Datenmodells | Ja, so |
| E-06 | Soll die Zentrale **live sehen**, welche Fahrzeuge ausgerückt/abgeschlossen sind und wo sie sind (GPS-Positionen)? | Karte/Fahrzeugstatus | Ja |
| E-07 | Soll das Fahrzeug **seine Ankunft** am Einsatzort automatisch erkennen und vorschlagen ("Eingetroffen 14:32 – übernehmen?")? Ab welchem Abstand (z. B. 100 m)? | Komfortfunktion | Ja, 100 m, mit Rückfrage |
| E-08 | Sollen **Wetterdaten zum Alarmzeitpunkt** automatisch in den Bericht? Gibt es eine eigene Wetterstation/Quelle? | Zusatzdaten | Optional, später |
| E-09 | Was soll passieren, wenn ein Einsatz **vergessen** und nicht abgeschlossen wird? (automatisch nach X Stunden schließen, erinnern, nichts) | Aufräumlogik | Automatisch nach 24 h mit Vermerk |
| E-10 | Wer darf einen **abgeschlossenen Bericht wieder öffnen** (reaktivieren), und soll das protokolliert werden? | Rechte, Nachvollziehbarkeit | Nur Zentrale/Verwaltung, protokolliert (nicht im Bericht) |

## Block F — Bestehende Systeme und Schnittstellen

> Hinweis an das KI-Werkzeug: Hier geht es nur darum, **was die Feuerwehr heute hat und was sie sich wünscht**. Baue keine Anbindung, bevor Art, Rechte und Zugang geklärt und vom Menschen freigegeben sind. Für Version 1 ist "kein direkter Datenaustausch, nur Export" ein völlig legitimer Standard.

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| F-01 | Nutzt die Feuerwehr eine **Verwaltungssoftware** (z. B. syBOS in Österreich, FeuerOn, Florix, ein Landes-/Bundesverbandsportal, eigene Excel-Listen)? Welche? | Datenimport/-export, Meldewesen | — |
| F-02 | Was soll aus dieser Software **in die Anwendung** kommen? (Personalliste, Fahrzeuge, Geräte, Einsatzstichworte) — **nur lesen**? | Stammdaten | Personalliste per Datei-Import |
| F-03 | Was soll **aus der Anwendung heraus**? (Berichte per PDF, Daten als Datei für Meldewesen, Übernahme in die Verwaltungssoftware — manuell abtippen mit "Spickzettel" oder automatisch) | Ausgabeformate | PDF + strukturierte Datei, manuelles Abtippen |
| F-04 | Gibt es eine **Schnittstelle** (offiziell dokumentiert, Zugangsdaten vorhanden) oder müsste man "über die Oberfläche" arbeiten? Wer vergibt den Zugang? | Machbarkeit, Rechte | Keine Schnittstelle in Version 1 |
| F-05 | Dürfen Daten **in die Verwaltungssoftware zurückgeschrieben** werden, oder ist das verboten/ungewollt? | Risiko für Fremdsysteme | Nein, nur lesen/exportieren |
| F-06 | Gibt es eine **Alarmierungs-/Leitstellen-Software** mit Datenzugang (siehe E-01)? | Automatischer Einsatzstart | Später |
| F-07 | Gibt es eine **Wasserentnahmestellen-/Hydranten-Datenbank**, Objektpläne, Gefahrgut-Kataster? Als Datei vorhanden? | Kartenebenen, Hilfen | Später, optional |
| F-08 | Gibt es ein **Mailsystem** (Postfach, SMTP-Zugang) für automatische Berichtsmails? Wer richtet das ein? | E-Mail-Versand | Zugang trägt der Mensch selbst in die Einstellungen ein |

## Block G — Berichte, Formulare, Ausgaben

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| G-01 | **Bitte alle heute verwendeten Formulare** zeigen (Foto/PDF): Einsatzbericht, Fahrzeugbericht, Übungsbericht, Sonderdienst, Statistikmeldung. | Layout und Pflichtfelder der PDF-Ausgabe | Ein Hauptbericht (A4, eine Seite) + Fahrzeugberichte als Anhang |
| G-02 | Soll der Hauptbericht **immer auf einer A4-Seite** Platz finden? Was passiert bei sehr langer Chronik (zweite Seite)? | Layout-Regel | Eine Seite, bei sehr vielen Einträgen automatisch zweite Seite |
| G-03 | Wer **unterschreibt** (Einsatzleiter:in, Bearbeiter:in)? Papier-Unterschrift oder digital? | Unterschriftenfelder | Leeres Unterschriftsfeld zum Ausdrucken |
| G-04 | Soll beim **Abschluss automatisch eine E-Mail** mit dem PDF an eine Adresse gehen? An wen? Auch eine **maschinenlesbare Datei** (z. B. Markdown/CSV/JSON) zur Weiterverarbeitung? | Mailfunktion | PDF + Textdatei an eine Info-Adresse |
| G-05 | Sollen in der Mail auch die **verwendeten Geräte** stehen (Liste für die Gerätewartung/Nachbereitung)? | Nachbereitung | Ja |
| G-06 | Welche **Fotos/Dokumente** sollen in den Bericht? Foto-Raster am Ende? Dürfen auch PDFs (Pläne, Messprotokolle) angehängt werden? | Anhänge | Fotos im Raster, PDFs als Mail-Anhang |
| G-07 | Gibt es **Pflichtangaben für Statistik/Meldewesen** (z. B. Brand-Ursache, Verletzte/Tote, Sachschaden, Gefahrstoffe, Rettungsarten)? Bitte das aktuelle Formular geben. | Zusatzblöcke im Hauptbericht | Später, erst Basisbericht |
| G-08 | Soll es eine **Papier-Notfall-Vorlage** (leeres Formular zum Ausdrucken) geben? | Ausfallsicherheit | Ja, später |

## Block H — Hardware, Orte, Netz

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| H-01 | Welche **Geräte** sind in den Fahrzeugen (Tablet-Modell, Android/iPad), welche in der Zentrale (PC/Laptop, Bildschirmgröße), welche privat (Handy)? | Bedienung, Bildschirmgrößen, App-Form | Android-Tablets, PC, Handys |
| H-02 | Haben die Tablets **dauerhaft Internet** (SIM) oder nur im Feuerwehrhaus-WLAN? Wie ist der **Mobilfunkempfang** im Einsatzgebiet? | Offline-Fähigkeit (Kern!) | Offline-fähig, Daten werden nachgesendet |
| H-03 | Wie wird bedient: **Handschuhe**, Touch, im Fahrzeug bei Fahrt, bei Dunkelheit? | Große Tasten, Kontrast, Dunkelmodus | Große Tasten (44 px), Hell- und Dunkelmodus |
| H-04 | Soll es eine **installierbare App** sein (Startbildschirm-Symbol, Vollbild) oder reicht eine Webseite im Browser? | Verteilung | Installierbare Web-App (PWA), optional Android-Paket |
| H-05 | Wie werden Tablets **eingerichtet** (jemand geht rum, oder per QR-Code/Link)? | Einrichtungsablauf | Einmalige Fahrzeugauswahl + PIN |
| H-06 | Dürfen Mitglieder mit dem **privaten Handy** auf den Bericht des Fahrzeugs (z. B. per QR-Code im Führerhaus)? Soll dabei die Handy-Position **nicht** als Fahrzeugposition gelten? | Zugang ohne Tablet | Ja, per QR-Code, ohne GPS-Weitergabe |
| H-07 | Wo steht der **Zentralrechner**/PC? Läuft der oft den ganzen Tag? Zweiter Bildschirm für die Karte? | Zentralen-Oberfläche | Ein PC, optional zweiter Bildschirm |

## Block I — Rollen, Zugang, Datenschutz

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| I-01 | Welche **Rollen** soll es geben? (Mannschaft am Fahrzeug, Zentrale/Einsatzleitung, Verwaltung/Administration, nur lesen) | Rechtekonzept | Diese vier |
| I-02 | Wie melden sich Personen an? **Fahrzeug-PIN** am Tablet, persönliche Konten, Anmeldung über vorhandenes Konto (Microsoft/Google)? | Anmeldung | PIN pro Fahrzeug, Konten für Zentrale/Verwaltung |
| I-03 | **Wo laufen die Daten?** Eigener Server der Feuerwehr, Cloud-Anbieter, Gemeinde-Rechenzentrum? Gibt es Vorgaben (EU-Standort, DSGVO, Gemeinde-IT)? | Hosting, Datenschutz | EU-Cloud-Hosting mit Verschlüsselung |
| I-04 | Welche Daten sind **personenbezogen**? Wie lange dürfen/müssen Berichte **aufbewahrt** werden? Wer darf sie sehen? | Löschfristen, Zugriff | Aufbewahrung nach Vorgabe der Behörde |
| I-05 | Soll jede wichtige Aktion (Abschluss, Wiederöffnen, Löschen, Einstellungsänderung) **protokolliert** werden (Wer/Wann/Was)? | Nachvollziehbarkeit | Ja |
| I-06 | Wer richtet **Updates** ein und betreibt das System (Kosten, Wartung, Ansprechperson)? | Betrieb | Eine technikaffine Person + Anleitung |

## Block J — Besonderheiten und Wünsche

| ID | Frage | Warum wichtig | Default |
|---|---|---|---|
| J-01 | Welche **Besonderheiten** hat eure Feuerwehr, die in keiner Standardlösung vorkommen? (Autobahn, Bahn, Fluss/Hochwasser, Industrie, Gefahrgut, Flughafen, Tunnel, Bergrettung …) | Zusatzfelder und Listen | — |
| J-02 | Welche **Zusatzkräfte/Stellen** treten bei euch regelmäßig auf (Straßenerhalter, Betriebsfeuerwehr, Bergrettung …)? | Auswahllisten | Siehe D-06 |
| J-03 | Welche **Fehler/Ärgernisse** gibt es heute am Papier- oder Digitalprozess (vergessene Zeiten, doppelte Eingaben, unleserliche Schrift, fehlende Gerätelisten)? | Wichtigste Verbesserungen | — |
| J-04 | Welche **Auswertungen/Statistiken** braucht der Kommandant (Einsätze pro Monat, Mannschaftsstunden, Atemschutz-Stunden, Kilometer, Übungsstunden)? | Statistikseite | Standard-Kennzahlen |
| J-05 | Soll es **Erinnerungen/Prüfungen** beim Abschluss geben (z. B. "Gerät X fehlt bei Stichwort Y")? Wer pflegt die Regeln? | Plausibilitätsregeln | Regeln pflegbar, zuerst nur als Hinweis |
| J-06 | Was ist **ausdrücklich nicht gewünscht**? (z. B. Alarmierungs-App ersetzen, Mitteilungen an alle Kameraden, Buchhaltung) | Abgrenzung | Kein Ersatz für Alarmierung/Verwaltung |
| J-07 | Welche **Namen/Begriffe** sollen in der Oberfläche anders heißen als im Standard (z. B. "Zentrale" statt "Einsatzleitung")? | Sprache der Mannschaft | Eigene Begriffe verwenden |
| J-08 | Gibt es **Fristen/Termine** (Pilotbetrieb, Start in der Saison, Schulung)? | Planung | Pilot mit einem Fahrzeug zuerst |

## Block K — Abschluss des Interviews

1. Fasse **alles auf einer Seite** zusammen (Anhang 1).
2. Liste **offene Punkte** (`TODO`).
3. Schlage **Version 1 (MUSS)**, **Version 1.1 (SOLL)** und **später (KANN)** vor.
4. Frage: "Darf ich mit Phase 1 beginnen?" — erst bei "Ja" weiter zu Teil G.

---

# TEIL C — Produktbeschreibung: Was die Anwendung können soll

Die Anwendung besteht aus **drei Oberflächen**, die auf **gemeinsamen Daten** arbeiten:

1. **Fahrzeug-Oberfläche** (Tablet oder Handy): die Besatzung dokumentiert *ihr Fahrzeug* im Einsatz.
2. **Zentrale** (PC, großer Bildschirm): die Einsatzleitung bzw. der/die Schriftführer:in führt den **Hauptbericht**, behält alle Fahrzeuge im Blick und schließt den Einsatz ab.
3. **Verwaltung** (PC): Stammdaten, Listen, Auswertungen, Berichte durchsuchen, Einstellungen.

> Ist die Feuerwehr klein und hat keine Zentrale (Antwort E-04 = nein), kann die Zentrale-Oberfläche in die Verwaltung integriert oder stark vereinfacht werden. Entscheidung im Interview.

## C.1 Berichtstypen

| Typ | Beschreibung | Besonderheiten |
|---|---|---|
| **Einsatz mit Alarm** | Entsteht automatisch aus der Alarmierung (falls angebunden) | Stichwort, Adresse, Koordinaten, Alarmzeit werden übernommen |
| **Einsatz ohne Alarm** | Manuell angelegt (z. B. Türöffnung, Tierrettung) | Alarmzeit = Anlegezeit, änderbar |
| **Übung** | Übungsthema, Übungsleiter:in, Übungskategorie | Eigene Optik (Farbe) und eigene Nummerierung; **Reserve zählt als Teilnehmer ohne Fahrzeug** |
| **Sonderdienst** (z. B. Lotsendienst) | Auftraggeber, Route/Strecke | Kilometerabrechnung |

Der Typ ist **auf einen Blick erkennbar** (Farbe/Beschriftung), damit niemand eine Übung mit einem Einsatz verwechselt.

## C.2 Fahrzeug-Oberfläche — Bildschirme und Funktionen

### C.2.1 Einrichtung und Anmeldung

- Beim ersten Start **wählt die Person das Fahrzeug** und gibt die **Fahrzeug-PIN** ein. Danach merkt sich das Gerät das Fahrzeug.
- **Fahrzeug wechseln** ist jederzeit möglich (Schaltfläche in der Kopfzeile, Auswahlliste der Fahrzeuge).
- **Kopfzeile:** Logo, **gut sichtbares Label des angemeldeten Fahrzeugs** (Kürzel, großer Name, Funkrufname), Status der GPS-Ortung, Uhrzeit/Datum, Hell/Dunkel-Umschalter, Hilfe/Info.
- **Dunkelmodus** und **Hellmodus** (automatisch nach Systemeinstellung, manuell umschaltbar).
- **Update-Hinweis**, wenn eine neue Version bereitsteht.

### C.2.2 Startseite ohne aktiven Einsatz ("Bereit")

- Ruhiger Statusblock ("Kein aktiver Einsatz, bei Alarm öffnet sich der Bericht automatisch").
- Vier große Schaltflächen: **Einsatz ohne Alarm**, **Übung**, **Sonderdienst**, **Archiv**.
- Hinweis zum Synchronisierungsstatus des **letzten** Berichts nur dann, wenn etwas hängt ("wird gesendet, sobald Netz da ist").

### C.2.3 Mehrere Einsätze gleichzeitig (Reiter)

- Oben eine **Reiterleiste** für alle offenen Berichte dieses Fahrzeugs; ein "Neuer Bericht"-Knopf.
- Jeder Reiter zeigt **Einsatzart + Ort** und eine kleine Typfarbe. Der aktive Reiter hat ein "Schließen".
- Abgeschlossene Berichte erscheinen **nicht** mehr in der Leiste (nur im Archiv).

### C.2.4 Berichtsseite (aufgeteilt in Karten, von oben nach unten)

1. **Kopfkarte:** Einsatzart (groß), Ort, Alarmzeit, Stichwort, Typ-Markierung. Hinweis bei fehlendem Einsatzort ("Adresse tippen oder GPS").
2. **Datum & Zeitraum:** Datum, "Uhrzeit von", "Uhrzeit bis". Alle drei sind **antippbar**: Datum über einen **Kalender-Dialog**, Uhrzeit über einen Dialog mit **Plus/Minus-Tasten und manueller Eingabe**. "Auto" bedeutet: Wert kommt vom System (Alarm-/Anlegezeit). Manuell geänderte Werte sind sichtbar markiert. **Eine geänderte Beginnzeit gilt für den gesamten Einsatz**, also für alle Fahrzeuge.
3. **Einsatzort:** Adressfeld mit **Adressvorschlägen**, Schaltfläche "GPS" übernimmt die aktuelle Position (mit Rückfrage während der Fahrt). **Strecke (Hin + Rück)**: automatisch aus der Luftlinie zum Einsatzort × Straßenfaktor, jederzeit **manuell überschreibbar**; Hinweis, wie der Wert entstanden ist.
4. **Besatzung:** **Fahrer:in** und **Fahrzeugkommandant:in** (je genau eine Person; Häkchen "Kommandant ist Einsatzleiter:in"), darunter die **Mannschaftsplätze** (so viele, wie das Fahrzeug Sitzplätze hat). Je Mannschaftsplatz ein **AS-Schalter** (Atemschutz) mit **Zeitüberwachung**. Der Personenauswahl-Dialog erlaubt **Mehrfachauswahl** (außer Fahrer/Kommandant) und begrenzt die Auswahl auf die **freien Plätze**. Bereits eingeteilte Personen sind ausgegraut.
5. **Anhänger** (falls das Fahrzeug welche führen kann): große Schalter, wirken im Hauptbericht.
6. **Geräte & Mittel:** Auswahl-Kacheln je Fahrzeug (Zeile "häufig", dahinter "weitere Geräte"), **Freitextfeld** für Unvorhergesehenes, **Mengen-Zähler** für Verbrauchsmaterial (z. B. Säcke). Optional: Zeile "**Üblich bei <Stichwort>**" mit Ein-Tipp-Übernahme (siehe C.5).
7. **Aufträge/Tätigkeiten:** Auswahl-Kacheln (Brandbekämpfung außen/innen, Atemschutz-Trupp, Verkehrsabsicherung, Wassertransport, Personenrettung, TH, …) plus Freitext. Jede Wahl erscheint auch in der Chronik.
8. **Einsatzchronik:** Zeitlich sortierte Einträge aller Fahrzeuge und der Zentrale. Eingabe per **Text**, **Foto** (Kamera/Datei), optional **Spracheingabe** (Diktat). Eigene Einträge sind **nachträglich korrigierbar**; Fotos erscheinen als Vorschaubild mit Großansicht.
9. **Karte:** eigene Position, Einsatzort, **andere Fahrzeuge**, optional Wasserentnahmestellen; Umschaltung Karte/Luftbild; Vollbild.
10. **Abschlussbereich:** Schaltfläche **Vorschau** (zeigt das PDF) und **Fahrzeugbericht abschließen**.

### C.2.5 Abschluss-Dialog

- Zeigt eine **Prüfliste** mit Haken/Hinweisen: Fahrer eingetragen, Kommandant eingetragen, mindestens eine Person in der Mannschaft, Einsatzadresse gesetzt, Strecke plausibel (nicht unter 1 km bei gesetzter Adresse), Übung: Thema/Kategorie erfasst, Sonderdienst: Auftraggeber erfasst, "Uhrzeit bis" geprüft (bei sehr altem Einsatz).
- **Weiche Hinweise** (gelb) erlauben **"Trotzdem abschließen"**. **Harte Sperren** (rot, z. B. aus Regeln, siehe C.5) erlauben das nicht.
- Optionales Häkchen **"Ganzen Einsatz jetzt abschließen"** — nur gedacht für den Fall, dass dieses Fahrzeug **allein** im Einsatz war.
- Zusammenfassung (Personen, Strecke, Geräte, Aufträge).
- Nach dem Abschluss: Fahrzeugbericht ist **gesperrt**; Wiederöffnen nur durch berechtigte Personen.

### C.2.6 Weitere Funktionen der Fahrzeug-Oberfläche

- **Archiv:** Liste der letzten Berichte dieses Fahrzeugs (Suche nach Stichwort/Ort/Datum), PDF öffnen, Wiederöffnen (falls berechtigt).
- **Handy-Übergabe per QR:** Das Tablet zeigt einen Code, ein Handy scannt ihn und arbeitet danach am selben Bericht weiter. Es gibt auch den Rückweg.
- **QR-Anmeldung ohne Tablet:** Im Führerhaus hängt ein QR-Code je Fahrzeug; wer ihn mit dem **privaten Handy** scannt, landet direkt im Bericht dieses Fahrzeugs (ohne PIN). **Die Handy-Position wird dabei nicht gesendet**, damit sie nicht als Fahrzeugposition gilt.
- **Eintreffzeit per GPS:** Ist das Tablet höchstens 100 m vom Einsatzort entfernt (und die GPS-Genauigkeit ausreichend), erscheint **einmal pro Einsatz** ein Fenster "Eingetroffen 14:32 — übernehmen?" mit **Ja/Nein**. Ja trägt "Eingetroffen am Einsatzort" mit der erkannten Zeit in die Chronik ein.
- **Vorbefüllung/Geräte-Vorschläge** nach Stichwort (C.5).
- **Fehler-Hinweise** immer sichtbar und verständlich (keine stillen Fehlschläge).

## C.3 Zentrale-Oberfläche (Hauptbericht)

Ziel: Die Zentrale **sieht alles auf einen Blick** und **führt den Hauptbericht**.

- **Startseite ohne Einsatz:** ruhiger Statusblock, Schaltflächen *Einsatz anlegen / Übung anlegen / Sonderdienst anlegen / Archiv durchsuchen* (gleich große Kacheln, am Handy 2×2), darunter die **Karte** mit Fahrzeugpositionen.
- **Kopfblock bei aktivem Einsatz:** farbiger Block mit Einsatzart, Ort, Alarmzeit, Stichwort; darunter Kennzahlen: Alarmiert, Fahrzeuge aktiv/gesamt, Mannschaft (bei Übungen: **Teilnehmer**, inkl. Personen ohne Fahrzeug), Berichte fertig/gesamt, **letzte Chronik-Meldung**.
- **Status pro Fahrzeug:** Liste aller Fahrzeuge mit Zustand (wartend, im Einsatz, abgeschlossen, "im Einsatz bei anderem Einsatz"), Kommandant, Personenzahl, Anhänger-Hinweis. **Antippen** zeigt Fahrer/Kommandant/Mannschaft/Atemschutz und springt zur Position auf der Karte. **"Entfernen/Wiederherstellen"**-Knopf je Fahrzeug, falls jemand das falsche Fahrzeug bedient hat (nicht gelöscht, nur aus dem Bericht ausgeklammert).
- **Karte:** Fahrzeugpositionen live, Einsatzort(e) (auch mehrere parallele Einsätze), Wasserentnahmestellen, Karte/Luftbild, Vollbild, optional zweites Fenster für einen **zweiten Bildschirm**.
- **Chronik/Einsatzbericht:** Eingabefeld "Eintrag von der Zentrale"; Schaltfläche **Foto / PDF hinzufügen (JPG, PNG, PDF)** — Text im Feld wird zur Beschreibung; Fotos kommen in das Foto-Raster des Berichts, PDF-Dateien stehen als "Angehängte Dokumente" im Bericht und werden der Info-Mail als Anhang beigelegt (max. ca. 4 MB je PDF). **Alle Einträge sind korrigierbar.** Neueste Meldung steht **oben**.
- **Stammdaten Einsatz:** Datum, Beginn, **Einsatzende (Datum + Uhrzeit, manuell änderbar, unabhängig von den Fahrzeugzeiten)**, Einsatzort, Zuständigkeitsfelder (z. B. Pflichtbereich, Einsatzzone, überörtliche Hilfe), "alarmiert durch", Sondergeräte (z. B. Stapler), Übungskategorie (bei Übungen, auch nachträglich änderbar).
- **Zeitmarken:** Lage unter Kontrolle, Brand aus, Alarmstufe 2/3 (Uhrzeit + Anforderer).
- **Beteiligte Stellen / Sonstige anwesende Feuerwehren:** Mehrfachauswahl aus **pflegbaren Listen** plus Freitext.
- **Bearbeiter:in & Reserve:** Wer führt den Bericht, wer stand **zur Verfügung, ist aber nicht ausgerückt** (Reserve, Mehrfachauswahl). Bei Übungen zählt die Reserve als **Teilnehmer ohne Fahrzeug**.
- **Statistikblöcke** nach Bedarf der Feuerwehr (Brand-/Technische Statistik, Antwort G-07) mit Auswahllisten (Ursache, Tätigkeit, Gefahrstoffe, …).
- **Abschluss & Statistik:** Prüfhinweise (offene Fahrzeugberichte, fehlender Einsatzleiter, fehlende Zeiten), **Abschließen** → vergibt die Berichtsnummer, sperrt den Bericht, erzeugt das PDF, löst optional die Mail aus. **Reaktivieren** (mit optionalem Grund; wird protokolliert, **steht nicht im Bericht**).
- **Archiv:** Suche, PDF öffnen, wiederöffnen.

## C.4 Verwaltung (PC)

Gruppiert in übersichtliche Bereiche:

- **Einsätze:** Berichte-Browser (Filter nach Typ/Jahr/Status, Detailansicht, PDF), Zentrale-Ansicht, Archiv.
- **Auswertung:** **Statistik** (Einsätze/Übungen pro Monat und Typ, Mannschaftsstunden, Atemschutz, Kilometer, Top-Einsatzarten, Übungsstunden nach Kategorie), **Aktivität** (Protokoll: Anmeldungen, Abschlüsse, Wiederöffnungen, Einstellungsänderungen, Prüfungsergebnisse), **Schnittstellen/Systemstatus** (Ampel für externe Dienste).
- **Stammdaten:** Personal (Import + Pflege), **Geräte & Mittel je Fahrzeug** (Chips hinzufügen/umbenennen/löschen), Löschwasser/Wasserentnahmestellen (Import aus Datei), Nummerierung (Beispielvorschau), allgemeine Stammdaten (Funkrufnamen, Heimatposition, Atemschutz-Grenzen).
- **Listen & Stichworte:** Einsatzstichworte, Auftrags-/Tätigkeitstypen, Beteiligte Stellen, Sonstige Feuerwehren, Gefahrstoffe, **Ausrüstungs-Check-Regeln** (C.5).
- **System:** Registrierte Geräte, **Fahrzeug-QR-Codes** (Anzeige, Drucken, Rotieren/Ungültigmachen, **Sammel-PDF mit allen Fahrzeug-Codes auf einer A4-Seite zum zentralen Aushang**), App-Version/Update-Hinweis, Über.
- Änderungen in Listen sind **sofort wirksam**; bei ungespeicherten Änderungen kommt beim Wechsel eine Rückfrage.

## C.5 Ausrüstungs-Check und Vorschläge nach Stichwort

Ziel: Die Mannschaft soll **nichts Übliches vergessen**, ohne dass jemand ständig Hinweise tippen muss.

- Die Verwaltung pflegt **Regeln**: *Stichwort-Muster* → *Fahrzeug* → *Liste von Geräten* → *Prüfart* **MUSS** oder **INFO** → optional *gültig ab* und *Notiz*.
- **Stichwort-Muster** mit Platzhaltern (`*` = beliebig viel, `?` = genau ein Zeichen, Groß-/Kleinschreibung egal). Das Muster muss das **ganze** Stichwort treffen.
- Gilt nur, wenn das Fahrzeug **am Einsatz beteiligt** ist. Es genügt **eines** der gewählten Geräte.
- **MUSS:** Der Abschluss ist gesperrt, bis ein Gerät erfasst ist ("Geräte ergänzen"). **INFO:** nur ein Vorschlag, Abschluss möglich.
- **Ohne passende Regel gibt es keinen Check.** Nach der Einführung sind **keine Regeln** angelegt; Start mit INFO, später ggf. MUSS.
- Die Prüfung läuft **lokal auf dem Gerät** (auch ohne Netz) mit dem zuletzt geladenen Regelstand.
- **Testmodus** in der Verwaltung: Stichwort eingeben, Fahrzeuge und Geräte wählen → Anzeige der passenden Regeln und Ergebnis (auch für ungespeicherte Änderungen).
- **Protokoll** der letzten Prüfungen (Zeit, Stichwort, Fahrzeug, Ergebnis).
- **Vorschläge:** Im Fahrzeugbericht erscheint bei den Geräten "Üblich bei <Stichwort>" mit den Geräten der passenden Regeln; **einzeln** oder mit "Alle übernehmen". Es wird **nichts automatisch angehakt.**

## C.6 Berichte und Ausgaben

### C.6.1 Hauptbericht (PDF, A4 hoch)

- Kopf: Logo, Titel ("Einsatzbericht"/"Übungsbericht"/Sonderdienst), Berichtsnummer, Quelle.
- **Blöcke** (Reihenfolge laut Papierformular der Feuerwehr, Antwort G-01): Einsatzort + Datum/Uhrzeit; Zuständigkeitsfelder; eingesetzte Fahrzeuge (Ankreuzfelder inkl. Anhänger/Sondergerät); Einsatzart; Zeitmarken + beteiligte Stellen; sonstige Feuerwehren; Mannschaft (Eingesetzt, Bereitschaft/Reserve **mit Namen**, Sonstige, AS-Träger) und Verbrauchsmaterial; **Chronik** (je Eintrag eine Zeile: `HH:MM Quelle: Text`, Fotos als kleine Vorschau); Statistikblöcke; optional **Wetter** (mit Quellenvermerk); **Angehängte Dokumente (PDF)**; Einsatzleiter:in, Einsatzende, Bearbeiter:in, Unterschrift.
- **Übung:** Übungsthema, Übungsleiter, Übungskategorie, "Teilnehmer: n Personen" (Reserve zählt dazu, Namen darunter), eigene Farbe.
- **Regel "eine Seite":** Der Hauptbericht soll **immer auf eine A4-Seite** passen. Das System gibt zuerst Leerraum der Chronik-Box frei und **verkleinert dann stufenlos bis höchstens auf 80 %**; passt es auch dann nicht (sehr viele Einträge), läuft er **natürlich auf eine zweite Seite**. Nichts darunter ist lesbar zu klein.
- Folgeseiten: **je Fahrzeug ein Fahrzeugbericht** (Einsatzort, Datum, Zeiten, Fahrzeug, Kilometer, Fahrer, Kommandant, Mannschaft mit AS-Markierung, Geräte/Mittel, Tätigkeitsbericht und Chronik); dann **Foto-Anhang** (z. B. 4 Fotos je Seite, 2×2).
- **Nicht im Bericht:** Wiederöffnungs-Protokoll (nur in der Verwaltung).
- Zeitzone fest auf die Ortszeit der Feuerwehr, unabhängig vom Gerät.

### C.6.2 Mail beim Abschluss (optional)

- Betreff mit Berichtsnummer und Ort/Bezeichnung, Text mit **Abschnitt "In Verwendung (zur Nachbereitung)"**: je Fahrzeug alle Geräte, Atemschutz-Träger (mit Namen und Minuten), Verbrauchsmaterial und Anhänger; PDF-Dokumente aus der Chronik als Anhang; **PDF** + eine **maschinenlesbare Textdatei** (sehr detailliert, ohne Bild-Rohdaten) als Anhänge.
- Fehler beim Versand dürfen den Abschluss **nie** verhindern (nur protokollieren).

### C.6.3 Weitere Ausgaben

- **Abtipp-Hilfe ("Spickzettel")** für den manuellen Übertrag in eine Verwaltungssoftware, falls es keine Schnittstelle gibt (Antwort F-03).
- **QR-Aushang** (alle Fahrzeug-Codes auf einer Seite, mit "So geht's").
- **Datenexport** (z. B. CSV/JSON) für Auswertungen — Umfang nach Antwort G-04/J-04.

## C.7 Optionale Zusatzfunktionen (nur wenn im Interview gewünscht)

- **Automatischer Einsatzstart aus einer Alarmquelle** (E-01/F-06).
- **Wetterdaten zum Alarmzeitpunkt** aus einer Quelle der Feuerwehr (nur live angelegte Einsätze; bei nachträglich erstellten Berichten oder geänderter Alarmzeit entfällt der Wetterblock).
- **Atemschutz-Überwachungsprotokoll** (Druck, Zeiten, Truppführer) als Anlage.
- **Gefahrstoff-Schnellsuche** (UN-Nummer).
- **Anwesenheit bei Übungen per QR-Selbsteintrag** (Mitglieder scannen und wählen ihren Namen).
- **Foto-Funktion mit Beschreibung/Anmerkungen.**
- **Nachbereitungsliste für die Gerätewartung** als eigene Ansicht.

---

# TEIL D — Fachliche Regeln und Berechnungen

Diese Regeln sind **verbindlich**, sofern das Interview nichts anderes ergibt. Sie sind das Ergebnis langer Praxiserfahrung.

## D.1 Zeiten

1. **Alarmzeit/Beginn** ist die Bezugszeit des Einsatzes. Wird sie nachträglich geändert, gilt sie **für den gesamten Einsatz**.
2. **Ende:** Jedes Fahrzeug hat eigene "von/bis"-Zeiten. Das **Einsatzende** im Hauptbericht ist **eigenständig** (manuell setzbar, **Datum und Uhrzeit**); fehlt es, wird es beim Abschluss aus den **spätesten Fahrzeug-Rückkehrzeiten** gesetzt, zuletzt "jetzt". Ein einmal gesetztes Einsatzende bleibt beim Wiederöffnen/erneuten Abschließen **erhalten**.
3. **Ende vor Beginn** ist ein Fehler: nicht speichern, roter Hinweis.
4. **Nur Uhrzeit eingegeben** → Datum des Beginns verwenden. Einsätze **über Mitternacht** müssen möglich sein.
5. Alle Zeiten intern **eindeutig mit Zeitzone** speichern; Anzeige immer in der Ortszeit der Feuerwehr (Sommer-/Winterzeit beachten).
6. **Zeitstempel in der Chronik** vom Gerät, aber: liegt er weit in der Zukunft, wird die Serverzeit genommen; liegt er in der Vergangenheit (Nachlieferung nach Funkloch), **bleibt er erhalten**.

## D.2 Personen und Zählung

1. Fahrer:in und Kommandant:in sind **je genau eine Person**; Mannschaft **mehrere**.
2. **Eine Person pro Fahrzeug nur einmal** (Fahrer ≠ Kommandant ≠ Mannschaft).
3. **Personen zählen, nicht Plätze:** Wer auf zwei Fahrzeugen vorkommt, zählt im Hauptbericht **einmal**.
4. **Reserve** = zur Verfügung gestanden, nicht ausgerückt. Wer Reserve ist, aber doch auf einem Fahrzeug eingesetzt war, wird **nicht doppelt** gezählt (zählt als eingesetzt).
5. **Übung:** Reserve-Personen sind **Teilnehmer ohne Fahrzeug**: "Teilnehmer = auf Fahrzeugen + Reserve", Namen werden aufgelistet.
6. **Mehrfachauswahl** in der Personenauswahl: nie mehr Personen als **freie Plätze**; Fahrer/Kommandant nur **einzeln**.
7. **Atemschutz-Träger** werden als **Personen** gezählt (kein Aufrunden auf Trupps), außer die Feuerwehr will es anders.

## D.3 Strecke / Kilometer

- Automatischer Wert: **Luftlinie** zwischen Feuerwehrhaus und Einsatzort × **Straßenfaktor** (Default 1,3) × 2 (Hin + Rück). Liegt keine Position vor, gibt es **keinen** Automatikwert (nicht still das Feuerwehrhaus einsetzen!) — der Mensch trägt manuell ein.
- Manuelle Eingabe hat Vorrang. Unter 1 km bei gesetzter Adresse = Plausibilitätshinweis (weich).
- Sonderdienste können eine **gefahrene Strecke** statt der Automatik verlangen.

## D.4 Berichtsnummern

- Gemäß Interview (D-03/D-04). Standard: **Kategorie-Buchstabe + 2-stelliges Jahr + laufende Nummer**, getrennte Zähler je Kategorie und Jahr, **Übungen** mit eigenem Kreis.
- **Vergabe beim Abschluss**, **nur wenn noch keine vergeben ist**: Wiederöffnen und erneutes Abschließen vergibt **keine** zweite Nummer.
- Die Kategorie richtet sich nach dem **Stichwort**; unklare Stichworte haben eine **vernünftige Rückfall-Logik** (z. B. Brandmeldeanlage/Brandmelder zählen zu **Brand**). Diese Zuordnung muss in der Verwaltung **testbar** sein ("Beispielvorschau").
- **Verworfene** oder automatisch geschlossene **leere** Berichte verbrauchen **keine** Nummer.

## D.5 Abschluss, Sperren, Wiederöffnen

1. **Fahrzeugbericht abschließen** sperrt nur diesen. **Hauptbericht abschließen** (Zentrale) schließt den Einsatz.
2. Sind beim Hauptabschluss noch **Fahrzeugberichte offen**, gibt es eine **Gnadenfrist** (z. B. 30 Minuten), in der die Mannschaft nachtragen kann; danach werden sie **automatisch mitgeschlossen** (mit Vermerk).
3. **Leere "Phantom"-Fahrzeugberichte** (keine Person, keine Geräte, keine Km, kein Text) zählen **nicht** im Bericht und in Statistiken und werden aufgeräumt.
4. **Wiederöffnen** nur für berechtigte Rollen, **mit optionalem Grund**, **protokolliert**, Nummer und Einsatzende bleiben erhalten; **das Protokoll erscheint nicht im Bericht**.
5. **Späte Daten** (Offline-Nachlieferung eines Fotos/Eintrags nach Auto-Abschluss eines leeren Berichts) dürfen den Einsatz automatisch wieder öffnen; nach einem **echten** Abschluss bleibt alles gesperrt (die Daten warten, bis wieder geöffnet wird).
6. **Auto-Abschluss** inaktiver Einsätze nach einer einstellbaren Zeit (Default 24 h) mit Vermerk; leere Phantom-Alarme (nie befüllt) schließen ohne Nummernverbrauch.
7. **Soft-Delete statt Löschen:** "Fahrzeugbericht entfernen" markiert nur und lässt sich **rückgängig** machen; entfernte Berichte zählen weder im PDF noch in der Statistik noch in der Abschlussprüfung.

## D.6 Parallele Einsätze

- Ein Fahrzeug darf Berichte in **mehreren Einsätzen** führen (Reiter), aber die Zentrale zeigt "**im Einsatz bei anderem Einsatz**" und warnt.
- Beim Eintreffen eines **neuen Alarms** während der Bearbeitung eines anderen wird die Mannschaft **nicht aus der Eingabe gerissen**, sondern bekommt ein auffälliges Popup mit Wahl.
- **Doppelte Alarme** (Nachalarmierung, zwei Quellen) werden **erkannt und markiert**, nicht stillschweigend zusammengeführt; die Zentrale entscheidet.

## D.7 Fotos und Dokumente

- Fotos werden am Gerät **verkleinert** (lange Kante ca. 1600 px) und **komprimiert** (JPEG), damit sie schnell und offline hochgeladen werden können.
- Zulässige Dateien: **JPG, PNG, PDF**; PDF höchstens ca. **4 MB**; echte **PDF-Kennung prüfen**; andere Typen verständlich ablehnen.
- Bilder liegen als **eigene Datensätze**, nicht im Berichtsdatensatz (sonst werden Synchronisierung und Laden unnötig groß). Der Chronik-Eintrag trägt nur den **Verweis**.
- PDFs werden **nicht** in das Bericht-PDF eingebettet (technisch aufwendig), sondern **aufgelistet** und der **Mail angehängt**; in der Chronik öffnet ein Knopf das Dokument.

## D.8 GPS

- Nur **Tablets mit echter Fahrzeugposition** senden Position. **QR-/Handy-Zugriffe senden keine**.
- Position wird nur bei **ausreichender Genauigkeit** (z. B. ≤ 50 m) für automatische Ankunftserkennung verwendet.
- Im **Standby** (App im Hintergrund) Position und Abfragen **drosseln** (Akku).

---

# TEIL E — Fachliche Datenstrukturen (konzeptionell)

> Das sind **Inhalte**, keine technische Datenbankvorgabe. Das KI-Werkzeug wählt passende Technik (Teil G).

## E.1 Stammdaten

- **Feuerwehr** (Name, Ort, Logo, Zeitzone, Heimatposition, Einstellungen).
- **Fahrzeug:** Kürzel, Name, Funkrufname, Typ, Farbe, Besatzung (Fahrer, Kommandant, Anzahl Mannschaftsplätze), mögliche Anhänger, PIN (gespeichert **nur als Prüfwert**, nie im Klartext anzeigen).
- **Gerät/Mittel** je Fahrzeug: Kennung, Bezeichnung, "ist Verbrauchsmaterial mit Menge" (ja/nein).
- **Person:** Kennung, Name, Dienstgrad, aktiv, Atemschutz-berechtigt, optional Funktion.
- **Listen:** Einsatzstichworte (+ Kategorie, Standardstufe), Auftrags-/Tätigkeitstypen, beteiligte Stellen, sonstige Feuerwehren, Gefahrstoffe, Übungskategorien.
- **Regeln:** Ausrüstungs-Check (Stichwort-Muster, Fahrzeug, Geräteliste, Prüfart, gültig ab, Notiz, aktiv).
- **Wasserentnahmestellen** (optional): Art, Position, Bezeichnung, Kapazität.
- **Zähler:** laufende Berichtsnummern je Kategorie und Jahr.

## E.2 Bewegungsdaten

- **Einsatz (Hauptbericht):** Typ, Berichtsnummer, Einsatzart/Stichwort/Stufe, Ort + Koordinaten, Alarmzeit/Beginn, Einsatzende, Zeitmarken (Lage unter Kontrolle, Brand aus, Alarmstufen), Zuständigkeitsfelder, alarmiert durch, beteiligte Stellen, sonstige Feuerwehren (+ Freitext), Bearbeiter:in, Einsatzleiter:in, **Reserve (Personenliste)**, Sondergeräte, **Chronik (Liste)**, Statistikblöcke, Status (aktiv/abgeschlossen), Sperre, **Wiederöffnungs-Protokoll**, Auto-Abschluss-Vermerk, Übungsfelder (Thema, Leiter:in, Kategorie), Sonderdienstfelder (Auftraggeber, Route), optional Wetter, Marker "mögliches Doppel von …", Zeitpunkt der Alarmannahme, Änderungsstempel für die Konflikterkennung.
- **Fahrzeugbericht** (je Fahrzeug und Einsatz): Zeiten von/bis, Kilometer, Fahrer, Kommandant (+ ist Einsatzleiter), **Mannschaft** (Platz, Person, Atemschutz ja/nein, Atemschutz-Dauer), Anhänger, **Geräte** (Kennung + optional Anzahl/Bemerkung), Verbrauchsmaterial-Menge, Tätigkeitsbericht, Status, Entfernt-Markierung, Kennung des zuletzt schreibenden Geräts.
- **Chronik-Eintrag:** Kennung, Zeitstempel (+ Empfangszeit), Quelle (Alarmsystem / Fahrzeug / Zentrale / Atemschutz), Fahrzeug, Text, optional Verweis auf Foto/Dokument, Bearbeitungsvermerk.
- **Foto/Dokument:** Einsatz, Fahrzeug, Inhalt (Bild oder PDF), Dateiname, Beschreibung, Aufnahmezeit, Aufnehmer.
- **Position:** Fahrzeug, Koordinaten, Zeit (nur aktuelle Positionen, alte verwerfen).
- **Geräte-Registrierung:** welches Gerät gehört zu welchem Fahrzeug, zuletzt gesehen.
- **Protokoll-Ereignis:** Typ, Zeit, Person/Rolle, Fahrzeug, Einsatz, Details.

---

# TEIL F — Qualität, Design, Sicherheit, Tests

## F.1 Nicht verhandelbare Qualitätsziele

1. **Sehr gute Lesbarkeit:** große Schrift (Fließtext nie kleiner als ~16 px, Eingabe 18–20 px, Kopfzahlen deutlich größer), **hoher Kontrast**, in Hell **und** Dunkel prüfen. Keine Schrift unter 13 px, auch nicht in Beschriftungen.
2. **Große Bedienflächen:** mindestens **44 × 44 px** (Handschuhe, wackelndes Fahrzeug).
3. **Hohe Performance:** schneller Start, flüssiges Scrollen, **keine schweren Effekte** (kein Weichzeichnen/Blur, keine großen Schatten, keine Dauer-Animationen). Auch auf **älteren Tablets** flüssig.
4. **Stabilität vor Spielerei:** Fehler dürfen **nie Daten verlieren**; Fehlerseite mit "Neu laden"; keine leeren Fehlerfänger.
5. **Zero-Data-Loss:** Alle Eingaben werden **laufend automatisch lokal gesichert** und bei Netz **nachgesendet**; nach App-Neustart ist alles wieder da.
6. **Offline-fähig:** Alles Wesentliche funktioniert **ohne Netz**; ein Status zeigt ehrlich, was noch nicht übertragen ist.
7. **Einfach:** wenig Tippen; Standardwerte; keine Pflichtfelder, die im Einsatz nicht vorliegen können; klare Hinweise statt Sperren (Ausnahmen nur wo fachlich nötig).
8. **Verständliche Sprache:** keine Fachbegriffe der Softwarewelt ("Synchronisierung fehlgeschlagen 500"), sondern Handlungsanweisungen ("Verbindung prüfen, es wird automatisch nachgesendet").

## F.2 Optik ("menschlich, nicht generisch")

- **Ruhig, sachlich, zweckmäßig.** Das Design soll wie ein professionelles Einsatzwerkzeug wirken, nicht wie eine Standard-Vorlage eines KI-Generators.
- **Zu vermeiden:** Glas-/Unschärfe-Effekte, Neon-/Leuchtkanten, bunte Verläufe, große farbige Schatten, Dauer-Animationen ("Pulsieren"), übertrieben runde Ecken und Pillen überall, Schrift in Monospace und Großbuchstaben mit Sperrsatz als Dekoration, kleine bunte Icon-Kästchen vor jeder Überschrift, mehrfarbige Aktionsbuttons.
- **Zu bevorzugen:** gut lesbare **Systemschrift**; **kleine bis mäßige Rundungen**; klare Linien; **Farbe nur mit Bedeutung** (Rot = Alarm/Hauptaktion/Fehler, Grün = erledigt, Gelb = Hinweis, Blau = Info); **Fahrzeug/Typ als Farbblock**; **Alarm als deutlicher Farbblock** mit weißer Schrift; Eingabefelder ruhig gefüllt; dunkle neutrale Schaltflächen für Nebenaktionen.
- **Orientierung:** Das Ergebnis darf sich an **professioneller Einsatz-Software** orientieren (Schiefer-/Graupaletten, klare Kacheln, große Zahlen). Bitte bei der Person nachfragen, was gefällt (Beispiele zeigen lassen).
- **Handy-Ansicht** ernst nehmen: Kopfzeile bricht um, gleich große Schaltflächen im Raster, keine abgeschnittenen Dialoge, Inhalt nie breiter als der Bildschirm. Dialoge müssen **mittig und vollständig** sichtbar sein.
- **Tastatur:** Strg+S (sichern), Esc (Dialog schließen), Enter in Eingaben wo sinnvoll.

## F.3 Sicherheit und Datenschutz

- **Rollen:** Mannschaft (nur Fahrzeugbericht), Zentrale/Einsatzleitung (Hauptbericht, Abschluss, Wiederöffnen), Verwaltung (Stammdaten, Auswertung, Zugänge), Lesezugriff.
- **Zugänge:** PINs nie im Klartext speichern oder anzeigen; **Standard-PINs und Standardpasswörter müssen** vor echtem Betrieb geändert werden — das System **warnt** deutlich, solange Standardwerte aktiv sind.
- **QR-Codes** sind Zugangsschlüssel: **widerrufbar** ("Rotieren" macht alle gedruckten Codes ungültig, neuer Aushang nötig); QR-Aushang **nur nach Anmeldung** abrufbar.
- **Geheimnisse** (Mail-Zugang, Schlüssel) **nie im Quelltext**, nie im Chat; nur über **Systemeinstellungen/Umgebungsvariablen** durch den Menschen.
- **Eingaben prüfen:** Hochgeladene Dateien nach Typ/Größe/Inhalt prüfen; fremde Grafiken (z. B. QR-SVG) nur in einer **strengen Positivliste** akzeptieren; niemals Benutzertext ungefiltert in HTML/PDF einsetzen (immer **escapen**).
- **Protokoll** (wer/wann/was) für Abschluss, Wiederöffnen, Löschen/Entfernen, Einstellungs- und Regeländerungen, Anmeldungen (Erfolg und Fehlschlag).
- **Aufbewahrung/Löschung** nach Vorgabe (I-04). **Sicherung** der Daten regelmäßig (Backup) und Wiederherstellung **einmal testen**.
- **Fremdsysteme:** Daten aus Verwaltungssoftware **nur lesend**, falls überhaupt. Niemals ohne ausdrückliche Zustimmung und Prüfung in fremde Systeme schreiben.

## F.4 Fehlerbehandlung

- Jede Aktion, die scheitern kann, zeigt **Rückmeldung für Menschen** (kurzer Hinweis, was zu tun ist). **Keine stillen Fehler**, keine leeren Fehlerblöcke.
- Netzfehler führen **nie** zu Datenverlust: Eingabe bleibt, wird in eine **Warteschlange** gelegt und automatisch nachgesendet (erst die wichtigen Dinge, dann große Dateien).
- **Mehrfache Schreiber** (zwei Geräte am selben Bericht): letzter Schreiber gewinnt für Fahrzeugdaten, aber **Hinweis** an das andere Gerät; bei der Zentrale **Konflikterkennung** ("jemand anderes hat zwischenzeitlich geändert — neu laden").
- **Doppelt abgesendete** Anfragen (Doppeltipp, Wiederholung) dürfen **nie Duplikate** erzeugen (eindeutige Kennungen je Aktion).

## F.5 Teststrategie

1. **Automatische Tests** für alle Regeln aus Teil D (Zeiten, Zählung, Nummern, Abschluss, Muster-Abgleich der Prüfregeln, Strecken, Zeitzone, Datei-Typen).
2. **Oberflächentest** mit **simulierten Daten**: jeden Bildschirm in **Hell/Dunkel**, **Handy**, **Tablet quer/hoch**, **großer Bildschirm** ansehen und Screenshots prüfen.
3. **Offline-Test:** Netz trennen → arbeiten → Netz zurück → es kommt **alles** an, nichts doppelt.
4. **Ausgabedokumente testen:** PDF mit **wenigen** und **sehr vielen** Chronikeinträgen, mit/ohne Fotos, Übung/Einsatz/Sonderdienst; Seitenzahl und Lesbarkeit prüfen.
5. **Realitätsprobe:** Mit **drei echten, vergangenen Einsätzen** (anonymisiert) durchspielen und mit dem Papierbericht vergleichen.
6. **Pilotbetrieb:** zuerst **ein Fahrzeug** und **eine Übung**, dann ausweiten.
7. Am Ende jeder Phase: **Abnahme-Checkliste** (Anhang 3).

---

# TEIL G — Vorgehen und Bauphasen

## G.1 Technische Leitplanken (Empfehlung, mit Rückfrage anpassbar)

- **Webbasierte Anwendung**, **installierbar** (PWA) für Tablet/Handy/PC, optional als **Android-Paket** (nur wenn wirklich nötig, z. B. für Verteilung/Berechtigungen).
- **Lokale Speicherung auf dem Gerät** (Entwürfe, Warteschlange, zuletzt geladene Listen) + **zentrale Datenhaltung** mit Mehrbenutzerzugriff.
- **Offline-first** (siehe F.1), **idempotente Schreibzugriffe**, **Warteschlange** mit Prioritäten.
- **Gemeinsame Regelbibliothek** für Prüfungen, die **identisch** am Gerät, in der Verwaltung und auf dem Server läuft.
- **PDF-Erzeugung** serverseitig mit festem Layout; Messung der Seitenhöhe und Fit-Logik (C.6.1).
- **Sprache der Oberfläche:** Deutsch; Fachbegriffe aus dem Interview.
- **Keine Schnittstelle zu Fremdsystemen** in Version 1, außer sie wurde im Interview eindeutig freigegeben (Block F).
- Frage vor jeder **neuen Bibliothek/Dienstleistung** (Kosten, Datenschutz).

## G.2 Bauphasen (jede Phase endet mit Vorführung + Abnahme)

**Phase 0 — Fundament**
- Projektprofil bestätigt; Umgebung, Versionsverwaltung, Grundgerüst, Hell/Dunkel, Kopfzeile, Fahrzeugauswahl + PIN, Navigation.
- *Abnahme:* Leere App startet am Tablet, Fahrzeug wählbar, Hell/Dunkel ok.

**Phase 1 — Fahrzeugbericht (Kern)**
- Neuer Bericht (manuell), Berichtsseite C.2.4 (Datum/Zeit-Dialoge, Ort, Strecke, Besatzung mit Personenauswahl, Geräte, Aufträge, Chronik mit Text), automatische Sicherung, Abschluss-Dialog.
- Personalliste per Datei-Import, Geräteliste je Fahrzeug aus Stammdaten.
- *Abnahme:* Ein echter Einsatz von Anfang bis Ende am Tablet dokumentierbar, auch **ohne Netz**.

**Phase 2 — Zentrale und Hauptbericht**
- Zentrale-Oberfläche C.3 (Fahrzeugstatus, Stammdaten Einsatz, Zeitmarken, Listen, Reserve, Abschluss, Wiederöffnen), Nummernvergabe, **Hauptbericht-PDF + Fahrzeugberichte + Foto-Anhang**.
- *Abnahme:* PDF entspricht dem Papierformular; Seite-1-Regel greift.

**Phase 3 — Verwaltung**
- C.4: Stammdatenpflege, Listen, Berichte-Browser, Archiv, Statistik, Protokoll.
- *Abnahme:* Kommandant kann Listen/Geräte selbst pflegen, Auswertung stimmt mit Papier überein.

**Phase 4 — Komfort und Ausgaben**
- Karte + Fahrzeugpositionen, Eintreffzeit per GPS, Fotos/PDF in der Chronik, QR-Anmeldung + Handy-Übergabe, QR-Aushang, Mail beim Abschluss mit Nachbereitungsliste.
- *Abnahme:* Pilot an einem Fahrzeug erfolgreich.

**Phase 5 — Regeln und Intelligenz**
- Ausrüstungs-Check mit Testmodus und Protokoll, Vorschläge nach Stichwort, Wetter (falls gewünscht), Atemschutz-Protokoll (falls gewünscht).
- *Abnahme:* Regeln starten nur als **Hinweis**, MUSS erst nach Bewährung.

**Phase 6 — Anbindungen (nur falls freigegeben)**
- Automatischer Einsatzstart, Verwaltungssoftware-Export/-Import — erst nach **schriftlicher Klärung** von Zugang, Rechten und Risiko.

**Phase 7 — Betrieb**
- Backup + Wiederherstellungstest, Schulungsunterlage (1 Seite pro Rolle), Einsatz-Notfallplan (Papier), Update-Prozess, Standardwerte/PINs ändern, Aufräumen von Testdaten.

## G.3 Zusammenarbeit während des Baus

- Nach jeder Phase: **kurze Vorführung** (Screenshots oder Link), **Liste "getestet / nicht getestet"**, **Fragen/Entscheidungen**.
- Änderungswünsche werden **gesammelt**, kategorisiert (Fehler / Wunsch / später) und priorisiert.
- Jede ausgelieferte Version bekommt eine **Versionsnummer** und **kurze Änderungsbeschreibung in einfacher Sprache** (für die Mannschaft) — plus **Text für eine Gruppennachricht** (Messenger), wenn gewünscht.

---

# TEIL H — Erfahrungen aus der Praxis (typische Stolperfallen)

> Diese Punkte haben sich in der Praxis als Fehlerquellen erwiesen. **Vorab berücksichtigen** spart viele Korrekturrunden.

1. **Beginn nachträglich ändern** muss möglich sein (Bericht wird oft Minuten später angelegt) — und gilt für **alle Fahrzeuge**. Dabei sind **Datum und Uhrzeit getrennt** änderbar (Einsatz über Mitternacht).
2. **Einsatzende** im Hauptbericht **getrennt** von Fahrzeug-Zeiten pflegen — Nachbereitung dauert oft länger. Später geänderte Fahrzeugzeit **überschreibt** ein manuell gesetztes Einsatzende **nicht**.
3. **Eingegebene Werte vom Beschriftungstext unterscheiden** (z. B. eingegebene Werte dunkelblau/fett, Beschriftungen schwarz) — erleichtert das Prüfen.
4. **Reserve richtig behandeln:** zählt nicht doppelt; im Übungsbericht **sind Reserve-Personen die Teilnehmer ohne Fahrzeug**. **Namen** (nicht nur Anzahl) ausgeben.
5. **Doppelte Anlage** bei Mehrfachtipp oder Netzwiederholung verhindern (eindeutige Kennung je Aktion, serverseitig idempotent).
6. **Fahrzeug irrtümlich bedient** (falsches Fahrzeug gewählt, Einträge dort gemacht): **"Fahrzeugbericht entfernen/wiederherstellen"** in der Zentrale statt Löschen; **Einträge dürfen nicht automatisch zurückkehren**, wenn das Tablet weiter synchronisiert.
7. **Fahrzeugposition vs. Privathandy:** Handy-Zugriff per QR darf **nie** als Fahrzeugposition erscheinen.
8. **Automatische Kilometer** bei fehlender Position **nicht** mit dem Feuerwehrhaus füllen — Hinweis "Strecke fehlt, bitte eintragen".
9. **Schrift/Layout im PDF:** Seite 1 muss **eine Seite** bleiben; Leerräume für handschriftliche Notizen sind nur nötig, solange nichts anderes drückt (sie dürfen weichen). Wiederöffnungs-Protokoll **nicht** im Bericht.
10. **Kategorie-Zuordnung der Nummern** gründlich testen (Brandmeldeanlage = Brand!). Prüfen mit **Beispielliste** in der Verwaltung.
11. **Standard-Listen** (Stichworte, beteiligte Stellen, Übungskategorien) sind **Vorschläge**; sie werden vom Kommandanten **in der Verwaltung gepflegt**. **Neue Einträge** müssen auch in **allen Prüfungen/Auswahlen** auftauchen (eine Liste, mehrere Orte — Gefahr der Abweichung!).
12. **Dialoge am Handy:** Breite begrenzen, nie breiter als der Bildschirm; Titel umbrechen, nicht abschneiden; Listen im Dialog scrollen.
13. **Hintergrund-Abfragen** (regelmäßiges Nachladen) dürfen **nicht** laufende Eingaben überschreiben ("Poll überschreibt Eingabe" — lokale Änderungen mit Markierung "wird gesendet" schützen).
14. **Lokale Zeit vs. Serverzeit:** Wenn ein Tablet falsch geht, nie die Chronik durcheinanderbringen (Zukunftszeiten zurückweisen, Vergangenheit behalten).
15. **Sehr lange Namen/Texte** brechen sauber um; **Umlaute und Sonderzeichen** überall prüfen (Dateinamen, PDF, Mail).
16. **Datei-Uploads über schwaches Netz:** klein halten, in die Warteschlange legen, **nachrangig** nach den wichtigen Berichtsdaten senden.
17. **Selten genutzte Funktionen** (Statistikblöcke, Regeln) **einklappbar** oder in die Verwaltung, damit die Einsatzoberfläche **ruhig** bleibt.
18. **Keine Überraschungen für die Mannschaft:** neue Funktionen zuerst als **Hinweis**, erst später als **Sperre**; Änderungen **kurz ankündigen**.
19. **Zugänge/Standardwerte** nach der Einrichtung **zwingend ändern**; im Betrieb eine sichtbare Warnung, solange Standardwerte aktiv sind.
20. **Alte Daten reinigen:** nie befüllte Entwürfe, automatisch geschlossene Alarme und Test-Berichte dürfen die Statistik und die Nummern **nicht** verfälschen.

---

# ANHANG 1 — Vorlage "Projektprofil" (aus dem Interview zu füllen)

Das KI-Werkzeug legt `PROJEKT-PROFIL.md` mit dieser Struktur an und ergänzt sie fortlaufend. Offenes bleibt als `TODO` stehen.

```markdown
# Projektprofil — <Name der Feuerwehr>

## 1. Organisation (Block A)
- Name / Ort / Land:
- Typ und Größe:
- Einsätze/Übungen pro Jahr:
- Sprache/Formate:
- Projektleitung / Tester:
- Logo und Farben:
- Mandantenfähigkeit: nein | ja (Details)

## 2. Fahrzeuge (Block B)
| Kürzel | Name | Funkrufname | Typ | Fahrer | Kdt | Mannschaftsplätze | Anhänger | Besonderheiten |
|---|---|---|---|---|---|---|---|---|
| TODO | | | | | | | | |

- Sondergeräte ohne Fahrzeug:
- Geräteliste je Fahrzeug: (Datei/Foto angehängt: ja/nein)
- Verbrauchsmaterial mit Mengen:
- Atemschutz-Regeln:

## 3. Personal (Block C)
- Quelle der Personalliste:
- Felder je Person:
- Pflichtrollen im Bericht:
- Zählregeln:

## 4. Einsatzarten und Nummern (Block D)
- Stichwortliste: (Datei angehängt)
- Kategorien/Stufen:
- Nummernformat + Vergabezeitpunkt:
- Zeitmarken:
- Beteiligte Stellen / Nachbarwehren:
- Zuständigkeitsfelder:
- Sonderdienste:
- Übungskategorien:

## 5. Alarmierung und Ablauf (Block E)
- Einsatzstart: manuell | automatisch (Quelle, Beispiele)
- Zentrale vorhanden: ja | nein
- Live-Positionen / GPS-Ankunft / Wetter: ja | nein (je Punkt)
- Auto-Abschluss nach: __ Stunden
- Wiederöffnen durch:

## 6. Bestehende Systeme (Block F)
- Verwaltungssoftware:
- Datenaustausch (Import/Export/keiner):
- Schreibzugriff in Fremdsysteme: nein (Standard) | ja (Details und Freigabe)
- Mailzugang vorhanden: ja/nein (Zugang trägt der Mensch selbst ein)

## 7. Ausgaben (Block G)
- Formulare (Dateien angehängt):
- Seitenregel Hauptbericht:
- Mail beim Abschluss: Empfänger, Anhänge
- Statistik-/Meldeformulare:

## 8. Technik vor Ort (Block H)
- Fahrzeug-Geräte / Zentrale / privat:
- Netz:
- App-Form:
- QR-Zugang für Handys:

## 9. Rollen und Datenschutz (Block I)
- Rollen:
- Anmeldung:
- Hosting/Datenschutz:
- Aufbewahrung:
- Betrieb/Ansprechperson:

## 10. Besonderheiten und Wünsche (Block J)
- Besonderheiten:
- Größte Ärgernisse heute:
- Gewünschte Auswertungen:
- Nicht gewünscht:
- Begriffe:
- Termine:

## 11. Umfang
- Version 1 (MUSS):
- Version 1.1 (SOLL):
- Später (KANN):

## 12. Offene Punkte (TODO)
- …
```

---

# ANHANG 2 — Glossar

| Begriff | Bedeutung |
|---|---|
| **Hauptbericht** | Der Bericht zum gesamten Einsatz, geführt von der Zentrale |
| **Fahrzeugbericht** | Bericht je eingesetztem Fahrzeug (Besatzung, Geräte, Zeiten, Kilometer, Tätigkeit) |
| **Zentrale / Einsatzleitung** | Stelle im Feuerwehrhaus (PC), die den Hauptbericht führt und alle Fahrzeuge im Blick hat |
| **Chronik** | Zeitlich sortierte Meldungen/Einträge zum Einsatz |
| **Reserve / Bereitschaft** | Personen, die zur Verfügung standen, aber nicht ausgerückt sind (bei Übungen: Teilnehmer ohne Fahrzeug) |
| **AS** | Atemschutz |
| **Kdt** | Kommandant:in bzw. Fahrzeugkommandant:in |
| **Stichwort** | Einsatzart/Alarmstichwort (z. B. Brand, Verkehrsunfall, Wasserschaden) |
| **Alarmstufe** | Eskalationsstufe bei größeren Einsätzen |
| **Zeitmarken** | Wichtige Zeitpunkte (Lage unter Kontrolle, Brand aus, Alarmstufen) |
| **Sonderdienst** | Tätigkeit außerhalb von Einsatz und Übung (z. B. Lotsendienst, Brandwache) |
| **Phantom-Bericht** | Leerer, nie befüllter Bericht (z. B. falscher Alarm) |
| **PWA** | Installierbare Web-Anwendung für Handy/Tablet/PC |
| **Offline-first** | Die App arbeitet ohne Netz und sendet später nach |
| **Idempotent** | Mehrfach gesendet ergibt dasselbe wie einmal (keine Doppel) |
| **MUSS / INFO** | Prüfart der Ausrüstungs-Regeln: sperrt den Abschluss / gibt nur einen Hinweis |
| **Gnadenfrist** | Zeitfenster nach Hauptabschluss, in dem Fahrzeuge noch nachtragen dürfen |

---

# ANHANG 3 — Abnahme-Checkliste

**Fahrzeug**
- [ ] Fahrzeug wählen, PIN, merken, wechseln
- [ ] Neuer Bericht (Einsatz ohne Alarm, Übung, Sonderdienst)
- [ ] Datum/Uhrzeit per Dialog änderbar, Änderung gilt für alle Fahrzeuge
- [ ] Besatzung: Einzel- und Mehrfachauswahl, Sitzplatzgrenze, Atemschutz-Zeit
- [ ] Geräte inkl. Freitext und Mengen; Vorschläge nach Stichwort
- [ ] Chronik mit Text und Foto, Korrektur eigener Einträge
- [ ] Abschluss-Prüfliste: weiche Hinweise erlauben "Trotzdem", harte Sperren nicht
- [ ] Arbeiten **ohne Netz** → alles kommt später an, nichts doppelt
- [ ] Hell/Dunkel, Handy, Tablet quer/hoch lesbar; Dialoge vollständig sichtbar
- [ ] Eintreffzeit per GPS: ≤ 100 m, einmalig, **nicht** bei QR-Handy

**Zentrale**
- [ ] Fahrzeugstatus live, Karte, Positionen
- [ ] Hauptbericht-Stammdaten inkl. **Einsatzende (Datum + Uhrzeit)** und Ende-vor-Beginn-Sperre
- [ ] Beteiligte Stellen, Nachbarwehren, Reserve (Mehrfachauswahl), Bearbeiter:in
- [ ] Foto **und PDF** zur Chronik
- [ ] Fahrzeug entfernen/wiederherstellen
- [ ] Abschluss: Nummer, Sperre, PDF, Mail; Wiederöffnen mit Protokoll, **ohne** Eintrag im Bericht

**Berichte**
- [ ] Hauptbericht **eine Seite**; bei sehr vielen Einträgen zweite Seite, nichts zu klein
- [ ] Übungsbericht: Teilnehmer inkl. Reserve **mit Namen**
- [ ] Fahrzeugberichte und Foto-Anhang vollständig; Dokumentliste
- [ ] Mail mit "In Verwendung"-Liste und Anhängen

**Verwaltung**
- [ ] Stammdaten, Listen, Regeln pflegbar, Testmodus, Protokoll
- [ ] Nummerierungsvorschau, Statistik plausibel
- [ ] QR-Codes anzeigen/rotieren, Sammel-Aushang als A4-PDF
- [ ] Protokoll der Aktionen vollständig

**Betrieb**
- [ ] Standard-PINs/-Passwörter geändert, Warnung verschwunden
- [ ] Backup + Wiederherstellung einmal getestet
- [ ] Testdaten entfernt, Nummern zurückgesetzt/geprüft
- [ ] Kurzanleitung je Rolle (1 Seite), Notfall-Papierformular vorhanden

---

*Ende der Anleitung. Das KI-Werkzeug beginnt jetzt mit **Block A** des Interviews.*
