# =============================================================
# Stage 1: Install dependencies (with native build tools)
# =============================================================
FROM node:20-alpine AS deps

# python3 + make + g++ are required by node-gyp to compile better-sqlite3
# libc6-compat provides glibc compat shims needed by some native modules on musl
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

COPY package.json package-lock.json ./

# npm ci runs better-sqlite3's install script (node-gyp rebuild) automatically
RUN npm ci

# =============================================================
# Stage 2: Build the Next.js application
# =============================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder secret lets next build succeed without a real SESSION_SECRET.
# It is never used at runtime — the setup wizard or SESSION_SECRET env var replaces it.
ENV SESSION_SECRET=build_time_placeholder_not_used_in_production_xx

RUN npm run build

# =============================================================
# Stage 3: Production runner (minimal image)
# =============================================================
FROM node:20-alpine AS runner

# libstdc++ is needed by the better-sqlite3 native binary compiled against musl
RUN apk add --no-cache libc6-compat libstdc++

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Persistent data directory — mount a volume here to preserve state across restarts
ENV DATA_DIR=/data

# Create the data mount point with correct ownership before switching to non-root user
RUN mkdir -p /data && chown node:node /data

# Copy the standalone Next.js server (contains only what's needed to run node server.js)
COPY --from=builder --chown=node:node /app/.next/standalone ./

# Static assets are not embedded in standalone — must be copied separately
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Public directory
COPY --from=builder --chown=node:node /app/public ./public

# better-sqlite3 native binary — not auto-included by Next.js standalone file tracing
# (the tracer follows JS imports only; .node binaries are invisible to it)
RUN mkdir -p ./node_modules/better-sqlite3/build/Release
COPY --from=builder --chown=node:node \
  /app/node_modules/better-sqlite3/build/Release/better_sqlite3.node \
  ./node_modules/better-sqlite3/build/Release/better_sqlite3.node

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
