# Retailer search-page fixtures

Anonymous captures made on 4 November 2026 for building the next price importers.
These are development fixtures, not price observations to import into production.
Original retailer page structure, product names, prices and product links are kept.
Transient token values and CSP nonces are redacted. No authenticated session,
cookie jar, response cookies or customer account data is included.

## bonÀrea

- File: `2026-11-04/bonarea-leche.html`.
- Source: https://www.bonarea-online.com/es/shop/find?searchWords=leche
- Captured by a direct HTTP request **from the production server**, HTTP 200.
- Contains product cards with names, pack quantities, shelf prices and unit prices.
- The server copy is `/var/lib/quinsuper-captures/2026-11-04/bonarea-leche.html`.

## Bonpreu / Esclat

- File: `2026-11-04/bonpreu-llet.html`.
- Source: https://www.compraonline.bonpreuesclat.cat/search?q=llet
- Direct search requests from the production server returned **HTTP 403**, even
  after visiting the public home page in an anonymous in-memory session.
- Captured the rendered DOM after navigating from the public home page and using
  its search box in an anonymous browser. No sign-in or delivery address was used.
- **Partial result:** the page displayed three featured product cards, with names,
  product URLs, pack counts, shelf prices and unit prices. The full milk search
  catalogue was not displayed. This fixture can support parsing those cards;
  it does not establish that an unattended server search importer will work.
- The server copy is `/var/lib/quinsuper-captures/2026-11-04/bonpreu-llet.html`.

`2026-11-04/manifest.json` records capture methods, URLs, timestamps, limitations,
byte counts and SHA-256 checksums. HTML is stored without Git line-ending
conversion so the checksums remain reproducible. The captures are third-party
retailer material retained as parser-development references.
