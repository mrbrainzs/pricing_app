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
account/shared-list implementation. It is not applied to SQLite. User lists,
preferences and price alerts stay in device/browser local storage; there is no server
account, shared-list, real-time-sync or alerts service in this release.
Price alerts (F7) are checked by the app against `/api/catalog`: on start, when it
returns to the front after the daily update, and on phones in an OS-scheduled
background task (`expo-background-task`, no more often than every 6 hours; the OS
decides when). Notifications are local (`expo-notifications`, no push service or APNs
entitlement). The background task needs a development or store build; it never runs in
Expo Go or on the iOS simulator.
account implementation. It is not applied to SQLite. A user's own list and
preferences stay in device/browser local storage. Lists the user chooses to
share are stored in SQLite without accounts (see [Shared lists](#shared-lists-f10)).
There is no account, real-time push or alerts service in this release.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not used or needed.
No Supabase project or cloud data was provided to migrate.

The API runs as `www-data` on loopback `127.0.0.1:3007`, behind Nginx:

- `GET /api/health`: service/database status, source release and import timestamp.
- `GET /api/catalog`: imported products and freshest prices from the last seven days.
- `GET /api/history/<product-id>`: up to 90 days in a single pricing zone.
- `GET /api/index`: weekly basket index (F12), computed read-only from stored prices: the
  fixed 20-item basket (`INDEX_BASKET` in `packages/core/src/basketIndex.ts`) priced per chain
  as of the latest Monday 07:00 Europe/Madrid, plus the previous week and the change
  (`previous` is null until a week of data exists). Mercadona uses the warehouse with the
  most stores (`bcn1` if none); `zones` in the response says which. Cached for 10 minutes.
- `/api/lists…`: shared lists, the **only write endpoints** (below).

The catalogue endpoints are read-only and answer 405 to anything but GET.
SQLite files are never served by Nginx.
The web build uses `EXPO_PUBLIC_API_URL=/api`. A native build needs an absolute
HTTPS API URL and an appropriate CORS policy if used in another web origin.

Share links (F11, `/r/<data>`) point at the page's own origin on the web. Native
builds point them at `EXPO_PUBLIC_SITE_URL`, which defaults to
`https://quinsuper.trottedmedia.com`; set it at build time for another domain.
The card's data is inside the link, so the server stores nothing. Nginx already
serves `/r/…` with `index.html`. The page's title and description are set in the
browser, so chat apps show only the generic preview from `index.html`.
HTTPS API URL (e.g. `https://quinsuper.trottedmedia.com/api`); its origin is also
used for invite links. Use an appropriate CORS policy if the API is used from another web origin
(the API sends no CORS headers, so other websites can't call it from a browser).
Without recent imported data, the app falls back to explicitly labelled sample
data; samples are never mixed with imported prices or real store locations.
Without `EXPO_PUBLIC_API_URL` (sample mode) the app hides sharing and says why.

## Shared lists (F10)

Flatmates share one list without accounts. **The link is the key**: anyone who
has `https://quinsuper.trottedmedia.com/l/<id>` can see and edit that list, like
an unlisted document link. The id is 128 random bits (22 base64url characters),
never sequential, so it can't be guessed. The app shows "Anyone with the link can
see and edit this list" next to the Share button and on the shared list.

How it works: Share creates the list on the server and opens the share sheet
(on desktop browsers without one, "Send invite link" copies the link). Opening the
link shows the list and a Join button; joining replaces the list on that device
(the screen says so) and removes the id from the address bar. While shared, the
List tab polls every 4.5 s (and on focus / return to the app) and shows "Synced
Xs ago". Edits are sent as item operations; when offline they are queued on the
device (kept across restarts) and sent later, with backoff. "Leave list" keeps a
local copy and stops syncing. On a shared list, "Clear list" is replaced by
"Remove ticked items" so one tap can't empty it for everyone. If the server says
the list no longer exists, the items stay on the device as a local list.

### Endpoints

All bodies are JSON (`Content-Type: application/json`). An item is
`{ id, text, categoryId, level, quantity, checked }`; every field is required.

| Request | What it does |
|---|---|
| `POST /api/lists` `{ items }` | Creates a list (0–300 items). 201 with `{ id, version, updatedAt, items }`. |
| `GET /api/lists/<id>[?since=<version>]` | The list. With `since` equal to the current version: `{ id, version, updatedAt, unchanged: true }` and no items. |
| `POST /api/lists/<id>/ops` `{ ops }` | 1–100 operations, applied in order in one transaction: `{op:"add", item}`, `{op:"update", id, set:{…fields}}`, `{op:"remove", id}`. Returns the list plus `rejected` (adds refused because the list is full). The app uses this one. |
| `POST /api/lists/<id>/items` `item` | One add (409 `list_full` when full). |
| `PATCH /api/lists/<id>/items/<itemId>` `{…fields}` | One update. |
| `DELETE /api/lists/<id>/items/<itemId>` | One remove. |

Every write returns the whole list and its new `version` (+1 per request that
changed something). There is no endpoint to delete or list all lists.

**Conflict rule** (no `If-Match`, kept simple on purpose): operations on different
items never conflict. An update only sets the fields it names, so one person
ticking an item and another changing its quantity both survive; for the *same*
field the last write to reach the server wins. Removing wins: an update to a
removed item is ignored. Adding an item id that already exists does nothing, so
retries are safe. The app re-applies its unsent edits on top of every answer,
so nothing typed on a phone is lost while it waits.

### Limits and security

- JSON body ≤ 32 KB (413), `Content-Type` must be `application/json` (415);
  invalid UTF-8/JSON → 400. Nginx also refuses bodies over 64 KB.
- ≤ 300 items per list, item text 1–120 characters (no control or bidi-override
  characters), brand ≤ 60, quantity a whole number 1–99, `categoryId` null or a
  known category, item ids `[A-Za-z0-9_-]{1,40}`. Unknown fields are rejected at
  every level (400 with the field path and, for batches, the operation `index`;
  nothing in the batch is applied).
- Malformed or unknown list ids: 404 (same answer, nothing to probe). Wrong
  method: 405 with `Allow`.
- In-memory write rate limits (token buckets; `ingest/src/api.ts`,
  `DEFAULT_WRITE_LIMITS`). Every item operation or created item costs one:
  per client address 600 burst then 300/min; new lists per address 10 burst then
  20/hour; for everyone together 3000 burst then 3000/min, and 100 new lists
  burst then 600/hour. Refused attempts count. 429 with `Retry-After`.
  IPv6 addresses are grouped by /64. Reads are not limited.
- At most 20,000 stored lists; creating more answers 503 (bounds disk use, worst
  case ~1.5 GB, typical lists are a few KB).
- The client address is read from `X-Real-IP` only when the request comes from
  loopback (Nginx); `X-Forwarded-For` is ignored.
- No CORS headers, and the JSON content type forces a CORS preflight, so other
  websites can't write from a visitor's browser.
- List responses carry `X-Robots-Tag: noindex` and the invite page has a
  `noindex` meta tag, in case a link is posted publicly.
- While the daily import holds the database lock, a write waits at most 1.5 s and
  then answers 503 `busy` with `Retry-After`; the app retries.

**One-time server change (shared lists, Nov 2026).** The updater doesn't install
Nginx changes. Until an administrator runs the following, Nginx doesn't set
`X-Real-IP`: every visitor then shares the per-address write limit (all requests
come from 127.0.0.1), and a client could send its own `X-Real-IP` to dodge it (the
global limits still apply). It is safe to run twice:

```bash
f=/etc/nginx/sites-available/quinsuper
sudo grep -q 'X-Real-IP' "$f" || sudo sed -i 's|^\(\s*\)proxy_set_header X-Forwarded-Proto \$scheme;|&\n\1proxy_set_header X-Real-IP $remote_addr;\n\1client_max_body_size 64k;|' "$f"
sudo nginx -t && sudo systemctl reload nginx
```

### Data kept, expiry and deletion

Stored per list: the random id, a version number, created/updated/last-opened
times, and per item the fields above plus a position and update time. No names,
accounts, device ids, IP addresses or cookies. Item text is whatever people type,
so it can contain personal details; it is never logged (errors log only the
method and the database message). Nginx access logs do contain the list id in
request paths, like any link; they follow the host's log rotation.

A list nobody has opened or edited for **180 days** is deleted, with its items,
at API start and every 6 hours (opening a list refreshes its date at most once a
day). The daily backups (14 days) still contain deleted lists until they rotate
out. Rate-limit counters live only in memory.

To delete one list immediately (e.g. on request; the id is the last part of the
link). Deleting items explicitly matters because the `sqlite3` shell does not
enforce the cascade by default:

```bash
id='PASTE_THE_22_CHARACTER_ID'
sudo sqlite3 /var/lib/quinsuper/prices.sqlite "BEGIN; DELETE FROM shared_list_items WHERE list_id='$id'; DELETE FROM shared_lists WHERE id='$id'; COMMIT;"
```

Phones that still have the list open then show "This shared list no longer
exists" and keep their items locally. Count stored lists with
`sudo sqlite3 /var/lib/quinsuper/prices.sqlite "SELECT COUNT(*) FROM shared_lists"`.

The tables (`shared_lists`, `shared_list_items`) are created by
`CREATE TABLE IF NOT EXISTS` at API/importer start as schema version 3. Older
releases ignore them, so a code rollback keeps working (lists stay in the file).

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
