FROM caddy:2.8-alpine

# Build-Context ist Repo-Root (fly deploy ohne -context-Flag), daher
# Dockerfile-Pfade relativ vom Repo-Root.
COPY deploy/apk/Caddyfile /etc/caddy/Caddyfile

# APK-Bundles werden direkt in das Image gebaut. Updates = Deploy.
COPY deploy/apk/apks/ /srv/

EXPOSE 8080
