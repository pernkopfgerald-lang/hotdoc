# HotDoc · Tailscale-Anbindung (Modell B)

**Modell:** Tablets ins Tailnet, API bleibt public.

**Zweck:**
1. Funktionär kann von zuhause aufs Backoffice — kein Cloudflare-Tunnel, kein VPN-Server eigen aufsetzen.
2. Tablets im FF-Haus erreichen das Florianstation-Tablet direkt im LAN auch ohne fly.io.
3. Wartungs-Komfort: SSH/CouchDB-Direct-Access aus dem Funktionärs-Laptop ohne Port-Forwarding.

**Was sich an HotDoc nicht ändert:** Code, Auth, PIN-Login, JWT, fly.io-Deployment. Tablets rufen weiterhin `https://hotdoc-api.fly.dev` über öffentliches Internet auf — Tailscale ist eine **zusätzliche** Schicht für interne Workflows.

---

## Voraussetzungen

| Punkt | Status |
|---|---|
| Tailscale-Konto | kostenlos bis 100 Geräte / 3 User auf [tailscale.com](https://tailscale.com) |
| Identity Provider | Google-Konto oder Microsoft-Konto (für FF-Eberstalzell: vermutlich `gerald.pernkopf@ff-eberstalzell.at` als Admin-Account) |
| Lenovo TB-X606X | Android 10/11 — Tailscale-App aus Play Store läuft sauber |
| Zentral-PC | Windows, macOS oder Linux — Tailscale-Client offiziell |

---

## Schritt 1 · Tailnet erstellen

1. https://login.tailscale.com aufrufen, mit Google oder Microsoft anmelden.
2. **Tailnet-Name** vergeben — z. B. `ff-eberstalzell` (Standard ist die Mail-Domain).
3. Aus dem Admin-Panel `https://login.tailscale.com/admin/machines` notieren — hier sieht der Funktionär alle eingebundenen Geräte.

**Eine Mehrbenutzer-Frage:** Tailscale erlaubt bis 3 User im Free-Plan. Empfehlung: nur **ein User-Account** = der Funktionär. Alle Tablets werden mit **diesem einen Account** registriert (das funktioniert, weil ein User mehrere Geräte haben darf). Wird HotDoc später auf mehrere FFs ausgeweitet, brauchst du einen bezahlten Plan.

---

## Schritt 2 · Tablets onboarden (Lenovo TB-X606X)

Pro Tablet (5× wiederholen):

1. **Google Play Store** öffnen → **Tailscale** suchen → installieren.
2. App öffnen → **Get started** → mit dem FF-Konto anmelden.
3. Beim ersten Verbinden fragt Android nach **VPN-Berechtigung** → akzeptieren.
4. Im Tailscale-App-Hauptbildschirm sollte oben grün stehen: `Connected · 100.x.y.z`.
5. **Wichtig:** im Admin-Panel des Tailnets das Gerät **umbenennen** auf einen sprechenden Namen:
   - `tablet-kdo`
   - `tablet-tlf-a-4000`
   - `tablet-lfa-b`
   - `tablet-mtf`
   - `tablet-zentrale`

6. **Auto-Connect aktivieren:** in der Tailscale-App → Settings → **Use Tailscale** „Always-On" einschalten. Damit hängt sich das Tablet automatisch beim Boot ins Tailnet — wichtig damit nach dem Einschalten im Funkalarm sofort alles greifbar ist.

7. **Akku-Optimierung umgehen:** Android → Einstellungen → Apps → Tailscale → **Akku** → „Nicht eingeschränkt" oder „Optimierung deaktivieren". Sonst killt Android den Daemon im Standby und das Tablet verliert die Tailnet-IP.

### Verifikation nach Schritt 2

Vom Funktionärs-PC im Tailnet: `ping tablet-kdo` muss antworten (oder Tailscale-Admin-Panel zeigt das Tablet als `Online`).

---

## Schritt 3 · Zentral-PC + Funktionärs-Geräte

**Zentral-PC im FF-Haus** (Windows):
1. https://tailscale.com/download/windows → MSI-Installer.
2. Mit dem FF-Konto anmelden.
3. Im Admin-Panel umbenennen auf `pc-florianstation`.
4. **Always-On:** Tailscale-Symbol in der Taskleiste → „Run at startup".

**Funktionärs-Privat-Handy** (z. B. dein Smartphone) — gleicher Flow wie Tablets, Name z. B. `handy-gerald`.

---

## Schritt 4 · ACLs konfigurieren (optional aber empfohlen)

Aktuell darf jedes Gerät im Tailnet jedes andere erreichen. Für FF-Sicherheit ist das in Ordnung (geschlossener Kreis), aber wenn du strenger willst:

1. https://login.tailscale.com/admin/acls öffnen.
2. Editor sollte default-ACL zeigen:
   ```jsonc
   {
     "acls": [{"action": "accept", "src": ["*"], "dst": ["*:*"]}]
   }
   ```
3. **Tag-basierte ACL** für Härtung — Beispiel:
   ```jsonc
   {
     "tagOwners": {
       "tag:tablet":       ["autogroup:admin"],
       "tag:florianstation": ["autogroup:admin"]
     },
     "acls": [
       // Tablets dürfen Florianstation erreichen, untereinander nicht
       { "action": "accept",
         "src": ["tag:tablet"],
         "dst": ["tag:florianstation:*"] },
       // Funktionär (alle nicht-Tablet-Geräte) darf alles
       { "action": "accept",
         "src": ["autogroup:member"],
         "dst": ["*:*"] }
     ]
   }
   ```
4. Geräte mit den passenden Tags markieren:
   - `tablet-*` → `tag:tablet`
   - `pc-florianstation` → `tag:florianstation`

**Effekt:** ein gestohlenes Tablet kann nicht auf andere Tablets schauen, nur auf die Florianstation — und die ist JWT-geschützt.

---

## Schritt 5 · Backoffice-Zugriff vom Funktionärs-Handy/Laptop

Du brauchst keinen MagicDNS-Eintrag — die Backoffice-App läuft weiter unter `https://hotdoc-backoffice.fly.dev` und ist öffentlich. **Tailscale gibt dir aber zusätzlich:**

### Florianstation-PC-Direktzugriff

Wenn du am Florianstation-PC einen lokalen Dienst hast (z. B. CouchDB-Backup, Drucker-Spooler, …), erreichst du den von zuhause direkt:

- `http://pc-florianstation:5984` für CouchDB-Direct-Browse (sofern MagicDNS aktiv ist — Standard).
- `flyctl proxy 5984:5984 -a hotdoc-db` braucht's nicht mehr.

### SSH auf den PC

- Windows: PowerShell aktivieren: `Enable-WindowsOptionalFeature -Online -FeatureName OpenSSH.Server`.
- Vom Funktionärs-Laptop: `ssh user@pc-florianstation`.

### CouchDB-Admin-Panel

- Im Browser: `http://pc-florianstation:5984/_utils` — Backup-/Replikations-UI für die Master-DB.

---

## Schritt 6 · Was sich an HotDoc selbst ändert: nichts

| Punkt | Status |
|---|---|
| API-URL `https://hotdoc-api.fly.dev` | unverändert |
| PWA-URL `https://hotdoc-eberstalzell.fly.dev` | unverändert |
| Backoffice-URL `https://hotdoc-backoffice.fly.dev` | unverändert |
| JWT-Auth (PIN-Login) | unverändert |
| Re-Deploy nötig | **nein** |

Tailscale ist eine reine Netzwerk-Schicht **zusätzlich** zu HotDoc — du bekommst Komfort und Wartungs-Wege, brauchst aber HotDoc nicht umzustellen.

---

## Sicherheits-Hinweise

1. **Tailscale-Account schützen** — der Account-Inhaber kann jederzeit Geräte ins Tailnet zulassen. 2FA aktivieren bei Google/Microsoft.
2. **Verlorenes Tablet** → im Admin-Panel das Gerät entfernen: `https://login.tailscale.com/admin/machines/<id>` → **Remove**. Tablet verliert dann die Tailnet-IP. **Zusätzlich** auf der HotDoc-PWA die Setup-Reset durchführen (Token weg).
3. **Tailscale + JWT bleiben unabhängig** — auch wer im Tailnet ist, braucht eine valide PIN um HotDoc-API zu rufen. Defence in depth.
4. **Funnel NICHT aktivieren** für HotDoc-Dienste (Tailscale-Feature, das ein Service ins öffentliche Internet macht). Sicher nichts versehentlich freigeben.
5. **Audit-Log Tailscale-seitig** — Admin-Panel → Audit-Log zeigt Anmeldungen + Geräte-Adds. Quartalsweise prüfen.

---

## Troubleshooting

| Symptom | Lösung |
|---|---|
| Tablet zeigt nach Reboot kein Tailnet | Akku-Optimierung greift — siehe Schritt 2.7 |
| `ping tablet-kdo` aus PC erfolglos | Tablet-IP im Admin-Panel ansehen, direkt mit `100.x.y.z` testen. Wenn das geht, ist MagicDNS-Cache am PC veraltet — `Restart-Service Dnscache` (Win) bzw. neu im Tailscale-Client einloggen. |
| Tailscale-Daemon stoppt sich auf Android | Hersteller-spezifischer Memory-Killer — Lenovo hat das in Android 11 entschärft. Alternative: Tablet im PWA-Standalone-Mode betreiben, dann hält Android beide Apps am Leben. |
| HotDoc-API erreichbar aber 401 | Token-Drift wie früher schon mal — Setup-Reset auf dem Tablet löst es. |
| Backoffice von zuhause nicht erreichbar | Backoffice ist public — Tailscale dafür nicht nötig. Wenn nicht erreichbar, ist fly.io oder Internet down. |

---

## Wenn du später auf Modell A wechseln willst

Modell A = API ganz aus dem öffentlichen Internet. Migration:
1. Tailscale-Sidecar auf hotdoc-api fly machine — via `tailscale-operator` oder manueller fly-Init.
2. fly-Service auf internal-only umstellen.
3. PWA-Caddyfile: `*.internal:3000` als Backend statt fly-internal-IP.
4. Tablets müssen IMMER Tailscale haben — kein Mobilfunk-Fallback mehr.

Aktuell nicht nötig, aber Pfad bleibt offen.
