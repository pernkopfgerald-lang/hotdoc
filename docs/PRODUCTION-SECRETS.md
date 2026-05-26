# HotDoc · Produktiv-Setup · Secrets

**Stand:** 2026-05-27
**Zielgruppe:** Funktionär / Admin der FF Eberstalzell vor der ersten Live-Schaltung

---

## Warum

Bis jetzt waren folgende sensitive Werte in `fly.api.toml` als `[env]`-Block
hinterlegt und damit im Git-Repository committed:

- `JWT_SECRET` (signiert Login-Tokens)
- `COUCH_USER` / `COUCH_PASS` (CouchDB-Admin-Zugang)
- `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` (initialer Admin)

Für den Produktivbetrieb gehört das in **`fly secrets`** — getrennt vom Repo,
nur über `flyctl` einseh-/änderbar, automatisch aus den fly-Machines per
Restricted-Filesystem geliefert.

---

## Migration in 4 Schritten

### 1. JWT_SECRET rotieren (KRITISCH — Wert ist in Git-History)

Beim Rotieren werden alle aktuell aktiven Logins (Tablets + Backoffice)
ungültig. Plane das in eine ruhige Phase ein. Alle User loggen sich danach
einmal neu ein.

```bash
# Neuen Secret generieren (256 bit)
NEW_JWT=$(python -c "import secrets;print(secrets.token_hex(48))")
echo "$NEW_JWT" | wc -c   # → 97 (96 hex chars + newline)

# Als Fly-Secret setzen (stage = noch kein Redeploy)
fly secrets set JWT_SECRET="$NEW_JWT" -a hotdoc-api --stage
```

### 2. CouchDB-Zugang in Secrets verschieben (KEIN Rotieren)

Werte unverändert — wir wollen nur den Storage-Ort wechseln, nicht die
Werte. CouchDB-Admin-Passwort rotieren ist ein eigener Vorgang (Punkt 5).

```bash
# Hole aktuelle Werte aus fly.api.toml und setze sie als Secret
fly secrets set COUCH_USER="admin" -a hotdoc-api --stage
fly secrets set COUCH_PASS="<aktueller Wert aus fly.api.toml>" -a hotdoc-api --stage
```

### 3. Bootstrap-Admin-Credentials in Secrets (oder ganz entfernen)

Der initiale Admin existiert bereits in CouchDB. Die `BOOTSTRAP_*`-Variablen
werden nur beim ersten Server-Start geprüft. Sie können also entweder in
Secrets verschoben oder ganz entfernt werden.

```bash
# Variante A: behalten (für den Fall dass CouchDB neu aufgesetzt wird)
fly secrets set BOOTSTRAP_ADMIN_USERNAME="admin" -a hotdoc-api --stage
fly secrets set BOOTSTRAP_ADMIN_PASSWORD="<neuer starker Wert>" -a hotdoc-api --stage

# Variante B: komplett entfernen — dann muss bei jedem CouchDB-Reset
# manuell ein Admin in CouchDB angelegt werden via _users-API
```

### 4. Alle gestagten Secrets gleichzeitig deployen

```bash
fly secrets deploy -a hotdoc-api
```

Dies triggert ein einmaliges Redeploy der API mit den neuen Secrets. Die
fly.api.toml `[env]`-Werte werden überschrieben (Secrets haben Priorität).

### 5. fly.api.toml bereinigen + committen

Nach erfolgreichem Deploy: die `JWT_SECRET`/`COUCH_*`/`BOOTSTRAP_*`-Zeilen
aus `fly.api.toml` entfernen. Die Werte werden nicht mehr gelesen — sie sind
jetzt in Secrets.

```diff
 [env]
   NODE_ENV = "production"
   PORT     = "3000"
   COUCH_URL = "http://hotdoc-db.internal:5984"
   COUCH_DB  = "hotdoc"
   AUDIO_RETENTION_DAYS = "30"
-  COUCH_USER = "admin"
-  COUCH_PASS = "hotdoc-dev-changeme-now"
-  JWT_SECRET = "..."
-  BOOTSTRAP_ADMIN_USERNAME = "admin"
-  BOOTSTRAP_ADMIN_PASSWORD = "admin12345678"
```

Commit + push nach Gitea.

---

## Verifikation

```bash
fly secrets list -a hotdoc-api
# Erwartete Einträge (zusätzlich zu BLAULICHTSMS_*/SYBOS_*):
#   JWT_SECRET
#   COUCH_USER
#   COUCH_PASS
#   BOOTSTRAP_ADMIN_USERNAME
#   BOOTSTRAP_ADMIN_PASSWORD
```

Smoke-Test nach Deploy:

```bash
curl -X POST https://hotdoc-api.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<das aktuelle Passwort>"}'
# Erwartet: 200 mit Token
```

---

## CouchDB-Passwort rotieren (separater Vorgang)

CouchDB's Admin-Passwort ist als Env-Var im CouchDB-Container hinterlegt
(`fly.couchdb.toml`). Rotieren erfordert:

1. Neues Passwort in `fly secrets set COUCH_PASS=<neu> -a hotdoc-db`
2. CouchDB neu starten (`fly machine restart -a hotdoc-db`)
3. API-Secret entsprechend setzen `fly secrets set COUCH_PASS=<neu> -a hotdoc-api`
4. API neu starten

Bei diesem Schritt ist der Server für ~30s nicht erreichbar — also nicht
während eines aktiven Einsatzes machen.

---

## Wo sind Secrets gespeichert?

| Secret | Wo gesetzt | Wer braucht es |
|---|---|---|
| `JWT_SECRET` | `hotdoc-api` | API (Token signieren) |
| `COUCH_USER` / `_PASS` | `hotdoc-api` | API (DB-Zugang) |
| `BOOTSTRAP_ADMIN_*` | `hotdoc-api` | Erster Start |
| `SYBOS_API_URL` / `_TOKEN` | `hotdoc-api` | syBOS-Sync |
| `BLAULICHTSMS_*` | `hotdoc-api` | Alarm-Poller |
| CouchDB-Admin | `hotdoc-db` | CouchDB-Boot |

**Niemals committed:** alle obigen Secrets.
**Im Repo OK:** Service-URLs (`SYBOS_API_URL` value selbst), Public-Konfig.
