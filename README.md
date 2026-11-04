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

The app currently runs on **sample prices**, clearly labelled in the app. Real prices arrive once the daily import writes to Supabase (below).

## Repository layout

```
packages/core   Shared logic (TypeScript, no UI): item catalogue in ca/es/en, list parsing,
                product classification, matching rules, basket comparison, freshness rules,
                price labels, sample data. Fully unit-tested.
ingest          Daily price importer (Mercadona first) -> JSON files or Supabase.
supabase        Database schema: catalogue, append-only price log, lists with row-level
                security, anonymous sign-in, invite links, real-time sync, alerts.
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

1. Create a Supabase project and run `supabase/migrations/20261104000000_init.sql`. Enable **anonymous sign-ins**, plus the Apple and Google providers for shared lists.
2. In the GitHub repo, add the secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. The **Daily prices** workflow (`.github/workflows/daily-prices.yml`) then runs every morning before 07:00 Barcelona time. You can also run it by hand from the Actions tab. Start it **now**: the good / normal / high price label needs at least 30 days of history.
4. Connect the app to Supabase (next milestone: a Supabase data source next to `app/src/data/source.ts`).

Before launch: get the Spanish IP lawyer review (EU database right, each chain's terms, Catalan consumer-language rules), and run a trademark search on the final name.

## Next milestones

- Supabase data source in the app, and importers for Bonpreu/Esclat, Caprabo, bonÀrea, DIA and Alcampo
- Price alerts with push notifications (F7), barcode scanner (F9), shared lists (F10), share card (F11), weekly basket index (F12)
- v1.1: receipt scanner (UC5), opening hours, flatmate cost splitting
