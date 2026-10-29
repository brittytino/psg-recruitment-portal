# Production server setup (single Linux server)

This is the supported way to run the portal in production: Docker Compose (`./prod.sh`) behind the
host's Nginx with Let's Encrypt certificates.

| Address                                 | Serves                  | Notes                                                     |
| --------------------------------------- | ----------------------- | --------------------------------------------------------- |
| `https://recruitments.psgtech.ac.in`    | Recruitment portal      | App listens on `127.0.0.1:6969` only                      |
| `https://db.recruitments.psgtech.ac.in` | Database viewer (pgweb) | Read-only, password protected, optional; `127.0.0.1:6981` |

## 1. DNS (ask the college IT team)

Create two **A records** pointing to the server's public IP:

```
recruitments.psgtech.ac.in       A   <server IP>
db.recruitments.psgtech.ac.in    A   <server IP>
```

## 2. Server requirements

- Ubuntu 22.04+ / Debian 12, 4 GB RAM minimum (ClamAV needs ~2 GB), 40 GB disk, a user with sudo.
- Inbound **80** and **443** open. Outbound **TCP 587 to smtp.gmail.com** open (sign-in codes are e-mailed).
- Nothing else: Docker, Nginx and HTTPS certificates are installed by `./prod.sh`.

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
5. configures Nginx + Let's Encrypt for both domains and prints the URLs.

The Gmail password is not in the repository because the repository is public.

To restrict the DB viewer to campus/admin IPs (recommended):

```sh
echo "allow 14.139.0.0/16; deny all;" | sudo tee /etc/nginx/snippets/psg-db-allow.conf   # use your real ranges
sudo nginx -t && sudo systemctl reload nginx
```

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
