import { describe, expect, it, vi } from 'vitest';
import { consumSearchTerms, parseConsumPrice, parseConsumProduct, scrapeConsum, type ConsumProduct } from '../src/chains/consum';
import { PoliteClient } from '../src/http';

// Hand-written items in the shape of tienda.consum.es/api/rest/V1.0/catalog/product.
// Replace with recorded responses once the importer has run against the live shop.
const milk: ConsumProduct = {
  id: 7230,
  ean: '8410000000123',
  productData: { name: 'Leche Entera', description: 'Leche Entera Brik 1 L', url: 'https://tienda.consum.es/es/p/leche-entera/7230', brand: { name: 'CONSUM' } },
  priceData: { prices: [{ id: 'PRICE', value: { centAmount: 0.99, centUnitAmount: 0.99 } }], unitPriceUnitType: '1 L' },
};
const oil: ConsumProduct = {
  id: 88123,
  ean: '8410000000456',
  productData: { description: 'Aceite de Oliva Virgen Extra Botella 750 ml', brand: { name: 'CARBONELL' } },
  priceData: {
    prices: [{ id: 'PRICE', value: { centAmount: 8.25, centUnitAmount: 11 } }, { id: 'OFFER_PRICE', value: { centAmount: 6.95, centUnitAmount: 9.27 } }],
    unitPriceUnitType: '1 L',
  },
};
const gel: ConsumProduct = {
  id: 4411,
  productData: { description: 'Gel de Ducha Avena 750 ml', brand: { name: 'CONSUM' } },
  priceData: { prices: [{ id: 'PRICE', value: { centAmount: 1.65, centUnitAmount: 2.2 } }], unitPriceUnitType: '1 L' },
};
const yogurt: ConsumProduct = {
  id: 3001,
  productData: { description: 'Yogur Natural Pack 4x125 g', brand: { name: 'CONSUM' } },
  priceData: { prices: [{ id: 'PRICE', value: { centAmount: 1.2, centUnitAmount: 0.24 } }], unitPriceUnitType: '100 g' },
};

describe('Consum parsing', () => {
  it('reads name, brand, EAN, own brand, category and size from price ÷ unit price', () => {
    expect(parseConsumProduct(milk)).toMatchObject({
      chain: 'consum', chainProductId: '7230', name: 'Leche Entera Brik 1 L', brand: 'CONSUM', ean: '8410000000123',
      isOwnBrand: true, categoryId: 'milk', size: { amount: 1, unit: 'l' },
    });
    expect(parseConsumProduct(oil)).toMatchObject({ isOwnBrand: false, categoryId: 'olive_oil_ev', size: { amount: 0.75, unit: 'l' } });
  });

  it('keeps the regular price and notes a lower offer', () => {
    const p = parseConsumProduct(oil)!;
    expect(parseConsumPrice(oil, p.size, '2026-11-05T04:30:00Z')).toMatchObject({ price: 8.25, unitPrice: 11, zone: 'cat', promotion: 'offer 6.95', source: 'online' });
  });

  it('converts "per 100 g" unit prices to per kg', () => {
    const p = parseConsumProduct(yogurt)!;
    expect(p).toMatchObject({ categoryId: 'yogurt_plain', size: { amount: 0.5, unit: 'kg' } });
    expect(parseConsumPrice(yogurt, p.size, 'x')?.unitPrice).toBe(2.4);
  });

  it('rejects absurd prices', () => {
    const wrong = { ...milk, priceData: { prices: [{ id: 'PRICE', value: { centAmount: 99 * 100 } }] } };
    expect(parseConsumPrice(wrong, null, 'x')).toBeNull();
  });

  it('searches once per generic item in Spanish', () => {
    const terms = consumSearchTerms();
    expect(terms).toContain('leche');
    expect(terms).toContain('aceite de oliva virgen extra');
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe('Consum scrape', () => {
  it('pages through results and keeps only products in our generic items', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      const q = u.searchParams.get('q');
      const offset = Number(u.searchParams.get('offset'));
      const body = q === 'leche'
        ? offset === 0 ? { products: [milk, gel], hasMore: true } : { products: [yogurt, milk], hasMore: false }
        : { products: [oil], hasMore: false };
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const result = await scrapeConsum(new PoliteClient({ delayMs: 0 }), { terms: ['leche', 'aceite'], now: new Date('2026-11-05T04:30:00Z') });
    vi.unstubAllGlobals();
    expect(result.products.map((p) => p.chainProductId)).toEqual(['7230', '3001', '88123']); // gel left out, milk once
    expect(result.prices).toHaveLength(3);
    expect(urls).toHaveLength(3);
    expect(urls[1]).toContain('offset=40');
  });
});
