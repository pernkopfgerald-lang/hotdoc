# ───────────────────────────────────────────────────────────────
# HotDoc · API (Node 20 + Express + Puppeteer)
# Multi-stage Build mit pnpm workspace support
# ───────────────────────────────────────────────────────────────

# ─── Stage 1: deps (gemeinsamer Cache) ─────────────────────────
FROM node:20.18-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@9.15.9 --no-fund --no-audit

# Workspace-Konfig + alle package.json kopieren (Cache-effizient)
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/pwa/package.json apps/pwa/
COPY apps/backoffice/package.json apps/backoffice/

# Skip puppeteer chromium download (wir nutzen system-chromium)
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --frozen-lockfile

# ─── Stage 2: build ────────────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/
RUN pnpm --filter @hotdoc/shared build && pnpm --filter @hotdoc/api build

# ─── Stage 3: runtime ──────────────────────────────────────────
FROM node:20.18-bookworm-slim AS runtime
WORKDIR /app

# System-Chromium für puppeteer (kleiner als puppeteer-bundled)
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      libnss3 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libasound2 \
      libpangocairo-1.0-0 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      ca-certificates \
      tini \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

RUN npm install -g pnpm@9.15.9 --no-fund --no-audit

# Workspace-Struktur
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Built artifacts + Static assets (Logo für PDFs)
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/assets apps/api/assets

# Production-only deps
RUN pnpm install --frozen-lockfile --prod --filter @hotdoc/api...

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/dist/server.js"]
