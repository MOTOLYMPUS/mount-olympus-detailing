# ─────────────────────────────────────────────────────────────────────────────
# Mount Olympus Detailing — production container.
#
# Node 24 on purpose: the database uses Node's BUILT-IN `node:sqlite` module,
# which is only reliable on Node 24+. Do not downgrade the base image — an older
# Node will fail at runtime the first time a request touches the database.
#
# There is NO native compilation here (node:sqlite ships with Node), so the
# slim image is enough — no python/make/gcc layer required.
#
# PERSISTENCE: the app writes its SQLite file and uploaded photos to disk. Mount
# a persistent volume at /data and the two ENV lines below point the app at it.
# WITHOUT a mounted volume every deploy starts empty — see DEPLOY.md.
# ─────────────────────────────────────────────────────────────────────────────

# ── deps: install once, cache well ──────────────────────────────────────────
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Site URL is compiled into the client bundle at build time, so it must be
# present here — not only at runtime. The host passes it as a build arg.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
RUN npm run build

# ── run ──────────────────────────────────────────────────────────────────────
FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Only what the server needs to run.
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/scripts ./scripts

# Default the data + upload paths at the volume mount point. The host can
# override these, but these defaults mean "mount a volume at /data and it works".
ENV DATABASE_PATH=/data/data.sqlite
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads

EXPOSE 3000
CMD ["npm", "run", "start"]
