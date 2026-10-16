# Rollback

## Application rollback (fast, no data change)

```sh
ENV_FILE=.env.production ./infrastructure/blue-green/rollback.sh
```

Starts/verifies the previous color, runs smoke tests, switches Nginx back, rolls the worker image back. Possible only while the previous color has not been retired.

## If Nginx routing is broken

`state/upstream/active.conf.prev` holds the last good config. Copy it to `active.conf`, then `docker compose -p srportal-prod exec nginx nginx -t && … nginx -s reload`.

## Database

Application rollback never reverts migrations. Because ordinary releases only **expand** the schema, the previous version keeps working. If a migration itself is faulty:

1. Stop writes (`stop app-blue app-green worker`), take a backup.
2. Write a forward-fixing migration (preferred), or restore the pre-deploy backup (data entered since is lost — requires approval).
