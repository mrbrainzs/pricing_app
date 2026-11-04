# Quin Súper

**Where is your weekly shop cheapest, for your own list, near you?** A free app for Barcelona (Catalonia next) in Catalan, Spanish and English. It compares Mercadona, Alcampo, bonÀrea, Caprabo, DIA and Bonpreu/Esclat.

*"Quin Súper" is a working name. See [docs/product-review.md](docs/product-review.md) for why it replaced "Cabàs", plus the other decisions made against the v1 spec.*

## What works now

- **Onboarding (F1):** language (defaults to the phone's), postal code or GPS, usual chains. No account.
- **Generic shopping list (F3):** type "llet", "leche" or "milk" (typos are fine). Each item can be own brand / any / a specific brand, with a quantity. Names show in all three languages.
- **Paste a list:** WhatsApp messages, bullet lists, "2 kg patates", "llet x2", "12 ous" (one dozen, not twelve).
- **Basket comparison (F4):** the nearest store of each chain, ranked by what your list costs there, with distance, items found and the gap to the next store. Optional "up to 2 stores" mode, shown only when it saves your minimum (default €3). Directions and share.
- **Product search (F2)** in any of the three languages, plus a **product page (F5)**: price per chain, unit prices, own-brand equivalents, good / normal / high price label, 90-day history (F6).
- **Freshness labels (F8)** on every price: source and time. Prices older than 3 days are flagged; older than 7 days are dropped.

The deployed app reads real prices from a **local SQLite database** through a read-only API. The daily importer runs on the same server. When no recent prices are available, explicitly labelled sample data is shown instead. Prices are imported for **Mercadona**, **Consum** (added as a seventh chain: open catalogue, many shops around Barcelona) and **bonÀrea**. Store locations come from OpenStreetMap, refreshed weekly by the same import; chains without prices yet are named in the app instead of ranked. DIA and Bonpreu/Esclat refuse automated requests (HTTP 403).

## Repository layout

```
packages/core   Shared logic (TypeScript, no UI): item catalogue in ca/es/en, list parsing,
                product classification, matching rules, basket comparison, freshness rules,
                price labels, sample data. Fully unit-tested.
ingest          Daily price importer -> JSON or local SQLite, and read-only HTTP API.
deploy          Ubuntu/Nginx, systemd services, daily imports, backups, deployment updater.
supabase        Unused original schema reference for future account/shared-list features.
app             Expo app (iOS, Android, web) using Expo Router.
docs            Product review and decisions.
```

## Running it

Requires Node 22.

```bash
npm install
```

```bash
npm test
```

Start the app (press `w` for web, or scan the QR code with Expo Go):

```bash
npm run start -w app
```

Try the Mercadona import locally (writes `ingest/out/*.json`; stop after 3 categories):

```bash
npm run ingest -w @pricing/ingest -- --chain mercadona --postal 08012 --max-categories 3
```

## Going live with real prices

Production: https://quinsuper.trottedmedia.com. See [docs/deployment.md](docs/deployment.md) for the full setup and operations guide.

Pushes to the repository's default branch (`claude/cabas-scaffold`) run tests, type checks, lint and builds in GitHub Actions. The server picks up a passing release within about a minute. No deployment keys or Supabase secrets are needed.

The server imports prices at **05:30 Europe/Madrid** into `/var/lib/quinsuper/prices.sqlite` and backs up the database daily. For a local SQLite import:

```bash
DATABASE_PATH="$PWD/prices.sqlite" npm run ingest -w @pricing/ingest -- --sink sqlite --postal 08012 --max-categories 3
```

The good / normal / high label needs at least 30 days of price history. Lists and preferences stay on the device; shared lists and accounts are not implemented.

The owner asked to skip arranging the Spanish IP lawyer review on 4 November 2026. No legal opinion or trademark clearance has been obtained; the optional brief remains in `docs/prelaunch-review.md`.

## Next milestones

- Price importers for Alcampo and Caprabo; DIA and Bonpreu/Esclat block automated requests (partnership or receipts instead)
- Price alerts with push notifications (F7), barcode scanner (F9), shared lists (F10), share card (F11), weekly basket index (F12)
- v1.1: receipt scanner (UC5), opening hours, flatmate cost splitting
