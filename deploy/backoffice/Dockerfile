# ───────────────────────────────────────────────────────────────
# HotDoc · Backoffice — Caddy + statisches Vite-Build
# ───────────────────────────────────────────────────────────────

FROM node:20.18-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@9.15.9 --no-fund --no-audit

COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/pwa/package.json apps/pwa/
COPY apps/backoffice/package.json apps/backoffice/

ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY apps/backoffice/ apps/backoffice/

RUN pnpm --filter @hotdoc/shared build && pnpm --filter @hotdoc/backoffice build

FROM caddy:2.8-alpine AS runtime
COPY --from=build /app/apps/backoffice/dist /srv
COPY deploy/backoffice/Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q --spider http://localhost:8080/healthz || exit 1
