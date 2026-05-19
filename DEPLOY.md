# HotDoc · Deployment-Anleitung

Diese Anleitung beschreibt das initiale Setup für **zwei Remotes**:
**Gitea** (Source of Truth, intern gehostet) und **fly.io** (Public Deployment, Frankfurt-Region).

> Status: Prototyp v0.2. Das echte App-Build (React + Vite + PouchDB) wird in einer
> späteren Phase auf den gleichen Pipelines aufgesetzt. Aktuell wird nur der statische
> Prototyp deployed (Caddy serviert die HTML/CSS/JS aus `prototype/lfa-b/`).

---

## 1. Gitea — internes Repo anlegen

### 1.1 Im Gitea-Webfrontend
1. In deinem Gitea-Account: **Neues Repository** anlegen
   - Name: `hotdoc`
   - Sichtbarkeit: privat
   - **Nicht** initialisieren (kein README/gitignore/license), wir pushen alles vom lokalen Repo
2. Repo-URL kopieren, z.B.:
   `https://gitea.ff-eberstalzell.local/gerald/hotdoc.git`

### 1.2 Lokales Repo verbinden
```bash
# Im Projekt-Root
git remote add origin https://gitea.ff-eberstalzell.local/gerald/hotdoc.git
git push -u origin main
```

Falls Gitea HTTPS-Auth via Token nutzt:
```bash
git remote add origin https://gerald:<TOKEN>@gitea.ff-eberstalzell.local/gerald/hotdoc.git
```

Alternativ via SSH:
```bash
git remote add origin git@gitea.ff-eberstalzell.local:gerald/hotdoc.git
```

### 1.3 Branch-Schutz (im Gitea-Webfrontend, optional)
- `main` als Default-Branch
- Settings → Branches → Branch protection für `main`: Direct push erlaubt für Entwickler

---

## 2. fly.io — Public Deployment

### 2.1 fly-CLI installieren
- Windows (PowerShell): `iwr https://fly.io/install.ps1 -useb | iex`
- macOS:                `curl -L https://fly.io/install.sh | sh`
- Linux:                `curl -L https://fly.io/install.sh | sh`

### 2.2 Account verknüpfen
```bash
fly auth login
```
(Browser öffnet sich, Login mit fly.io-Account)

### 2.3 App erzeugen (einmalig)
```bash
# Im Projekt-Root
fly apps create hotdoc-eberstalzell --org personal
```

Falls der Name schon belegt ist, in `fly.toml` einen anderen wählen
(z.B. `hotdoc-ffe`, `hotdoc-eberstalzell-prod`).

### 2.4 Erstes Deploy
```bash
fly deploy
```

Fly baut das Docker-Image aus dem `Dockerfile`, deployed es nach Frankfurt
(`fra`) und gibt am Ende die HTTPS-URL aus, z.B.:
`https://hotdoc-eberstalzell.fly.dev`

### 2.5 Updates deployen
```bash
git add . && git commit -m "..." && git push origin main
fly deploy
```

> CI/CD-Hook: Sobald wir das wollen, kann `fly deploy` aus einer
> Gitea-Action getriggert werden — kommt mit dem echten App-Build.

---

## 3. Wichtige fly.io Befehle für die Hosenträger-Phase

| Aufgabe                  | Befehl                                |
|--------------------------|---------------------------------------|
| Logs anschauen           | `fly logs`                            |
| Status der App           | `fly status`                          |
| App im Browser öffnen    | `fly open`                            |
| SSH in den Container     | `fly ssh console`                     |
| App stoppen (alle Machines) | `fly scale count 0`                |
| App löschen              | `fly apps destroy hotdoc-eberstalzell` |
| Secrets setzen           | `fly secrets set KEY=value`           |

---

## 4. Spätere Erweiterung (geplant)

Sobald aus dem Prototyp die echte PWA wird (React + Vite + PouchDB + Whisper.cpp),
ergänzen wir folgende Komponenten:

| Komponente            | Hosting                         | Domain (Vorschlag)            |
|-----------------------|---------------------------------|-------------------------------|
| PWA-Frontend          | fly.io (`hotdoc-eberstalzell`)  | hotdoc.ff-eberstalzell.at     |
| Backend API           | fly.io (`hotdoc-api`)           | api.hotdoc.ff-eberstalzell.at |
| CouchDB               | fly.io (`hotdoc-db`, mit Volume)| nicht öffentlich              |
| BlaulichtSMS-Poller   | fly.io machine (worker)         | nicht öffentlich              |
| syBOS-Sync-Worker     | fly.io machine (cron)           | nicht öffentlich              |

---

## 5. Lokaler Dev-Server

Zum Anschauen ohne fly.io:
```bash
python -m http.server 5500 --directory prototype/lfa-b
# dann http://localhost:5500
```

Oder über das Claude-Code-Preview-Setup in `.claude/launch.json` —
`preview-lfa-b-static` ist als Server konfiguriert.

---

## 6. Checkliste vor Produktiv-Start

- [ ] Gitea-Repo angelegt und initial gepusht
- [ ] fly.io-App `hotdoc-eberstalzell` erzeugt
- [ ] Erstes `fly deploy` erfolgreich (HTTPS-URL erreichbar)
- [ ] Custom-Domain `hotdoc.ff-eberstalzell.at` (optional) auf fly.io-IP gemappt
- [ ] BlaulichtSMS-Credentials als `fly secrets` hinterlegt (wenn API angebunden)
- [ ] syBOS-Token + IP-Whitelist in syBOS-Admin gesetzt
- [ ] Datenschutz-Hinweis-Dokument für FF Eberstalzell erstellt
