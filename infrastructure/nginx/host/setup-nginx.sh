#!/usr/bin/env bash
# One-time Nginx + HTTPS setup on the production Linux server (Debian/Ubuntu).
#
#   sudo infrastructure/nginx/host/setup-nginx.sh recruitments.psgtech.ac.in recruitmentsdb.psgtech.ac.in admin@psgtech.ac.in
#
# Before running: both DNS A records must point to this server, and ports 80 and 443 must be open.
# Re-running is safe: it rewrites the site config and lets certbot renew/expand the certificate.
set -Eeuo pipefail

APP_DOMAIN="${1:?usage: setup-nginx.sh <app-domain> [db-domain] [certbot-email]}"
DB_DOMAIN="${2:-db.$APP_DOMAIN}"
EMAIL="${3:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }

if ! command -v nginx >/dev/null 2>&1 || ! command -v certbot >/dev/null 2>&1; then
  apt-get update
  apt-get install -y nginx certbot python3-certbot-nginx
fi

install -d /etc/nginx/snippets /etc/nginx/conf.d
# Upload limit at http level: applies to every site on this Nginx, including any server block the
# IT team configured for the same domain. Nginx's default is 1 MB, which rejects most PDFs (413).
cat > /etc/nginx/conf.d/psg-uploads.conf <<'EOF'
client_max_body_size 25m;
client_body_timeout 300s;
proxy_request_buffering on;
EOF
cat > /etc/nginx/snippets/psg-proxy.conf <<'EOF'
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_read_timeout 120s;
EOF
# DB viewer access list. DB_VIEWER_ALLOW_IPS (space/comma separated IPs or CIDRs, from .env) is
# written on every run; when it is empty the existing file is kept, or everyone is denied.
ALLOW_FILE=/etc/nginx/snippets/psg-db-allow.conf
if [ -n "${DB_VIEWER_ALLOW_IPS:-}" ]; then
  {
    echo "# Managed by ./prod.sh from DB_VIEWER_ALLOW_IPS in .env.production"
    for ip in ${DB_VIEWER_ALLOW_IPS//,/ }; do echo "allow $ip;"; done
    echo "deny all;"
  } > "$ALLOW_FILE"
elif [ ! -f "$ALLOW_FILE" ]; then
  echo "deny all;  # set DB_VIEWER_ALLOW_IPS in .env.production" > "$ALLOW_FILE"
fi

sed -e "s/__APP_DOMAIN__/$APP_DOMAIN/g" -e "s/__DB_DOMAIN__/$DB_DOMAIN/g" \
  "$HERE/psg-recruitment.conf" > /etc/nginx/sites-available/psg-recruitment.conf
ln -sf /etc/nginx/sites-available/psg-recruitment.conf /etc/nginx/sites-enabled/psg-recruitment.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

# HTTPS: one certificate per name, so a DNS problem with the DB name never removes HTTPS from the
# portal. Existing valid certificates are reused (no Let's Encrypt rate-limit issues on re-runs).
if [ -n "$EMAIL" ]; then ACCOUNT=(-m "$EMAIL"); else ACCOUNT=(--register-unsafely-without-email); fi
status=0
for d in "$APP_DOMAIN" "$DB_DOMAIN"; do
  certbot --nginx --non-interactive --agree-tos --redirect --keep-until-expiring     "${ACCOUNT[@]}" --cert-name "$d" -d "$d" || { echo "HTTPS for $d failed (does its DNS A record point here?)" >&2; status=1; }
done
nginx -t && systemctl reload nginx

echo
echo "Done:"
echo "  https://$APP_DOMAIN      -> recruitment portal"
echo "  https://$DB_DOMAIN   -> database viewer (needs DB_VIEWER_ENABLED=true in .env, then ./prod.sh)"
echo "DB viewer allowed from: $(grep -o 'allow [^;]*' "$ALLOW_FILE" | cut -d' ' -f2 | tr '
' ' ')"
exit "$status"
