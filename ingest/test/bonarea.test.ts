import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bonareaSize, cardToPrice, cardToProduct, decodeHtml, isBonareaOwnBrand, parseBonareaPage, scrapeBonarea } from '../src/chains/bonarea';
import { PoliteClient } from '../src/http';

// Real search page captured from the production server on 4 Nov 2026 (see fixtures README).
const PAGE = readFileSync(join(__dirname, '../fixtures/retailer-search/2026-11-04/bonarea-leche.html'), 'utf8');
const cards = parseBonareaPage(PAGE);
const byCode = (code: string) => cards.find((c) => c.code === code)!;

describe('bonÀrea search page (real capture)', () => {
  it('reads every product card on the page', () => {
    expect(cards).toHaveLength(465);
    expect(cards.every((c) => c.price && c.price > 0)).toBe(true);
    expect(cards.filter((c) => c.outOfStock)).toHaveLength(23);
  });

  it('reads code, link, name, size, shelf price and unit price', () => {
    const milk = byCode('13*0004');
    expect(milk).toMatchObject({
      name: 'Leche semidesnatada paq. de 6 brics',
      url: 'https://www.bonarea-online.com/online/producto/leche-semidesnatada-paq-de-6-brics/13_0004',
      weight: '6 l',
      price: 5.34,
      unitPrice: { value: 0.89, unit: 'l' },
      outOfStock: false,
    });
    expect(cardToProduct(milk)).toMatchObject({ chain: 'bonarea', categoryId: 'milk', isOwnBrand: true, brand: 'bonÀrea', size: { amount: 6, unit: 'l' } });
    expect(cardToPrice(milk, { amount: 6, unit: 'l' }, 'x')).toMatchObject({ price: 5.34, unitPrice: 0.89, zone: 'cat', source: 'online' });
  });

  it('tells bonÀrea products from other brands', () => {
    expect(isBonareaOwnBrand('13*0004')).toBe(true);
    expect(isBonareaOwnBrand('13*0096567')).toBe(false);
    const pascual = cards.find((c) => c.name === 'Leche entera Pascual paq. de 6 brics')!;
    expect(cardToProduct(pascual)).toMatchObject({ isOwnBrand: false, brand: 'Pascual', categoryId: 'milk' });
  });

  it('keeps only real groceries in our items', () => {
    const kept = cards.map(cardToProduct).filter((p) => p.categoryId && p.size);
    const names = kept.map((p) => p.name);
    expect(new Set(kept.map((p) => p.categoryId))).toEqual(new Set(['milk', 'lettuce', 'yogurt_plain']));
    for (const wrong of ['Zumo con leche tropical paq. 6 u. de 200 ml', 'Gel de baño IYOU leche y miel', 'Leche continuación Nestlé nativa 3',
      'Youwup leche gato', 'Nivea sun leche f-50.', 'Batlle lechuga trocadero', 'Yogur griego azucarado 4 u. de 125 g', 'Petit fresa y plátano paq. de 6 u. de 50 g']) {
      expect(names, wrong).not.toContain(wrong);
    }
  });

  it('skips out-of-stock items for prices', () => {
    const gone = cards.find((c) => c.outOfStock)!;
    expect(cardToPrice(gone, bonareaSize(gone), 'x')).toBeNull();
  });
});

describe('bonÀrea parsing details', () => {
  it.each([
    ['6 l', { amount: 6, unit: 'l' }],
    ['750 ml.', { amount: 0.75, unit: 'l' }],
    ['aprox. 111 g', { amount: 0.111, unit: 'kg' }],
    ['pack 6 u.', { amount: 6, unit: 'unit' }],
    ['99 cl', { amount: 0.99, unit: 'l' }],
    ['124,5 g', { amount: 0.1245, unit: 'kg' }],
    ['1,5 l', { amount: 1.5, unit: 'l' }],
  ])('size "%s"', (weight, size) => {
    expect(bonareaSize({ weight, name: '' })).toEqual(size);
  });

  it('decodes HTML entities in names', () => {
    expect(decodeHtml('Gel leche &amp; miel &#233; &#xE0;')).toBe('Gel leche & miel é à');
  });

  it('searches each term and keeps products with a size and price', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(new URL(url).searchParams.get('searchWords') === 'leche' ? PAGE : '<html>No hay resultados</html>', { status: 200 });
    }));
    const logs: string[] = [];
    const result = await scrapeBonarea(new PoliteClient({ delayMs: 0 }), { terms: ['leche', 'xyz'], log: (m) => logs.push(m) });
    vi.unstubAllGlobals();
    expect(result.products).toHaveLength(34);
    expect(result.prices).toHaveLength(34);
    expect(urls[0]).toBe('https://www.bonarea-online.com/es/shop/find?searchWords=leche');
    expect(logs.at(-1)).toMatch(/1 searches returned no product cards/);
  });
});
