#!/usr/bin/env bash
# One-time Nginx + HTTPS setup on the production Linux server (Debian/Ubuntu).
#
#   sudo infrastructure/nginx/host/setup-nginx.sh recruitments.psgtech.ac.in db.recruitments.psgtech.ac.in admin@psgtech.ac.in
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

install -d /etc/nginx/snippets
cat > /etc/nginx/snippets/psg-proxy.conf <<'EOF'
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_read_timeout 120s;
EOF
# Keep an existing IP allow-list; create an empty (allow everyone) one the first time.
[ -f /etc/nginx/snippets/psg-db-allow.conf ] || echo "# allow 1.2.3.4; deny all;" > /etc/nginx/snippets/psg-db-allow.conf

sed -e "s/__APP_DOMAIN__/$APP_DOMAIN/g" -e "s/__DB_DOMAIN__/$DB_DOMAIN/g" \
  "$HERE/psg-recruitment.conf" > /etc/nginx/sites-available/psg-recruitment.conf
ln -sf /etc/nginx/sites-available/psg-recruitment.conf /etc/nginx/sites-enabled/psg-recruitment.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

# HTTPS for both names (certbot edits the server blocks and adds the HTTP -> HTTPS redirect).
if [ -n "$EMAIL" ]; then
  certbot --nginx --non-interactive --agree-tos --redirect -m "$EMAIL" -d "$APP_DOMAIN" -d "$DB_DOMAIN"
else
  certbot --nginx --non-interactive --agree-tos --redirect --register-unsafely-without-email -d "$APP_DOMAIN" -d "$DB_DOMAIN"
fi
nginx -t && systemctl reload nginx

echo
echo "Done:"
echo "  https://$APP_DOMAIN      -> recruitment portal"
echo "  https://$DB_DOMAIN   -> database viewer (needs DB_VIEWER_ENABLED=true in .env, then ./prod.sh)"
echo "Restrict the DB viewer to campus IPs in /etc/nginx/snippets/psg-db-allow.conf, then: sudo systemctl reload nginx"
