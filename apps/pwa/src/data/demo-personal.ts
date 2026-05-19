/**
 * Demo-Personalliste — wird beim ersten Tablet-Start in PouchDB seeded,
 * sodass das LFA-B-Tablet auch ohne syBOS-Sync sofort funktional ist.
 *
 * Sobald der echte syBOS-Sync läuft (Phase 5), werden die Demo-Personen
 * automatisch durch echte ersetzt (gleiche IDs, andere _rev).
 *
 * Subset aus prototype/lfa-b/data/personal.js — siehe FF Eberstalzell
 * Personalliste.
 */

import type { Person } from "@hotdoc/shared";

interface DemoPerson {
  id: number;
  nach: string;
  vor: string;
  grad: string;
  as: boolean;
}

const RAW: DemoPerson[] = [
  { id: 107433, nach: "Achleitner", vor: "Josef", grad: "HFM", as: true },
  { id: 118166, nach: "Achleitner", vor: "Robert", grad: "HBM d.F.", as: true },
  { id: 1789210, nach: "Aigner", vor: "Maximilian", grad: "FM", as: false },
  { id: 107506, nach: "Almhofer", vor: "Martin", grad: "LM", as: true },
  { id: 107469, nach: "Austaller", vor: "Günter", grad: "LM", as: false },
  { id: 1775052, nach: "Böck", vor: "Ines", grad: "FM", as: false },
  { id: 107436, nach: "Beisl", vor: "Andreas", grad: "HFM", as: true },
  { id: 107398, nach: "Bindreiter", vor: "Emil", grad: "HFM", as: false },
  { id: 1788376, nach: "Boxleitner", vor: "Siegfried", grad: "FS", as: false },
  { id: 107399, nach: "Brandmayr", vor: "Markus", grad: "LM", as: true },
  { id: 107358, nach: "Brandstätter", vor: "Florian", grad: "HFM", as: true },
  { id: 107483, nach: "Brandstätter", vor: "Georg", grad: "HFM", as: true },
  { id: 107402, nach: "Breitwimmer", vor: "Karl", grad: "LM", as: false },
  { id: 123057, nach: "Bruckner", vor: "Christoph", grad: "LM", as: true },
  { id: 134130, nach: "Bruckner", vor: "Rene", grad: "HBM d.F.", as: true },
  { id: 107440, nach: "Buchegger", vor: "Josef", grad: "HFM", as: false },
  { id: 134129, nach: "Dicketmüller", vor: "Florian", grad: "LM", as: true },
  { id: 107347, nach: "Dicketmüller", vor: "Hermann", grad: "HLM", as: false },
  { id: 1775028, nach: "Dicketmüller", vor: "Sebastian", grad: "OFM", as: true },
  { id: 132676, nach: "Doppler", vor: "Klemens", grad: "HBM d.F.", as: true },
  { id: 126869, nach: "Ecker", vor: "Daniel", grad: "HFM", as: true },
  { id: 107375, nach: "Eder", vor: "Christoph", grad: "HBI", as: true },
  { id: 1775063, nach: "Eder", vor: "Valentin", grad: "OFM", as: true },
  { id: 107404, nach: "Ehrengruber", vor: "Franz", grad: "HFM", as: false },
  { id: 107442, nach: "Fellner", vor: "Günter", grad: "HLM", as: false },
  { id: 107359, nach: "Forstner", vor: "Richard", grad: "HFM", as: false },
  { id: 122282, nach: "Gatterbauer", vor: "Daniel", grad: "FM", as: true },
  { id: 119744, nach: "Grünauer", vor: "Lukas", grad: "OFM", as: true },
  { id: 107444, nach: "Grünauer", vor: "Manfred", grad: "LM", as: false },
  { id: 142669, nach: "Grünauer", vor: "Michael", grad: "LM", as: true },
  { id: 107445, nach: "Grünauer", vor: "Robert", grad: "BI d.F.", as: true },
  { id: 78304, nach: "Härtenhuber", vor: "Martina", grad: "OBM d.F.", as: false },
  { id: 107449, nach: "Huemer", vor: "Franz", grad: "HLM", as: false },
  { id: 107452, nach: "Huemer", vor: "Manfred", grad: "OBM", as: true },
  { id: 107498, nach: "Humer", vor: "Tobias", grad: "HBM", as: true },
  { id: 129069, nach: "Kaiser", vor: "Dominik", grad: "OBM d.F.", as: true },
  { id: 107353, nach: "Karlsberger", vor: "Bernhard", grad: "BM", as: true },
  { id: 107471, nach: "Karlsberger", vor: "Jürgen", grad: "BM", as: false },
  { id: 107389, nach: "Kienesberger", vor: "Jürgen", grad: "OLM", as: true },
  { id: 114374, nach: "Kraus", vor: "Hans-Georg", grad: "OBI", as: true },
  { id: 107417, nach: "Krumphuber", vor: "Hubert", grad: "OBM", as: false },
  { id: 107419, nach: "Langeder", vor: "Manfred", grad: "BM", as: true },
  { id: 107357, nach: "Länglacher", vor: "Christian", grad: "HLM", as: false },
  { id: 107420, nach: "Leithenmair", vor: "Florian", grad: "OFM", as: true },
  { id: 107366, nach: "Leithinger", vor: "Philipp", grad: "BM", as: true },
];

export function buildDemoPersonen(): Person[] {
  const now = new Date().toISOString();
  return RAW.map((p) => ({
    _id: `person:${p.id}`,
    type: "person",
    syBosId: p.id,
    nachname: p.nach,
    vorname: p.vor,
    dienstgrad: p.grad,
    funktionen: [],
    atemschutzGueltig: p.as,
    aktiv: true,
    letztesSync: now,
  }));
}
