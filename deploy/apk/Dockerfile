FROM caddy:2.8-alpine

# Caddy konfiguriert: APKs liegen in /srv, /healthz reply, statisches
# Listing fuer Browser-Access (Funktionaer kann dann auch Versionen
# vergleichen ohne Backoffice-UI).
COPY Caddyfile /etc/caddy/Caddyfile

# APK-Bundles werden direkt in das Image gebaut. Updates = Deploy.
COPY apks/ /srv/

EXPOSE 8080
