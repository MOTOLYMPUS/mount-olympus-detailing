#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# new-tenant.sh — scaffold one more app slot in the self-hosted multi-app setup.
#
# Adding an app by hand means editing three files in lockstep (an env file, a
# compose service + volume, a Caddy site) and it is easy to get one out of sync —
# a typo'd service name and the proxy 502s, a missing volume and the app starts
# empty. This does all three atomically from stable markers, generates the
# per-app rate-limit salt, and refuses to half-apply.
#
# USAGE:
#   scripts/new-tenant.sh <slug> <domain> [build-context]
#
#   slug           short id, lowercase letters/digits/dashes, e.g. client-two
#   domain         the app's domain, e.g. clienttwo.com  (www. is added for you)
#   build-context  path to that app's repo for `docker build`. Defaults to ".."
#                  (THIS repo) — pass a path when the tenant is a different app.
#
# EXAMPLES:
#   scripts/new-tenant.sh client-two clienttwo.com
#   scripts/new-tenant.sh acme acmedetailing.com ../acme-repo
#
# AFTER IT RUNS:
#   1. Fill in deploy/app-<slug>.env  (secrets — it seeds the salt for you)
#   2. Point DNS: A @ and A www → this server's IP
#   3. cd deploy && docker compose -f docker-compose.multi.yml up -d --build app-<slug>
#
# Safe to read before running: it prints a plan and every file it will touch,
# and does nothing until all checks pass.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Locate the repo + deploy dir relative to this script, not the caller ─────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_DIR/deploy"

COMPOSE="$DEPLOY_DIR/docker-compose.multi.yml"
CADDY="$DEPLOY_DIR/Caddyfile"
ENV_EXAMPLE="$DEPLOY_DIR/app-mountolympus.env.example"

die() { echo "✗ $*" >&2; exit 1; }

# ── Arguments ────────────────────────────────────────────────────────────────
[ $# -ge 2 ] || die "usage: scripts/new-tenant.sh <slug> <domain> [build-context]"
SLUG="$1"
DOMAIN="$2"
CONTEXT="${3:-..}"

# slug: lowercase, digits, dashes; must start with a letter (valid as a Docker
# service name and a compose volume key).
[[ "$SLUG" =~ ^[a-z][a-z0-9-]*$ ]] || die "slug must be lowercase letters/digits/dashes and start with a letter (got: $SLUG)"
# domain: a basic sanity check, not a full RFC validator.
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "that does not look like a domain (got: $DOMAIN)"

SERVICE="app-${SLUG}"
VOLUME="data_${SLUG//-/_}"          # dashes are illegal in some volume contexts; underscore them
ENV_FILE="$DEPLOY_DIR/app-${SLUG}.env"

# ── Preconditions ────────────────────────────────────────────────────────────
[ -f "$COMPOSE" ] || die "missing $COMPOSE — run this from the app repo"
[ -f "$CADDY" ]   || die "missing $CADDY"
[ -f "$ENV_EXAMPLE" ] || die "missing env template $ENV_EXAMPLE"
grep -q "NEW-TENANT-SERVICE" "$COMPOSE" || die "compose file has no NEW-TENANT-SERVICE marker"
grep -q "NEW-TENANT-VOLUME"  "$COMPOSE" || die "compose file has no NEW-TENANT-VOLUME marker"
grep -q "NEW-TENANT-SITE"    "$CADDY"   || die "Caddyfile has no NEW-TENANT-SITE marker"

# Idempotency: never touch anything if this tenant already exists anywhere.
if grep -q "^  ${SERVICE}:" "$COMPOSE" || [ -f "$ENV_FILE" ] || grep -q "reverse_proxy ${SERVICE}:" "$CADDY"; then
  die "tenant '$SLUG' already exists (service, env file, or Caddy block present). Remove it first, or pick another slug."
fi

# A per-app secret so rate-limit counters are stable across restarts. openssl is
# on every server; fall back to /dev/urandom if not.
if command -v openssl >/dev/null 2>&1; then
  SALT="$(openssl rand -hex 32)"
else
  SALT="$(head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi

SITE_URL="https://${DOMAIN}"

echo
echo "Plan:"
echo "  slug          $SLUG"
echo "  service       $SERVICE"
echo "  volume        $VOLUME"
echo "  domain        $DOMAIN (+ www.$DOMAIN)"
echo "  build context $CONTEXT"
echo "  env file      $ENV_FILE   (new)"
echo "  edits         $COMPOSE, $CADDY"
echo

# ── 1. Env file ──────────────────────────────────────────────────────────────
# Start from the template, then set the two values we can fill safely.
cp "$ENV_EXAMPLE" "$ENV_FILE"
# Seed the generated salt (portable sed -i via a temp file to avoid GNU/BSD diffs).
tmp="$(mktemp)"
sed "s|^IP_HASH_SALT=.*|IP_HASH_SALT=${SALT}|" "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
echo "✓ wrote $ENV_FILE (IP_HASH_SALT seeded; other secrets left blank for you)"

# ── 2. Compose service (inserted above the NEW-TENANT-SERVICE marker) ────────
IFS= read -r -d '' SERVICE_BLOCK <<YAML || true
  ${SERVICE}:
    build:
      context: ${CONTEXT}
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SITE_URL: ${SITE_URL}
    restart: unless-stopped
    env_file:
      - ./app-${SLUG}.env
    volumes:
      - ${VOLUME}:/data
    networks:
      - web
    deploy:
      resources:
        limits:
          memory: 512M

YAML

# awk inserts the block on the line BEFORE the marker, leaving the marker intact
# for the next run. Passed via -v with newlines preserved.
awk -v block="$SERVICE_BLOCK" '
  /NEW-TENANT-SERVICE \(do not remove this line\)/ { printf "%s", block }
  { print }
' "$COMPOSE" > "$tmp" && mv "$tmp" "$COMPOSE"

# ── 3. Compose volume ────────────────────────────────────────────────────────
awk -v vol="  ${VOLUME}:" '
  /NEW-TENANT-VOLUME \(do not remove this line\)/ { print vol }
  { print }
' "$COMPOSE" > "$tmp" && mv "$tmp" "$COMPOSE"
echo "✓ added service '${SERVICE}' and volume '${VOLUME}' to docker-compose.multi.yml"

# ── 4. Caddy site block ──────────────────────────────────────────────────────
IFS= read -r -d '' SITE_BLOCK <<CADDYCONF || true
# ── ${DOMAIN} ──
${DOMAIN}, www.${DOMAIN} {
	reverse_proxy ${SERVICE}:3000
	encode zstd gzip
}

CADDYCONF

awk -v block="$SITE_BLOCK" '
  /NEW-TENANT-SITE \(do not remove this line\)/ { printf "%s", block }
  { print }
' "$CADDY" > "$tmp" && mv "$tmp" "$CADDY"
echo "✓ added ${DOMAIN} to Caddyfile → ${SERVICE}:3000"

# ── Done ─────────────────────────────────────────────────────────────────────
cat <<DONE

Tenant '${SLUG}' scaffolded. Next:

  1. Secrets:  edit ${ENV_FILE}
               (RESEND_API_KEY, STRIPE_*, etc. — IP_HASH_SALT is already set)

  2. DNS:      point  ${DOMAIN}  and  www.${DOMAIN}  at this server's IP
               (A records). TLS is issued automatically once they resolve.

  3. Launch:   cd ${DEPLOY_DIR}
               docker compose -f docker-compose.multi.yml up -d --build ${SERVICE}

  4. First run (only for an instance of THIS app):
               docker compose -f docker-compose.multi.yml exec ${SERVICE} \\
                 npm run create-admin -- "Owner Name" owner@example.com

DONE
