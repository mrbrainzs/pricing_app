import { describe, expect, it, vi } from 'vitest';
import { PoliteClient } from '../src/http';
import { parseMercadonaPrice, parseMercadonaProduct, scrapeMercadona, type MercadonaCategoryDetail, type MercadonaProductSummary } from '../src/chains/mercadona';

// Hand-written responses in the shape of tienda.mercadona.es/api. Replace with recorded
// responses once the importer has run against the live API.
const oil: MercadonaProductSummary = {
  id: '4241',
  display_name: 'Aceite de oliva virgen extra Hacendado',
  packaging: 'Botella',
  thumbnail: 'https://example.invalid/4241.jpg',
  price_instructions: {
    unit_price: '8.95', bulk_price: '8.95', reference_price: '8.950', reference_format: 'L',
    unit_size: 1, size_format: 'l', previous_unit_price: '  9.45', price_decreased: true,
  },
};
const milk: MercadonaProductSummary = {
  id: '10381',
  display_name: 'Leche semidesnatada Hacendado',
  packaging: 'Pack-6',
  price_instructions: { unit_price: '5.40', bulk_price: '0.90', reference_price: '0.900', reference_format: 'L', unit_size: 6, size_format: 'l', is_pack: true, pack_size: 1, total_units: 6 },
};
const eggs: MercadonaProductSummary = {
  id: '31030',
  display_name: 'Huevos grandes L',
  packaging: 'Paquete 12 ud.',
  price_instructions: { unit_price: '2.75', reference_price: '0.229', reference_format: 'ud', unit_size: 12, size_format: 'ud' },
};
const crisps: MercadonaProductSummary = {
  id: '25001',
  display_name: 'Patatas fritas lisas Hacendado',
  packaging: 'Bolsa 170 g',
  price_instructions: { unit_price: '1.10', reference_format: null, unit_size: null, size_format: null },
};

describe('Mercadona parsing', () => {
  it('reads size, price, unit price, own brand, category and promotion', () => {
    const p = parseMercadonaProduct(oil, 'Aceite');
    expect(p).toMatchObject({ chainProductId: '4241', brand: 'Hacendado', isOwnBrand: true, categoryId: 'olive_oil_ev', size: { amount: 1, unit: 'l' } });
    const price = parseMercadonaPrice(oil, 'bcn1', '2026-11-04T05:30:00Z');
    expect(price).toMatchObject({ price: 8.95, unitPrice: 8.95, zone: 'bcn1', promotion: 'was 9.45', source: 'online' });
  });

  it('handles packs and unit-priced items', () => {
    expect(parseMercadonaProduct(milk, 'Leche')).toMatchObject({ categoryId: 'milk', size: { amount: 6, unit: 'l' } });
    expect(parseMercadonaPrice(milk, 'bcn1', 'x')?.unitPrice).toBe(0.9);
    expect(parseMercadonaProduct(eggs, 'Huevos')).toMatchObject({ categoryId: 'eggs', isOwnBrand: false, size: { amount: 12, unit: 'unit' } });
  });

  it('falls back to the packaging text for size, and leaves snacks unclassified', () => {
    const p = parseMercadonaProduct(crisps, 'Snacks');
    expect(p).toMatchObject({ categoryId: null, size: { amount: 0.17, unit: 'kg' } });
    expect(parseMercadonaPrice(crisps, 'bcn1', 'x')?.unitPrice).toBeCloseTo(6.4706, 3);
  });

  it('uses the product detail for brand and EAN', () => {
    const p = parseMercadonaProduct(eggs, 'Huevos', { id: '31030', ean: '8480000310300', brand: 'Hacendado', display_name: 'Huevos grandes L' });
    expect(p).toMatchObject({ ean: '8480000310300', brand: 'Hacendado', isOwnBrand: true });
  });
});

describe('Mercadona scrape', () => {
  it('walks the category tree and fetches details only when asked', async () => {
    const category: MercadonaCategoryDetail = {
      id: 112, name: 'Aceite, vinagre y sal',
      categories: [{ id: 420, name: 'Aceite de oliva', products: [oil, crisps] }, { id: 421, name: 'Leche', products: [milk, oil] }],
    };
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      const body = url.includes('/categories/?')
        ? { results: [{ id: 1, name: 'Despensa', categories: [{ id: 112, name: 'Aceite' }] }] }
        : url.includes('/categories/112/')
          ? category
          : { id: '4241', ean: '8480000042417', brand: 'Hacendado', display_name: oil.display_name };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await scrapeMercadona(new PoliteClient({ delayMs: 0 }), {
      warehouse: 'bcn1',
      needsDetail: (id) => id === '4241',
      now: new Date('2026-11-04T05:30:00Z'),
    });
    vi.unstubAllGlobals();
    expect(result.products.map((p) => p.chainProductId)).toEqual(['4241', '25001', '10381']);
    expect(result.products[0]).toMatchObject({ ean: '8480000042417' });
    expect(result.prices).toHaveLength(3);
    expect(urls.filter((u) => u.includes('/products/'))).toHaveLength(1);
    expect(urls.every((u) => u.includes('wh=bcn1'))).toBe(true);
  });
});
