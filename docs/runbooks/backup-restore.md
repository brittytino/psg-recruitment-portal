# Backup and restore

## Backup

```sh
infrastructure/scripts/backup.sh                                       # local stack
ENV_FILE=.env.production infrastructure/scripts/backup.sh srportal-prod compose.production.yaml
```

Creates `backups/<UTC>/db.dump` (pg_dump custom), `storage.tar.gz`, `SHA256SUMS`, `manifest.txt`. Encrypt (e.g. `age`/`gpg`) and copy off-host; backups contain personal data.

## Verify a backup (non-destructive)

```sh
infrastructure/scripts/restore.sh backups/<ts> --yes --database srportal_restore_check --volume srp_restore_check
```

Compare row counts and file checksums with production, then drop the scratch database and volume.
Verified 2026-10-16: counts `12/8/61/23` (applications/revisions/audit/documents) identical; storage checksum identical.

## Full restore (destructive)

1. Announce downtime; `docker compose stop app worker` (production: `app-blue app-green worker`).
2. `infrastructure/scripts/restore.sh backups/<ts> --yes` (checksums verified first; refuses without `--yes`).
3. Start services; check `/healthz/ready`, sign in as HR, open a recent application and download its PDF.
4. Record the restore in the audit/incident log.
