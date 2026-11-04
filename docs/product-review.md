# Product review and decisions (Nov 2026)

A critical pass over the v1 spec ("Cabàs — Features & Use Cases", 13 Oct 2026) before building. Short version: the plan is sound, but the core idea is not unique, so the edge has to come from being **Catalan-first, local and trustworthy**.

## Name: Cabàs → Quin Súper (working name)

"Cabàs" (a traditional Catalan shopping basket) is a lovely word but a risky brand:

- An app called **Cabas** already exists for shared family grocery lists, with real-time sync and share-by-link. That is our F10, in the same app-store category.
- **"El Cabàs"** is already a Catalan shopping app (Tordera council's local-shop loyalty app) and a consumer co-op.
- It literally means "shopping basket", so it describes the product. That makes it weak as a trademark and hard to defend.
- The "à" is awkward in store search and web addresses, and it means nothing to the newcomer persona.

**Quin Súper** ("which supermarket?") is the question the app answers. It is Catalan-first, easy for Spanish speakers, and quick searches found no app using it. It is a **working name**: before committing, search the OEPM and EUIPO trademark registers (classes 9, 35, 42), both app stores, and domains. The name lives in `app/src/i18n.ts` (`APP_NAME`) and `app/app.json`, so renaming is quick.

## Competition

Spain already has many comparison apps: Findit, Precios del Super, CUCO, Mercastic, SuperPrecios, OkLista, OCU Market and Soysuper. The closest is **Preuet**, an open-source Barcelona basket comparer with single-store and two-store suggestions, using Bonpreu, bonÀrea and DIA prices. UC1 is not unique.

Where v1 can win:

1. **Catalan chains done well.** Most Spain-wide apps skip Bonpreu/Esclat, bonÀrea and Caprabo.
2. **Real stores near you**, with distance, not just chain averages.
3. **Trust.** Every price shows its source and age. Missing items are never counted as €0. Stale prices are excluded.
4. **Newcomers and flatmates**: names in three languages, own-brand explanations, shared lists.

## Risks in the spec, and what we changed

| Risk | Decision |
|---|---|
| The 90-day price label (F5/F6) needs 90 days of data, and launch is ~2 months away | **Start the daily price import now.** With no history the app says "not enough history yet", and the label appears after 30 days. |
| Matching generic items across chains decides whether users trust the answer | A curated trilingual catalogue of ~40 generic items, each with a reference size. Prices are normalised to that size, and packs far from it are ignored, so a 6 L pack can't "win" a 1 L milk comparison. |
| A store missing items looks cheaper | Missing items are ranked at their median price elsewhere and listed by name. Baskets missing more than 20% are flagged and ranked lower (spec rule). |
| Scraping: legal and fragile | Each chain's importer is separate and can be switched off. The importer identifies itself and is rate-limited. **The Spanish IP lawyer review (EU database right, each chain's terms) still has to happen before launch.** Add Catalan consumer-language rules to that review. |
| Online prices vs shelf prices | Every price is labelled "online price" with its time. The 95%-within-€0.05 accuracy target needs real spot checks once the import runs. |
| Accounts | Decided: **no account to start**. Supabase anonymous sign-in. Apple or Google sign-in only to share a list (and later for alerts across devices). |
| Default language | Decided: **follow the phone**. Catalan → Catalan, Spanish → Spanish, anything else → English. Switchable at any time. |
| Launch area | v1 covers **Barcelona city** (08001–08042); the metropolitan area comes later. |
| Minimum saving to suggest a second store | €3 default (spec), adjustable in settings. |

## Features added to v1

- **Paste a list from WhatsApp.** Paste "llet x2, 12 ous, pa…" or a WhatsApp export and it becomes list items. That's how flats and couples already share lists.
- **Item names in three languages.** Every item shows "Llet · Leche · Milk". It helps newcomers and fits a Catalan-first brand.

## Suggested for later

1. Split costs among flatmates (who paid, who owes): retention for the flatmates persona. *v1.1*
2. Opening hours and "open now" in the ranking. Most Barcelona supermarkets close on Sundays. *v1.1 (spec had v1.2)*
3. Gluten-free, lactose-free, vegan and halal baskets.
4. Fake-discount check: a "was €X" price checked against the 90-day history.
5. Savings tracker: "you saved €18 this month".
6. Delivered-basket comparison, including delivery fee and minimum order.
7. Public shrinkflation list. The importer already records size changes.
8. Home-screen widget: "Cheapest near you this week".
9. Get listed on Softcatalà's directory of Catalan-language apps.
