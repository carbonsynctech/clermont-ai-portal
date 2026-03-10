# syntax=docker/dockerfile:1
#
# Worker service — Node.js 22 + Python 3 (for linkedin_scraper + Playwright)
# Build context: repo root
# Railway config: Dockerfile path = apps/worker/Dockerfile

FROM node:22-slim

# ── System packages ─────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv curl \
    # Playwright/Chromium system dependencies
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libx11-6 libxcb1 \
    libxext6 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# ── Python: install linkedin_scraper + Playwright's Chromium ────────────────
RUN pip3 install linkedin-scraper --break-system-packages
RUN python3 -m playwright install chromium

# ── Node.js: install pnpm ────────────────────────────────────────────────────
RUN npm install -g pnpm@10.17.1

WORKDIR /app

# ── Install Node dependencies (monorepo-aware) ───────────────────────────────
# Copy only the manifests first so Docker can cache this layer
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY pnpm-lock.yaml ./
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/

RUN pnpm install --frozen-lockfile

# ── Ensure Puppeteer's Chrome is installed ─────────────────────────────────
RUN cd apps/worker && npx puppeteer browsers install chrome

# ── Copy full source ─────────────────────────────────────────────────────────
COPY . .

# ── Runtime ─────────────────────────────────────────────────────────────────
WORKDIR /app/apps/worker

EXPOSE 3001

# Run via tsx (packages export .ts source directly; no tsc compile step needed)
CMD ["node", "--require", "tsx/cjs", "src/index.ts"]
