# Control-plane database backup

Terraform state already versions in Spaces
([terraform-state.md](terraform-state.md)). This is the same idea for the
API database: a custom-format `pg_dump` under a private prefix in
`aerodeck-tfstate`.

GitHub Actions and a laptop cannot open the private Postgres host. Run the
backup and the restore **on the Droplet**, from the recovery console or SSH.

The bucket is already private and versioned. Prefix:

```text
backups/control-plane/<env>/<alembic-revision>/<utc-stamp>.dump
```

## Backup

On the Droplet, with the Spaces key pair in the environment (the same pair
CI uses as `SPACES_ACCESS_KEY_ID` / `SPACES_SECRET_ACCESS_KEY`). Do not write
them into git or into `/etc/aerodeck/control-plane.env`.

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
# scripts are in the image at /app/scripts, or copy them next to each other
sudo --preserve-env=AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY \
  bash /root/backup-database.sh dev
```

The script reads `AERODECK_DATABASE_URL` from
`/etc/aerodeck/control-plane.env`, dumps with `postgres:16-alpine`, and
uploads. It prints the revision and the object key. It does not print the
database URL or the Spaces secret.

Repeat for staging or prod only from that environment's Droplet.

## Restore

Restore into a **new** database, not over the live cluster, until you have
read a plan that shows the app pointed at the new URI.

1. Pick the object key in Spaces → `aerodeck-tfstate` →
   `backups/control-plane/<env>/`.
2. Note the revision directory (`0008`, or whatever Alembic revision the
   dump was taken at).
3. On the Droplet, refuse the download unless that revision is the one you
   mean to restore:

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
python3 /root/database_backup.py check-key \
  --key 'backups/control-plane/dev/0008/20261018T020000Z.dump' \
  --expect 0008
python3 /root/database_backup.py fetch \
  --key 'backups/control-plane/dev/0008/20261018T020000Z.dump' \
  --expect 0008 \
  --dest /tmp/control-plane.dump
```

`check-key` and `fetch` exit before any download when the revision in the
key is not `--expect`. That is the wrong-version stop. Do not pass a
different `--expect` to force the file through.

4. Create a new database (DigitalOcean console or a reviewed CI change).
   From the Droplet, restore into that URI. Do not `terraform apply` from
   a laptop.

```bash
docker run --rm --network host -v /tmp:/tmp postgres:16-alpine \
  pg_restore --dbname='postgresql://USER:PASSWORD@private-…:25060/NEWDB?sslmode=require' \
  --no-owner --no-acl /tmp/control-plane.dump
```

5. Point `AERODECK_DATABASE_URL` at the new URI only after `pg_restore`
   finishes, then restart with `start-on-droplet.sh`. Confirm
   `alembic current` matches the revision you expected.

## Related

- State versions: [terraform-state.md](terraform-state.md).
- Startup: [startup-control-plane.md](startup-control-plane.md).
