# VPS deployment preparation

> Not yet performed on a real VPS. Everything below was exercised only in the local simulation.

## Assumptions

Ubuntu 24.04 LTS (or Debian 12), 4 vCPU / 8 GB RAM / 80 GB SSD minimum (ClamAV ≈ 2 GB RAM, LibreOffice ≈ 1 GB), Docker Engine 27+ with Compose plugin, a DNS A record (e.g. `recruitment.<college-domain>`).

## Host setup

```sh
sudo ufw default deny incoming && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
sudo adduser --system --group deploy && sudo usermod -aG docker deploy
sudo mkdir -p /opt/srportal && sudo chown deploy /opt/srportal
git clone <repo> /opt/srportal && cd /opt/srportal
cp .env.example .env.production   # set real values; chmod 600
```

Required `.env.production` values: `APP_ORIGIN=https://<domain>`, `COOKIE_SECURE=true`, database passwords and URLs, `SESSION_SECRET` (48+ random bytes), `CONVERTER_TOKEN`, SMTP host/port/user/password/from. Never bake secrets into images.

## TLS

Copy `infrastructure/nginx/tls.conf.example` over `default.conf` (keeping the `include` of the upstream file at the top), obtain certificates with certbot (webroot `/var/www/certbot`), mount `/etc/letsencrypt` read-only into Nginx, and schedule `certbot renew` + `nginx -s reload` (systemd timer).

## Networking

Only Nginx publishes 80/443. PostgreSQL and Redis are on the `data` network with `internal: true`; converter/ClamAV are on `backend`; blue/green have no published ports.

## First deployment

```sh
docker login ghcr.io
./infrastructure/blue-green/deploy.sh ghcr.io/<org>/<repo>/app:<sha12>
```

Then create the first Super Admin (runs only while none exists; prints a one-time 72-hour setup link):

```sh
ENV_FILE=.env.production sh -c '. infrastructure/blue-green/lib.sh; dc --profile ops run --rm -e BOOTSTRAP_ADMIN_EMAIL=admin@<college-domain> -e APP_ORIGIN=https://<domain> migrate node build-worker/seed.js'
```

## Operations

- Logs: `docker compose -p srportal-prod logs -f app-blue app-green worker nginx` (json-file, rotated 5×20 MB).
- Health: `/healthz/live` public; readiness only from inside the network.
- Storage capacity: monitor `docker system df -v` and the `srportal-prod_storage` and `pgdata` volumes; alert at 80 %.
- Backups: nightly `infrastructure/scripts/backup.sh srportal-prod compose.production.yaml` with `ENV_FILE=.env.production`, encrypted and copied off-host; monthly restore test into a scratch database (`restore.sh … --database scratch --volume scratch`).

## CI/CD secrets (GitHub environment `production`, with required reviewers)

`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`. Image registry uses `GITHUB_TOKEN`. Protect `main` (PR + 1 approving review from the other developer + green CI).
