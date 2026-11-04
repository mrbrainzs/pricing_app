# QuinSuper deployment

URL: https://quinsuper.trottedmedia.com
Server: 204.168.165.248 (Ubuntu, existing Nginx)
Source branch: `claude/cabas-scaffold` (repository default)
Build branch: `deploy/quinsuper` (generated files only; do not edit)

## Deployment pipeline

`.github/workflows/deploy.yml` runs on each push to the source branch, or manually
from GitHub Actions. It installs the locked dependencies, runs tests, TypeScript
checks and Expo lint, builds the web app and bundles the Node API/importer.
Only after all checks pass does it publish the build branch using GitHub's
built-in `GITHUB_TOKEN`. The workflow then verifies that the HTTPS health endpoint
reports the exact source commit and that the home page returns HTTP 200.
No repository secrets or server SSH keys are required.
The public repository must remain readable by the server for this mechanism.

`quinsuper-update.timer` checks the build branch every minute. A new release
is extracted into `/var/www/quinsuper/releases/<build-commit>`, the `current`
symlink switches atomically, and the API restarts. A failed API health check
rolls back to the previous release. Updates wait while the importer runs.
Existing releases are retained for rollback; monitor disk space.
Server service definitions are managed separately in `deploy/`; changes to them
require an administrator to install them and reload systemd.

## Local database and API

Production uses **SQLite**, not Supabase. The persistent file is
`/var/lib/quinsuper/prices.sqlite`, outside all release and web directories.
The schema is initialized idempotently in `ingest/src/database.ts`, with a
migration-version record. It covers chains, categories, verified stores,
products, size changes and an append-only price-observation log. WAL mode
allows imports alongside API reads; each save is transactional and repeated
observations are deduplicated.

The original `supabase/migrations/` file is an unused reference for a future
account/shared-list implementation. It is not applied to SQLite. User lists
and preferences stay in device/browser local storage; there is no server
account, shared-list, real-time-sync or alerts service in this release.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not used or needed.
No Supabase project or cloud data was provided to migrate.

The API runs as `www-data` on loopback `127.0.0.1:3007`, behind Nginx:

- `GET /api/health`: service/database status, source release and import timestamp.
- `GET /api/catalog`: imported products and freshest prices from the last seven days.
- `GET /api/history/<product-id>`: up to 90 days in a single pricing zone.

There are no network write endpoints. SQLite files are never served by Nginx.
The web build uses `EXPO_PUBLIC_API_URL=/api`. A native build needs an absolute
HTTPS API URL and an appropriate CORS policy if used in another web origin.

Share links (F11, `/r/<data>`) point at the page's own origin on the web. Native
builds point them at `EXPO_PUBLIC_SITE_URL`, which defaults to
`https://quinsuper.trottedmedia.com`; set it at build time for another domain.
The card's data is inside the link, so the server stores nothing. Nginx already
serves `/r/…` with `index.html`. The page's title and description are set in the
browser, so chat apps show only the generic preview from `index.html`.
Without recent imported data, the app falls back to explicitly labelled sample
data; samples are never mixed with imported prices or real store locations.

## Daily import and backups

`quinsuper-import.timer` runs the local importer at **05:30 Europe/Madrid**,
including daylight-saving changes. It survives reboot and catches missed runs.
Price importers: **Mercadona** (whole catalogue, per warehouse), **Consum**
(one search per generic item; one online price for all shops, zone `cat`) and
**bonÀrea** (one search page per generic item, read from the HTML product cards;
one price for all of Catalonia, zone `cat`). The bonÀrea reader was built and
tested against a real page captured from this server
(`ingest/fixtures/retailer-search/`). Each
chain runs on its own: if one fails, the others still import and the service
exits with an error so the failure is visible in systemd. A Consum run that finds
almost nothing is treated as a failure instead of being saved.

**One-time server change (Nov 2026):** the import unit must run `--chain all`
instead of `--chain mercadona`, or only Mercadona keeps importing. Update service
files are not installed by the updater, so an administrator runs:

```bash
sudo sed -i 's/--chain mercadona/--chain all/' /etc/systemd/system/quinsuper-import.service
sudo systemctl daemon-reload
```

Chains not yet imported: DIA refuses automated requests (HTTP 403, as found by
the open-source Preuet project). Bonpreu/Esclat's search also returns HTTP 403 to
this server (checked 4 Nov 2026), so an unattended importer isn't possible without
their permission or a partnership. Alcampo and Caprabo are untested.

Products are sorted into generic items at import time, so classification fixes
reach existing products at the next import. Products that no longer match stop
getting new prices and drop out of the catalogue after 7 days.

The old Supabase GitHub import
workflow was replaced with this local timer so SQLite stays on the server.
A request timeout, retry/backoff and sequential request delay are configured.
Unverified postal-code zones cause failure instead of silently assigning a zone.

### Store locations (OpenStreetMap)

The same import service refreshes **store locations** from OpenStreetMap (Overpass
API) when the stored list is more than 7 days old, before importing prices. No
new systemd unit is needed. It covers Mercadona, Alcampo, bonÀrea, Caprabo, DIA and
Bonpreu/Esclat shops in and around Barcelona city.

- Each Mercadona store gets the warehouse (price zone) that Mercadona reports for
  the store's own postal code. Stores whose zone cannot be verified are skipped
  and counted in the log, never given a guessed zone. The price import then also
  covers every warehouse that has a store.
- Single-price chains (bonÀrea, Bonpreu/Esclat) use zone `cat`. The other chains
  use `bcn` until they have a price importer, which must use the same zone names.
- The stored list is replaced in one transaction, and only when the result looks
  complete (at least 20 stores from at least 3 chains). If OpenStreetMap is down or
  returns too little, the previous list stays and the price import still runs.
- Chains with stores nearby but no prices yet are named in the app ("No prices yet
  for: …") instead of being ranked.

Store data is © OpenStreetMap contributors under the Open Database License
(ODbL). The app shows that credit. Because `/api/catalog` publishes the store
list, that data stays under the ODbL.

Force a refresh by hand (stores only, no prices):

```bash
cd /var/www/quinsuper/current
sudo -u www-data env DATABASE_PATH=/var/lib/quinsuper/prices.sqlite \
  /opt/quinsuper-node/bin/node server/ingest.mjs --sink sqlite --stores only
```

Check the last refresh:

```bash
sudo sqlite3 /var/lib/quinsuper/prices.sqlite "SELECT * FROM import_runs"
```

Consum stores (brand or name starting with "Consum") are included; Charter
franchises and anything else merely containing the word "consum" are not.

`quinsuper-backup.timer` creates and integrity-checks an online SQLite backup
at **04:30 Europe/Madrid**, including committed WAL data, retaining 14 days
under `/var/backups/quinsuper`. These are on-host backups; off-host recovery
is not configured. Database and backups are private to service/root users.

## Operations

```bash
systemctl status quinsuper-api
systemctl list-timers 'quinsuper-*'
journalctl -u quinsuper-update -u quinsuper-import --since today
curl -fsS https://quinsuper.trottedmedia.com/api/health
systemctl start quinsuper-update.service
systemctl start quinsuper-import.service
systemctl start quinsuper-backup.service
```

For a bounded import (avoid running concurrently with the service):

```bash
cd /var/www/quinsuper/current
sudo -u www-data env DATABASE_PATH=/var/lib/quinsuper/prices.sqlite \
  /opt/quinsuper-node/bin/node server/ingest.mjs --sink sqlite \
  --chain mercadona --postal 08012 --details none --max-categories 3
```

For initial provisioning, inspect the host, copy `deploy/` and run
`bash deploy/provision.sh` as root. It adds a separate Nginx vhost, verifies
the Node 22 download checksum and obtains a Let's Encrypt certificate.
It does not replace the existing site's configuration. After a tested build
exists, run the updater and enable the update/import/backup timers.
Certificate renewal uses the existing Certbot scheduler and an Nginx reload hook.

Rollback switches `/var/www/quinsuper/current` to a retained release and restarts
`quinsuper-api.service`. Stop the update timer while investigating a rollback,
otherwise it will reactivate the latest build. Code rollback does not roll back
the persistent database. Review schema changes for backward compatibility.

## Legal review

The owner asked to skip arranging the lawyer review on 4 November 2026.
No Spanish IP legal opinion or trademark clearance has been obtained.
The optional review brief remains in `docs/prelaunch-review.md`.
