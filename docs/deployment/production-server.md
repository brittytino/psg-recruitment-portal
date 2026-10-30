# Production server setup (single Linux server)

This is the supported way to run the portal in production: Docker Compose (`./prod.sh`) behind the
host's Nginx. HTTPS uses **PSG Tech's own SSL certificate** (no Let's Encrypt / certbot).

| Address                                 | Serves                  | Notes                                                     |
| --------------------------------------- | ----------------------- | --------------------------------------------------------- |
| `https://recruitments.psgtech.ac.in`    | Recruitment portal      | App listens on `127.0.0.1:6969` only                      |
| `https://recruitmentsdb.psgtech.ac.in` | Database viewer (pgweb) | Read-only, password protected, optional; `127.0.0.1:6981` |

## 1. DNS and HTTPS (college IT team)

Both names must reach this server: `recruitments.psgtech.ac.in` and `recruitmentsdb.psgtech.ac.in`.
HTTPS is provided with the college certificate in one of two ways:

| Setup | What to do |
| --- | --- |
| **College HTTPS gateway** (default) — the gateway holds the certificate and forwards HTTP to this server's port 80 | Nothing on this server. Set the gateway's IP in `TRUSTED_PROXY_IPS` (`.env.production`, currently `10.1.10.162`) so the real visitor IP is used. The gateway must send `X-Forwarded-For` and `X-Forwarded-Proto: https`, and allow uploads of 25 MB (`client_max_body_size 25m`). |
| **Certificate installed on this server** | Copy the certificate chain and key to the server, then add to `secrets/override.env`:<br>`SSL_CERTIFICATE=/etc/ssl/psgtech/fullchain.pem`<br>`SSL_CERTIFICATE_KEY=/etc/ssl/psgtech/private.key`<br>and run `sudo ./prod.sh`. Nginx then serves HTTPS on 443 and redirects HTTP. |

When the certificate is renewed, replace the files and run `sudo systemctl reload nginx`.

## 2. Server requirements

- Ubuntu 22.04+ / Debian 12, 4 GB RAM minimum (ClamAV needs ~2 GB), 40 GB disk, a user with sudo.
- Inbound **80** open (and **443** when the certificate is installed on this server). Outbound **TCP 587 to smtp.gmail.com** open (sign-in codes are e-mailed).
- Nothing else: Docker and Nginx are installed by `./prod.sh`.

## 3. Install (the only steps)

```sh
git clone https://github.com/brittytino/psg-recruitment-portal.git /opt/psg-recruitment
cd /opt/psg-recruitment
./prod.sh
```

On the first run `./prod.sh`:

1. installs Docker if needed (asks for the sudo password),
2. creates `.env` from the committed `.env.production` with **freshly generated** database passwords and
   secrets (they never leave the server),
3. asks **once** for the Gmail app password of recruitments@psgtech.ac.in (hidden input). To run
   without any prompt: `SMTP_PASSWORD='xxxx xxxx xxxx xxxx' ./prod.sh`, or put it in `secrets/smtp_password`,
4. builds, migrates the database, creates the staff accounts and starts everything,
5. configures Nginx for both domains (with the college certificate if configured) and prints the URLs.

The Gmail password is not in the repository because the repository is public.

The DB viewer only opens from the IPs in `DB_VIEWER_ALLOW_IPS` (`.env.production`).

Servers set up earlier with Let's Encrypt keep using those certificates (no longer renewed) until the
college certificate is configured, so HTTPS never drops during the switch. After that they can be
removed: `sudo certbot delete --cert-name recruitments.psgtech.ac.in` (same for `recruitmentsdb…`).

## 4. Staff accounts created by the seed

| Role                      | E-mail                  |
| ------------------------- | ----------------------- |
| Super Admin (full access) | brittytino08@gmail.com  |
| Admin – Dean              | dean.admn@psgtech.ac.in |
| Admin – Principal         | principal@psgtech.ac.in |
| HR – N4 Section           | admin.n4@psgtech.ac.in  |
| HOD – CSE                 | hod.cse@psgtech.ac.in   |

Everyone signs in with a 6-digit code e-mailed to them. HR – N4 adds further departments and HODs in
**Departments & HODs**; each HOD receives an invitation e-mail.

## 5. Day-to-day

```sh
./prod.sh status | logs [app|worker] | restart | backup | seed | health
git pull && ./prod.sh      # update: rebuild, migrate, restart
```

Backups go to `backups/<timestamp>/` (database dump + uploaded files). Copy them off the server.

## Where files are stored

| What | Where |
| --- | --- |
| Uploaded documents (photos, signatures, certificates, PDFs) | Docker volume `psg-srportal_storage`, folder `uploads/<2 chars>/<random id>.<pdf, jpg or png>` |
| Generated application PDFs and consolidated bundles | Same volume, folder `generated/<application id>/` |
| Open-positions PDFs (Faculty: `/open-positions.pdf`, Research: `/research-positions.pdf`) | Same volume, folder `generated/notices/` |
| Which file belongs to whom | Database tables `application_documents` and `generated_documents`; readable views `reports.documents` and `reports.generated_pdfs` |

On the server the volume is at `/var/lib/docker/volumes/psg-srportal_storage/_data/` (inside the app
container: `/var/lib/srportal/storage/`). Files get random names, are never served directly by Nginx
and can only be downloaded through the portal by the candidate or authorised staff. PDFs that were
locked without a password (DigiLocker etc.) are stored as unlocked copies so they merge into the
application bundle. `./prod.sh backup` copies the database and this volume to `backups/<timestamp>/`.

## Upload size limit (413 errors)

Candidates may upload files of up to 20 MB (`MAX_UPLOAD_MB`). Nginx's default request limit is 1 MB, which rejects most PDFs with **413 Request Entity Too Large**.
`./prod.sh` sets `client_max_body_size 25m` for every site on this server
(`/etc/nginx/conf.d/psg-uploads.conf`). Check from any computer:

```sh
head -c 3000000 /dev/urandom > /tmp/3mb.bin
curl -s -o /dev/null -w "%{http_code}\n" -F "file=@/tmp/3mb.bin" \
  https://recruitments.psgtech.ac.in/applications/00000000-0000-0000-0000-000000000000/attachments
```

`401`, `403` or `404` means the upload reached the portal (fine). `413` means a proxy in front still has
the 1 MB default: if the college routes traffic through a separate gateway / reverse proxy, the IT team
must add `client_max_body_size 25m;` there as well.

## Sign-in codes not arriving ("e-mail service is unreachable")

Everyone signs in with an e-mailed code, so this blocks all sign-ins. Diagnose on the server:

```sh
sudo ./prod.sh mailtest                       # checks DNS, ports 587/465 and the Gmail login
sudo ./prod.sh mailtest someone@psgtech.ac.in # also sends a test e-mail
```

It prints the cause and the fix:

| Result | Fix |
| --- | --- |
| Ports 587 and 465 **not reachable** | The firewall blocks outgoing mail. Network team: allow outbound TCP 587 and 465 from this server to `smtp.gmail.com`. (The portal uses whichever of the two is open.) |
| Gmail **rejected the login** (535) | App password wrong or revoked. Create a new one for recruitments@psgtech.ac.in (2-Step Verification must be on) and run `sudo ./prod.sh smtp-password`. |
| Password **empty** | `sudo ./prod.sh smtp-password` |

## E-mail: Google Workspace SMTP Relay (main) with the Gmail account as fallback

Every e-mail (sign-in codes included) is sent through the **Google Workspace SMTP Relay**
(`smtp-relay.gmail.com`, about 10 000 a day) first. If the relay is not enabled yet, refuses a message,
cannot be reached or has used its daily budget, the same e-mail goes out through the **Gmail account**
(`SMTP_*`, about 500 a day) straight away, so users are never affected. After a relay failure the relay
is skipped for 10 minutes (no delay for people signing in) and then tried again.

**IT team — enable the relay** (Google Admin console → Apps → Google Workspace → Gmail → Routing →
SMTP relay service → Configure):

| Setting | Value |
| --- | --- |
| Allowed senders | Only addresses in my domains |
| Authentication | Only accept mail from the specified IP addresses → this server's **public** IP |
| Encryption | Require TLS encryption |

The repository already sets `SMTP_RELAY_HOST=smtp-relay.gmail.com`, port 587 and
`SMTP_RELAY_HELO=recruitments.psgtech.ac.in`. If IT prefers SMTP authentication instead of the IP
address, put `SMTP_RELAY_USER` and `SMTP_RELAY_PASSWORD` in `secrets/override.env`.

Check it on the server:

```sh
sudo ./prod.sh mailtest someone@psgtech.ac.in   # tests the relay, then the Gmail fallback
```

Budgets: `MAIL_RELAY_DAILY_BUDGET` (relay, default 9500) and `MAIL_DAILY_BUDGET` (Gmail account,
default 450). The Control centre shows both routes, today's usage and whether the relay is working.

## Read-only Viewers

The Super Admin and HR – N4 Section add people who may only read applications at
**Set-up → Viewers (read only)** (`/admin/viewers`). A viewer signs in with the usual e-mail code and can
list and open submitted applications and their documents — no changes, assignments, decisions,
exports, help desk or settings. Removing a viewer signs them out and disables the account.
Migration `20261102090000_viewer_role` only adds the role value.
