# syntax=docker/dockerfile:1
#
# Web service — Next.js 16 standalone build
# Build context: repo root
# DigitalOcean App Platform: Dockerfile path = web/Dockerfile

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY web/package.json web/
COPY lib/package.json lib/
COPY database/package.json database/

RUN npm ci

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY --from=deps /app/lib/node_modules ./lib/node_modules
COPY --from=deps /app/database/node_modules ./database/node_modules
COPY . .

RUN npm run build --workspace=@repo/web

# ── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/web/public ./web/public

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./web/.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "web/server.js"]
