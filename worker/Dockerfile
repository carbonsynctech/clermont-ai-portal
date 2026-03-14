# syntax=docker/dockerfile:1
#
# Worker service — Node.js 22 + Python 3 (for linkedin_scraper + Playwright)
# Build context: repo root
# DigitalOcean App Platform: Dockerfile path = worker/Dockerfile

FROM node:22-slim

# ── System packages ─────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv curl \
    # Playwright/Chromium system dependencies
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libx11-6 libxcb1 \
    libxext6 fonts-liberation \
    # Puppeteer Chrome dependencies (cairo, pango, etc.)
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    libffi-dev shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# ── Python: install linkedin_scraper + Playwright's Chromium ────────────────
RUN pip3 install linkedin-scraper --break-system-packages
RUN python3 -m playwright install chromium

WORKDIR /app

# ── Install Node dependencies (monorepo-aware) ───────────────────────────────
# Copy only the manifests first so Docker can cache this layer
COPY package.json package-lock.json ./
COPY worker/package.json worker/
COPY lib/package.json lib/
COPY database/package.json database/

RUN npm ci

# ── Ensure Puppeteer's Chrome is installed ─────────────────────────────────
RUN cd worker && npx puppeteer browsers install chrome

# ── Copy full source ─────────────────────────────────────────────────────────
COPY . .

# ── Runtime ─────────────────────────────────────────────────────────────────
WORKDIR /app/worker

EXPOSE 3001

# Run via tsx (packages export .ts source directly; no tsc compile step needed)
CMD ["node", "--require", "tsx/cjs", "src/index.ts"]
