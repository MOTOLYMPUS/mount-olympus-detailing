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
# `--include=dev` is not optional: `next build` needs the devDependencies
# (typescript, tailwindcss, postcss, eslint-config-next). Hosts like Railway
# set NODE_ENV=production during the build, which would otherwise make `npm ci`
# silently drop them and the build would fail on a missing compiler/plugin.
RUN npm ci --include=dev

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

# Bind to 0.0.0.0 (mandatory inside a container — the default can be localhost,
# which the platform's health check cannot reach) on the port the host injects
# via $PORT, falling back to 3000 for local `docker run`. This is the fix for a
# build that succeeds but whose health check times out with "service
# unavailable": the app was up, just not reachable on the routed port/host.
CMD ["sh", "-c", "node node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
