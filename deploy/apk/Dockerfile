FROM caddy:2.8-alpine

# Build-Context ist Repo-Root (fly deploy ohne -context-Flag), daher
# Dockerfile-Pfade relativ vom Repo-Root.
COPY deploy/apk/Caddyfile /etc/caddy/Caddyfile

# Landing-Page + Release-Info + Logo
COPY deploy/apk/index.html /srv/index.html
COPY deploy/apk/apk-info.json /srv/apk-info.json
COPY deploy/apk/ff-logo.png /srv/ff-logo.png

# APK-Bundles werden direkt in das Image gebaut. Updates = Deploy.
COPY deploy/apk/apks/ /srv/

EXPOSE 8080
