#!/usr/bin/env bash
# Nginx setup on the production Linux server (Debian/Ubuntu). Run by ./prod.sh; safe to re-run.
#
#   sudo infrastructure/nginx/host/setup-nginx.sh recruitments.psgtech.ac.in recruitmentsdb.psgtech.ac.in
#
# HTTPS uses PSG Tech's own certificate (no Let's Encrypt / certbot):
#   * Behind the college HTTPS gateway (default): the gateway holds the certificate and forwards
#     plain HTTP to this server on port 80. Nothing to configure here.
#   * Directly on this server: set SSL_CERTIFICATE and SSL_CERTIFICATE_KEY (paths to the college
#     certificate chain and private key on this server) in secrets/override.env; this script then
#     enables HTTPS on 443 and redirects HTTP to HTTPS.
#
# Environment (passed by ./prod.sh from .env):
#   DB_VIEWER_ALLOW_IPS   IPs/CIDRs allowed to open the DB viewer (space or comma separated)
#   TRUSTED_PROXY_IPS     the college gateway's IPs; the visitor's real IP is taken from its
#                         X-Forwarded-For header (needed for the DB allow-list and rate limits)
#   SSL_CERTIFICATE, SSL_CERTIFICATE_KEY   optional, see above
set -Eeuo pipefail

APP_DOMAIN="${1:?usage: setup-nginx.sh <app-domain> [db-domain]}"
DB_DOMAIN="${2:-db.$APP_DOMAIN}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }

if ! command -v nginx >/dev/null 2>&1; then
  apt-get update
  apt-get install -y nginx
fi

install -d /etc/nginx/snippets /etc/nginx/conf.d

# Upload limit at http level: applies to every site on this Nginx. Nginx's default is 1 MB, which
# rejects most PDFs (413).
cat > /etc/nginx/conf.d/psg-uploads.conf <<'EOF'
client_max_body_size 25m;
client_body_timeout 300s;
proxy_request_buffering on;
EOF

# Real visitor IP behind the college gateway (only trusted from the configured gateway addresses).
{
  echo "# Managed by ./prod.sh from TRUSTED_PROXY_IPS in .env.production"
  if [ -n "${TRUSTED_PROXY_IPS:-}" ]; then
    for ip in ${TRUSTED_PROXY_IPS//,/ }; do echo "set_real_ip_from $ip;"; done
    echo "real_ip_header X-Forwarded-For;"
    echo "real_ip_recursive on;"
  fi
} > /etc/nginx/conf.d/psg-real-ip.conf

cat > /etc/nginx/snippets/psg-proxy.conf <<'EOF'
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $psg_forwarded_proto;
proxy_set_header X-Forwarded-Host $host;
proxy_read_timeout 120s;
EOF

# DB viewer access list. Written on every run; when DB_VIEWER_ALLOW_IPS is empty the existing file
# is kept, or everyone is denied.
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

# HTTPS listeners for one site: the college certificate when configured; otherwise, only to avoid
# an outage on servers set up before this change, certificates already on disk (never renewed here).
tls_lines() { # tls_lines <domain> -> nginx lines (sed-escaped newlines), or empty for HTTP only
  local domain="$1" cert="" key=""
  if [ -n "${SSL_CERTIFICATE:-}" ] || [ -n "${SSL_CERTIFICATE_KEY:-}" ]; then
    cert="${SSL_CERTIFICATE:-}"; key="${SSL_CERTIFICATE_KEY:-}"
    [ -r "$cert" ] || { echo "SSL_CERTIFICATE not readable: $cert" >&2; exit 1; }
    [ -r "$key" ] || { echo "SSL_CERTIFICATE_KEY not readable: $key" >&2; exit 1; }
  elif [ -r "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
    cert="/etc/letsencrypt/live/$domain/fullchain.pem"; key="/etc/letsencrypt/live/$domain/privkey.pem"
    echo "WARNING: $domain still uses an old Let's Encrypt certificate (it will NOT be renewed)." >&2
    echo "         Install the college certificate: set SSL_CERTIFICATE / SSL_CERTIFICATE_KEY in secrets/override.env." >&2
  else
    return 0
  fi
  printf 'listen 443 ssl;\\n    listen [::]:443 ssl;\\n    http2 on;\\n    ssl_certificate %s;\\n    ssl_certificate_key %s;\\n    include /etc/nginx/snippets/psg-ssl.conf;\\n    if ($scheme = http) { return 301 https://$host$request_uri; }' "$cert" "$key"
}
cat > /etc/nginx/snippets/psg-ssl.conf <<'EOF'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:psg_ssl:10m;
ssl_session_timeout 1d;
EOF
TLS_APP="$(tls_lines "$APP_DOMAIN")"
TLS_DB="$(tls_lines "$DB_DOMAIN")"
if [ -n "$TLS_APP" ]; then MODE_TEXT="HTTPS on port 443 (redirects HTTP)"; else MODE_TEXT="HTTP on port 80 (HTTPS provided by the college gateway)"; fi

sed -e "s/__APP_DOMAIN__/$APP_DOMAIN/g" -e "s/__DB_DOMAIN__/$DB_DOMAIN/g"   -e "s|# __TLS_APP__|$TLS_APP|" -e "s|# __TLS_DB__|$TLS_DB|"   "$HERE/psg-recruitment.conf" > /etc/nginx/sites-available/psg-recruitment.conf
ln -sf /etc/nginx/sites-available/psg-recruitment.conf /etc/nginx/sites-enabled/psg-recruitment.conf
rm -f /etc/nginx/sites-enabled/default

# "http2 on" needs Nginx 1.25.1+; older versions use "listen 443 ssl http2".
if ! nginx -t 2>/dev/null; then
  sed -i -e '/^    http2 on;$/d' -e 's/listen 443 ssl;/listen 443 ssl http2;/' -e 's/listen \[::\]:443 ssl;/listen [::]:443 ssl http2;/' \
    /etc/nginx/sites-available/psg-recruitment.conf
fi
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo
echo "Nginx ready: $MODE_TEXT"
echo "  $APP_DOMAIN  -> recruitment portal"
echo "  $DB_DOMAIN   -> database viewer (needs DB_VIEWER_ENABLED=true)"
echo "DB viewer allowed from: $(grep -o 'allow [^;]*' "$ALLOW_FILE" | cut -d' ' -f2 | tr '\n' ' ')"
