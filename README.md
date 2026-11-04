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
- **Share card (F11):** Share on a result shows a card (store, total, items found, saving vs the next store, priciest items, date) and shares a link to it. The link (`/r/…`) opens the same card in any browser without the app, in the sharer's language with a switcher, plus a "Make your own list" button. The card's data travels in the link itself; nothing is stored on the server. On iOS and Android the card can also be shared as an image.
- **Weekly basket index (F12):** every Monday at 07:00 the same 20 everyday items are priced at each chain. The List tab shows the ranking and the change since last week; tapping it shows every item per chain. Chains missing more than 20% of the items are listed but not ranked.
- **Open now:** each store in the comparison shows "Open now", "Closed · opens 09:00" or "Hours unknown", from its OpenStreetMap opening hours in Barcelona time (public holidays included; hours we can't read are never guessed).
- **Price alerts (F7):** on a product, "Alert me when the price drops" with a target price or "any drop". Alerts stay on the device. The app checks them against fresh prices when it opens and when it comes back to the front after the daily update. Phones get a local notification (product, new price, chain, previous price) and also try a background check, but the phone decides when that runs. The web shows drops in the app only. Manage alerts from Settings.
- **Shared lists (F10), without accounts:** "Share list" sends a private link (`/l/<id>`); anyone with it can join, add, tick and remove items. Changes sync by polling every few seconds; edits made offline are queued and sent later. "Leave list" keeps a local copy. Details, limits and data kept: [docs/deployment.md](docs/deployment.md#shared-lists-f10).

The deployed app reads real prices from a **local SQLite database** through the API (read-only, except for shared lists). The daily importer runs on the same server. When no recent prices are available, explicitly labelled sample data is shown instead. Prices are imported for **Mercadona**, **Consum** (added as a seventh chain: open catalogue, many shops around Barcelona) and **bonÀrea**. Store locations come from OpenStreetMap, refreshed weekly by the same import; chains without prices yet are named in the app instead of ranked. DIA and Bonpreu/Esclat refuse automated requests (HTTP 403).

## Repository layout

```
packages/core   Shared logic (TypeScript, no UI): item catalogue in ca/es/en, list parsing,
                product classification, matching rules, basket comparison, freshness rules,
                price labels, sample data. Fully unit-tested.
ingest          Daily price importer -> JSON or local SQLite, and read-only HTTP API.
deploy          Ubuntu/Nginx, systemd services, daily imports, backups, deployment updater.
supabase        Unused original schema reference for future account features.
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

The good / normal / high label needs at least 30 days of price history. Lists and preferences stay on the device unless a list is shared; there are no accounts. Sharing needs `EXPO_PUBLIC_API_URL` (`/api` on the web; an absolute `https://…/api` in a native build, whose origin is also used for invite links). Without it the app runs on sample data and hides sharing.

The owner asked to skip arranging the Spanish IP lawyer review on 4 November 2026. No legal opinion or trademark clearance has been obtained; the optional brief remains in `docs/prelaunch-review.md`.

## Next milestones

- Price importers for Alcampo and Caprabo (send a captured search page from the server, as for bonÀrea); DIA and Bonpreu/Esclat block automated requests (partnership or receipts instead)
- Test the phone-only parts on a device (development build): camera scanning, local notifications and the background price check, image sharing
- Universal / app links so shared-list and share-card links open the installed app
- v1.1: receipt scanner (UC5), flatmate cost splitting, delivery-cost comparison
