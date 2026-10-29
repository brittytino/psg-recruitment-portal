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

- Ubuntu 22.04+/Debian 12, 4 GB RAM minimum (ClamAV needs ~2 GB), 40 GB disk.
- Docker Engine with the Compose plugin: `curl -fsSL https://get.docker.com | sh`
- Firewall: inbound **80** and **443** open; inbound 6969/6981 **closed** (they are bound to localhost anyway).
- Outbound **TCP 587 to smtp.gmail.com** (or the college SMTP relay) must be allowed. Sign-in codes are
  e-mailed, so without outbound SMTP nobody can sign in. `./prod.sh` checks this on every start.

## 3. Install

```sh
git clone https://github.com/brittytino/PSG-SRPortal.git /opt/psg-recruitment
cd /opt/psg-recruitment
./prod.sh                 # first run: creates .env with generated passwords/secrets and stops
nano .env                 # set APP_ORIGIN, SMTP_USER, SMTP_PASSWORD (Gmail app password)
                          # optional DB viewer: DB_VIEWER_ENABLED=true
./prod.sh                 # builds, migrates, seeds staff accounts, starts, waits until healthy
sudo infrastructure/nginx/host/setup-nginx.sh recruitments.psgtech.ac.in db.recruitments.psgtech.ac.in admin@psgtech.ac.in
```

Restrict the DB viewer to campus/admin IPs (recommended):

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
