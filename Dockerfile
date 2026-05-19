# ─────────────────────────────────────────────────────────────
# HotDoc · Static Prototype Image
#
# Serves the prototype/lfa-b/ folder via Caddy on port 8080.
# Replace with Node.js + Vite build once the real app exists.
# ─────────────────────────────────────────────────────────────
FROM caddy:2.8-alpine

# Static site content
COPY prototype/lfa-b/ /srv/

# Caddy config
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q --spider http://localhost:8080/healthz || exit 1
