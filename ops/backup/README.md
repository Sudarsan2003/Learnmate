# Database backups

`backup-db.sh` makes a compressed, encrypted copy of a school's LearnMate database, checks
that the copy can be read back, and keeps the last 14 days. `restore-db.sh` puts a backup
back. Run the backup once a day using **one** of the two setups below.

Each school's copy of LearnMate has its own database, so set up backups for each school.

## The passphrase

Backups contain every student's details, so they are encrypted with a passphrase you choose
(`BACKUP_PASSPHRASE`). Make it long and random, for example:

```bash
openssl rand -base64 32
```

Store it in a password manager **outside** the server and GitHub. A backup can't be
restored without it, and nobody can recover a lost passphrase.

## Option A: GitHub Actions (no server needed)

The workflow in `.github/workflows/db-backup.yml` runs every night at 02:00 IST and keeps
each backup for 30 days as a downloadable artifact.

1. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:
   - `DATABASE_URL`: `postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require`
     (from your database provider's connection details)
   - `BACKUP_PASSPHRASE`: the passphrase above
2. Open **Actions → Database backup → Run workflow** once to check it works.
3. Backups appear under each run's **Artifacts**.

The database must accept connections from the internet (most hosted databases do, with
SSL). If yours only allows your own server, use option B.

## Option B: cron on your server

Install the PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) at the same or a
newer version than the database server, then add a crontab entry
(`crontab -e`):

```cron
0 2 * * * cd /path/to/Learnmate && DATABASE_URL='postgresql://...' BACKUP_PASSPHRASE='...' BACKUP_DIR=/var/backups/learnmate ops/backup/backup-db.sh >> /var/log/learnmate-backup.log 2>&1
```

If the server already has the app's `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`
and `SPRING_DATASOURCE_PASSWORD` set, you can use those instead of `DATABASE_URL`.

Backups on the same machine as the database don't survive that machine failing. To copy
each backup elsewhere automatically, install [rclone](https://rclone.org), set up a remote
(Google Drive, S3, …) and add `BACKUP_RCLONE_REMOTE=yourremote:LearnMate-backups`.

Other settings: `BACKUP_KEEP_DAYS` (default 14) and `BACKUP_NAME` (file name prefix,
default `learnmate`; use the school's name if several schools share a folder).

## Restoring

Always restore into a new, empty database first and check it before switching the app to
it. The target database needs the `pgvector` extension available.

```bash
createdb learnmate_restored
psql learnmate_restored -c 'CREATE EXTENSION vector'
BACKUP_PASSPHRASE='...' ops/backup/restore-db.sh learnmate-2026-10-27T20-30-00Z.dump.enc postgresql://localhost:5432/learnmate_restored
```

`restore-db.sh` refuses to write into a database that already has tables. To overwrite one
deliberately (for example, rolling the live database back), add `--replace` as the last
argument.

## Test it

A backup you have never restored is a guess. Once a month, download the latest backup,
restore it into a spare database as above, and check that the student count it prints looks
right.
