import { describe, expect, it } from 'vitest';
import {
  buildSampleData,
  findEquivalents,
  formatBarcode,
  gtinCheckDigit,
  gtinKey,
  isValidBarcode,
  lookupBarcode,
  ownBrandOptions,
  parseBarcode,
  type PriceOf,
  type Product,
} from '../src';

const NOW = new Date('2026-11-04T10:00:00Z');

/** Valid codes (check digits worked out by hand and by gtinCheckDigit). */
const EAN13 = '4006381333931';
const UPCA = '036000291452';
const EAN8 = '96385074';
const HACENDADO = '8480000042415';
const IN_STORE = '2000000000015';

const product = (over: Partial<Product>): Product => ({
  id: 'p', chain: 'mercadona', chainProductId: 'p', name: 'Producte', isOwnBrand: false, categoryId: null, size: null, ...over,
});

describe('barcode check digits', () => {
  it('computes the GS1 check digit for EAN-13, UPC-A and EAN-8', () => {
    expect(gtinCheckDigit(EAN13.slice(0, -1))).toBe(1);
    expect(gtinCheckDigit(UPCA.slice(0, -1))).toBe(2);
    expect(gtinCheckDigit(EAN8.slice(0, -1))).toBe(4);
  });

  it('reads the three formats and ignores spaces and dashes', () => {
    expect(parseBarcode(EAN13)).toEqual({ digits: EAN13, format: 'ean13', gtin: EAN13, checkDigitOk: true });
    expect(parseBarcode(UPCA)).toEqual({ digits: UPCA, format: 'upc_a', gtin: `0${UPCA}`, checkDigitOk: true });
    expect(parseBarcode(EAN8)).toEqual({ digits: EAN8, format: 'ean8', gtin: EAN8, checkDigitOk: true });
    expect(parseBarcode(' 8 480000 042415 ')?.digits).toBe(HACENDADO);
    expect(parseBarcode('4006-3813-3393-1')?.checkDigitOk).toBe(true);
  });

  it('rejects letters, wrong lengths and typos', () => {
    expect(parseBarcode('')).toBeNull();
    expect(parseBarcode('leche 1 l')).toBeNull();
    expect(parseBarcode('12345')).toBeNull();
    expect(parseBarcode('40063813339311')).toBeNull();
    expect(isValidBarcode(EAN13)).toBe(true);
    expect(isValidBarcode('4006381333932')).toBe(false);
    expect(isValidBarcode('4006381333391')).toBe(false); // two digits swapped
  });

  it('compares stored codes in one form', () => {
    expect(gtinKey(UPCA)).toBe(`0${UPCA}`);
    expect(gtinKey(`0${EAN13}`)).toBe(EAN13);
    expect(gtinKey(EAN8)).toBe(EAN8);
    expect(gtinKey('123')).toBeNull();
  });

  it('groups digits as printed under the bars', () => {
    expect(formatBarcode(HACENDADO)).toBe('8 480000 042415');
    expect(formatBarcode(UPCA)).toBe('0 36000 29145 2');
    expect(formatBarcode(EAN8)).toBe('9638 5074');
  });
});

describe('barcode lookup', () => {
  const sample = buildSampleData(NOW);
  const latest = new Map(sample.prices.map((o) => [o.productId, o]));
  const priceOf: PriceOf = (p) => latest.get(p.id);

  it('finds a national brand at every chain that sells it, cheapest first', () => {
    const carbonell = sample.products.find((p) => p.brand === 'Carbonell' && p.categoryId === 'olive_oil_ev')!;
    const r = lookupBarcode(carbonell.ean!, sample.products, priceOf);
    expect(r.kind).toBe('found');
    if (r.kind !== 'found') return;
    expect(r.products.length).toBeGreaterThanOrEqual(2);
    expect(new Set(r.products.map((p) => p.ean))).toEqual(new Set([carbonell.ean]));
    const prices = r.products.map((p) => latest.get(p.id)!.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('trusts the catalogue over the check digit', () => {
    // Sample codes end in 0 whatever the check digit; a shop's listing wins over the maths.
    const odd = sample.products.find((p) => p.ean && !isValidBarcode(p.ean))!;
    expect(lookupBarcode(odd.ean!, sample.products).kind).toBe('found');
  });

  it('matches UPC-A codes stored as 13 digits and the other way round', () => {
    const stored13 = product({ id: 'a', ean: `0${UPCA}` });
    const stored12 = product({ id: 'b', chain: 'consum', ean: UPCA });
    const r = lookupBarcode(UPCA, [stored13, stored12]);
    expect(r.kind === 'found' && r.products.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(lookupBarcode(`0${UPCA}`, [stored12]).kind).toBe('found');
  });

  it('puts products without a price last', () => {
    const priced = product({ id: 'priced', chain: 'dia', ean: EAN13 });
    const unpriced = product({ id: 'unpriced', chain: 'alcampo', ean: EAN13 });
    const r = lookupBarcode(EAN13, [unpriced, priced], (p) => (p.id === 'priced' ? { price: 2, unitPrice: 2 } : undefined));
    expect(r.kind === 'found' && r.products.map((p) => p.id)).toEqual(['priced', 'unpriced']);
  });

  it('shows an own-brand product that is in the catalogue as found', () => {
    const hacendado = product({ id: 'h', ean: HACENDADO, brand: 'Hacendado', isOwnBrand: true });
    const r = lookupBarcode(HACENDADO, [hacendado]);
    expect(r.kind === 'found' && r.products[0]!.id).toBe('h');
  });

  it('names the chain of an own-brand code that is not in the catalogue yet', () => {
    const r = lookupBarcode(HACENDADO, sample.products);
    expect(r).toMatchObject({ kind: 'own_brand', chain: 'mercadona', code: HACENDADO });
    expect(r.kind === 'own_brand' && r.brands).toContain('Hacendado');
  });

  it('explains in-store codes and unknown codes instead of failing', () => {
    expect(isValidBarcode(IN_STORE)).toBe(true);
    expect(lookupBarcode(IN_STORE, sample.products).kind).toBe('in_store');
    expect(lookupBarcode(EAN13, sample.products).kind).toBe('unknown');
    expect(lookupBarcode(EAN8, sample.products).kind).toBe('unknown');
  });

  it('flags typos and things that are not barcodes', () => {
    expect(lookupBarcode('4006381333932', sample.products)).toEqual({ kind: 'invalid', code: '4006381333932', reason: 'check_digit' });
    expect(lookupBarcode('123', sample.products)).toMatchObject({ kind: 'invalid', reason: 'format' });
    expect(lookupBarcode('llet', sample.products)).toMatchObject({ kind: 'invalid', reason: 'format' });
  });
});

describe('own-brand options for a generic item', () => {
  const sample = buildSampleData(NOW);
  const latest = new Map(sample.prices.map((o) => [o.productId, o]));
  const priceOf: PriceOf = (p) => latest.get(p.id);

  it('lists own-brand milk at several chains, cheapest per litre first', () => {
    const options = ownBrandOptions('milk', sample.products, priceOf);
    expect(new Set(options.map((p) => p.chain)).size).toBeGreaterThanOrEqual(4);
    expect(options.every((p) => p.isOwnBrand && p.categoryId === 'milk')).toBe(true);
    expect(options.some((p) => p.brand === 'Hacendado')).toBe(true);
    const unit = options.map((p) => latest.get(p.id)!.unitPrice!);
    expect(unit).toEqual([...unit].sort((a, b) => a - b));
  });

  it('uses the same rule as the product page', () => {
    const hacendadoMilk = sample.products.find((p) => p.brand === 'Hacendado' && p.categoryId === 'milk')!;
    const fromPage = findEquivalents(hacendadoMilk, sample.products)
      .filter((e) => e.matchType === 'own_brand_equivalent')
      .map((e) => e.product.id);
    const options = ownBrandOptions('milk', sample.products).map((p) => p.id);
    expect(new Set(options)).toEqual(new Set([hacendadoMilk.id, ...fromPage]));
  });

  it('returns nothing for an unknown item', () => {
    expect(ownBrandOptions('caviar', sample.products)).toEqual([]);
  });
});
