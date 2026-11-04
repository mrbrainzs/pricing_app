/**
 * Made-up development data: stores, products and 120 days of prices for six chains in
 * Barcelona. Prices are invented (plausible, not real) and every observation has
 * source = 'sample' so the app can say so. Barcodes use the 200–299 "in-store" prefix,
 * which never clashes with real products.
 */
import { CATEGORIES, type Category } from './categories';
import { CHAINS } from './chains';
import type { PricePoint } from './priceLabel';
import type { ChainId, PriceObservation, Product, Size, Store } from './types';
import { round } from './units';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Own-brand price for the category's reference size, in euros. */
const BASE_PRICE: Record<string, number> = {
  milk: 0.95, eggs: 2.4, yogurt_plain: 1.3, butter: 2.4, cheese_sliced: 2.3, bread_sliced: 1.3,
  rice: 1.2, pasta: 0.85, olive_oil_ev: 8.5, olive_oil: 6.5, sunflower_oil: 1.8, coffee_ground: 2.9,
  sugar: 1.15, flour: 0.75, salt: 0.4, tomato_crushed: 1.6, tomato_fried: 2.4, tuna_canned: 3.8,
  chickpeas: 0.85, lentils: 1.9, tomatoes: 2.2, bananas: 1.9, apples: 2.1, oranges: 1.7,
  potatoes: 1.4, onions: 1.3, carrots: 1.1, lettuce: 0.9, chicken_breast: 7.2, minced_meat: 4.0,
  ham_cooked: 3.2, water: 0.3, beer: 1.3, orange_juice: 1.3, toilet_paper: 4.2, kitchen_roll: 2.1,
  laundry_detergent: 6.5, dish_soap: 1.5, shampoo: 4.0, toothpaste: 1.2,
};

/** A national brand sold at several chains (same barcode everywhere). */
const NATIONAL_BRAND: Record<string, string> = {
  milk: 'Central Lechera Asturiana', yogurt_plain: 'Danone', butter: 'Central Lechera Asturiana',
  cheese_sliced: 'García Baquero', bread_sliced: 'Bimbo', rice: 'SOS', pasta: 'Gallo',
  olive_oil_ev: 'Carbonell', olive_oil: 'Carbonell', sunflower_oil: 'Koipesol', coffee_ground: 'Marcilla',
  sugar: 'Azucarera', tomato_fried: 'Orlando', tuna_canned: 'Calvo', chickpeas: 'Luengo',
  lentils: 'Luengo', ham_cooked: 'ElPozo', water: 'Font Vella', beer: 'Estrella Damm',
  orange_juice: 'Don Simón', toilet_paper: 'Scottex', kitchen_roll: 'Scottex', laundry_detergent: 'Ariel',
  dish_soap: 'Fairy', shampoo: 'Pantene', toothpaste: 'Colgate',
};

/** Name stem (Spanish, Catalan) and pack size for sample products. */
const STEM: Record<string, [string, string, Size, string]> = {
  milk: ['Leche entera', 'Llet sencera', { amount: 1, unit: 'l' }, '1 L'],
  eggs: ['Huevos frescos L', 'Ous frescos L', { amount: 12, unit: 'unit' }, '12 ud'],
  yogurt_plain: ['Yogur natural', 'Iogurt natural', { amount: 0.5, unit: 'kg' }, '4 x 125 g'],
  butter: ['Mantequilla', 'Mantega', { amount: 0.25, unit: 'kg' }, '250 g'],
  cheese_sliced: ['Queso en lonchas tierno', 'Formatge a llesques tendre', { amount: 0.25, unit: 'kg' }, '250 g'],
  bread_sliced: ['Pan de molde blanco', 'Pa de motlle blanc', { amount: 0.46, unit: 'kg' }, '460 g'],
  rice: ['Arroz redondo', 'Arròs rodó', { amount: 1, unit: 'kg' }, '1 kg'],
  pasta: ['Macarrones', 'Macarrons', { amount: 0.5, unit: 'kg' }, '500 g'],
  olive_oil_ev: ['Aceite de oliva virgen extra', "Oli d'oliva verge extra", { amount: 1, unit: 'l' }, '1 L'],
  olive_oil: ['Aceite de oliva suave', "Oli d'oliva suau", { amount: 1, unit: 'l' }, '1 L'],
  sunflower_oil: ['Aceite de girasol', 'Oli de gira-sol', { amount: 1, unit: 'l' }, '1 L'],
  coffee_ground: ['Café molido natural', 'Cafè molt natural', { amount: 0.25, unit: 'kg' }, '250 g'],
  sugar: ['Azúcar blanco', 'Sucre blanc', { amount: 1, unit: 'kg' }, '1 kg'],
  flour: ['Harina de trigo', 'Farina de blat', { amount: 1, unit: 'kg' }, '1 kg'],
  salt: ['Sal fina', 'Sal fina', { amount: 1, unit: 'kg' }, '1 kg'],
  tomato_crushed: ['Tomate triturado', 'Tomàquet triturat', { amount: 0.8, unit: 'kg' }, '800 g'],
  tomato_fried: ['Tomate frito', 'Tomàquet fregit', { amount: 0.4, unit: 'kg' }, '400 g'],
  tuna_canned: ['Atún claro en aceite de oliva', 'Tonyina clara en oli', { amount: 0.24, unit: 'kg' }, '3 x 80 g'],
  chickpeas: ['Garbanzos cocidos', 'Cigrons cuits', { amount: 0.4, unit: 'kg' }, '400 g'],
  lentils: ['Lentejas pardinas', 'Llenties pardines', { amount: 1, unit: 'kg' }, '1 kg'],
  tomatoes: ['Tomates en rama', 'Tomàquets de branca', { amount: 1, unit: 'kg' }, '1 kg'],
  bananas: ['Plátano de Canarias', 'Plàtans de Canàries', { amount: 1, unit: 'kg' }, '1 kg'],
  apples: ['Manzana golden', 'Pomes golden', { amount: 1, unit: 'kg' }, '1 kg'],
  oranges: ['Naranjas de mesa', 'Taronges de taula', { amount: 2, unit: 'kg' }, '2 kg'],
  potatoes: ['Patatas', 'Patates', { amount: 2, unit: 'kg' }, '2 kg'],
  onions: ['Cebollas', 'Cebes', { amount: 1, unit: 'kg' }, '1 kg'],
  carrots: ['Zanahorias', 'Pastanagues', { amount: 1, unit: 'kg' }, '1 kg'],
  lettuce: ['Lechuga iceberg', 'Enciam iceberg', { amount: 1, unit: 'unit' }, '1 ud'],
  chicken_breast: ['Filetes de pechuga de pollo', 'Filets de pit de pollastre', { amount: 0.6, unit: 'kg' }, '600 g'],
  minced_meat: ['Carne picada de vacuno', 'Carn picada de vedella', { amount: 0.5, unit: 'kg' }, '500 g'],
  ham_cooked: ['Jamón cocido extra', 'Pernil dolç extra', { amount: 0.2, unit: 'kg' }, '200 g'],
  water: ['Agua mineral natural', 'Aigua mineral natural', { amount: 1.5, unit: 'l' }, '1,5 L'],
  beer: ['Cerveza lager', 'Cervesa lager', { amount: 1.98, unit: 'l' }, '6 x 33 cl'],
  orange_juice: ['Zumo de naranja exprimido', 'Suc de taronja natural', { amount: 1, unit: 'l' }, '1 L'],
  toilet_paper: ['Papel higiénico doble capa', 'Paper higiènic doble capa', { amount: 12, unit: 'unit' }, '12 rollos'],
  kitchen_roll: ['Papel de cocina', 'Paper de cuina', { amount: 2, unit: 'unit' }, '2 rollos'],
  laundry_detergent: ['Detergente líquido ropa', 'Detergent líquid per a la roba', { amount: 40, unit: 'unit' }, '40 lavados'],
  dish_soap: ['Lavavajillas a mano concentrado', 'Rentaplats a mà concentrat', { amount: 0.75, unit: 'l' }, '750 ml'],
  shampoo: ['Champú uso diario', 'Xampú ús diari', { amount: 0.4, unit: 'l' }, '400 ml'],
  toothpaste: ['Pasta de dientes', 'Pasta de dents', { amount: 0.075, unit: 'l' }, '75 ml'],
};

const SAMPLE_CHAINS: ChainId[] = ['mercadona', 'alcampo', 'bonarea', 'caprabo', 'dia', 'bonpreu'];
const ZONE: Record<string, string> = { mercadona: 'bcn1', alcampo: 'bcn', bonarea: 'cat', caprabo: 'bcn', dia: 'bcn', bonpreu: 'cat' };
const CATALAN_NAMES = new Set<ChainId>(['bonarea', 'bonpreu']);
/** Typical opening hours (OSM syntax) for sample stores; Bonpreu has none, to show "hours unknown". */
const SAMPLE_HOURS: Partial<Record<ChainId, string>> = {
  mercadona: 'Mo-Sa 09:00-21:30; Su,PH off', alcampo: 'Mo-Sa 09:00-22:00; Su,PH off',
  bonarea: 'Mo-Fr 09:00-14:00,17:00-21:00; Sa 09:00-14:00; Su,PH off', caprabo: 'Mo-Sa 09:00-21:30; Su 10:00-14:30; PH off',
  dia: 'Mo-Sa 09:00-21:30; Su 09:00-15:00; PH off',
};
const OWN_FACTOR: Record<string, number> = { mercadona: 1.0, alcampo: 0.96, bonarea: 0.98, caprabo: 1.12, dia: 1.02, bonpreu: 1.05 };
const BRAND_FACTOR: Record<string, number> = { mercadona: 1.02, alcampo: 0.95, bonarea: 1.05, caprabo: 1.0, dia: 1.03, bonpreu: 0.98 };
/** Share of categories where the chain stocks the national brand. */
const BRAND_COVERAGE: Record<string, number> = { mercadona: 0.35, alcampo: 0.9, bonarea: 0.15, caprabo: 0.95, dia: 0.7, bonpreu: 0.8 };

/** Neighbourhood points for sample stores (approximate, not real store addresses). */
const AREAS: { name: string; lat: number; lng: number; chains: ChainId[] }[] = [
  { name: 'Gràcia', lat: 41.4036, lng: 2.1565, chains: ['mercadona', 'caprabo', 'dia', 'bonpreu', 'bonarea'] },
  { name: 'Eixample', lat: 41.3917, lng: 2.1649, chains: ['mercadona', 'caprabo', 'dia', 'bonpreu'] },
  { name: 'Sants', lat: 41.3755, lng: 2.1385, chains: ['mercadona', 'dia', 'bonpreu', 'alcampo'] },
  { name: 'Poblenou', lat: 41.4005, lng: 2.201, chains: ['mercadona', 'caprabo', 'bonpreu', 'bonarea'] },
  { name: 'Sant Antoni', lat: 41.3786, lng: 2.1626, chains: ['mercadona', 'dia', 'caprabo', 'bonarea'] },
  { name: 'Sagrada Família', lat: 41.4036, lng: 2.1744, chains: ['mercadona', 'dia', 'bonpreu'] },
  { name: 'Les Corts', lat: 41.383, lng: 2.13, chains: ['mercadona', 'caprabo', 'dia'] },
  { name: 'Sant Andreu', lat: 41.435, lng: 2.19, chains: ['mercadona', 'alcampo', 'bonpreu', 'dia'] },
  { name: 'Raval', lat: 41.38, lng: 2.169, chains: ['dia', 'caprabo', 'bonarea'] },
  { name: 'El Clot', lat: 41.409, lng: 2.187, chains: ['mercadona', 'dia', 'bonpreu', 'caprabo'] },
];

export interface SampleData {
  stores: Store[];
  products: Product[];
  /** Latest price per product and zone. */
  prices: PriceObservation[];
  /** Daily price history (last 120 days) for a product. */
  history: (productId: string) => PricePoint[];
}

const HISTORY_DAYS = 120;
const DAY_MS = 86_400_000;

function sampleEan(key: string): string {
  return `2${String(hash(key) % 1e11).padStart(11, '0')}`.padEnd(12, '0') + '0';
}

function priceSeries(productId: string, base: number): number[] {
  const r = rng(`series:${productId}`);
  const out: number[] = [];
  let level = base * (0.95 + r() * 0.06);
  let promoDaysLeft = 0;
  for (let d = 0; d < HISTORY_DAYS; d++) {
    if (r() < 0.012) level *= 1 + (r() * 0.08 - 0.02); // occasional price change, mostly up
    if (promoDaysLeft === 0 && r() < 0.01) promoDaysLeft = 5 + Math.floor(r() * 6);
    const promo = promoDaysLeft > 0 ? 0.8 : 1;
    if (promoDaysLeft > 0) promoDaysLeft--;
    out.push(round(Math.max(0.1, level * promo)));
  }
  return out;
}

export function buildSampleData(now: Date = new Date()): SampleData {
  const stores: Store[] = [];
  for (const area of AREAS) {
    area.chains.forEach((chain, i) => {
      const angle = (i / area.chains.length) * 2 * Math.PI;
      stores.push({
        id: `sample-${chain}-${area.name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
        chain,
        name: `${CHAINS[chain].name} ${area.name}`,
        zone: ZONE[chain]!,
        lat: round(area.lat + Math.sin(angle) * 0.0025, 5),
        lng: round(area.lng + Math.cos(angle) * 0.0033, 5),
        openingHours: SAMPLE_HOURS[chain],
      });
    });
  }

  const products: Product[] = [];
  const series = new Map<string, number[]>();
  const today = new Date(now);
  today.setUTCHours(5, 30, 0, 0);
  if (today > now) today.setTime(today.getTime() - DAY_MS);

  const addProduct = (chain: ChainId, cat: Category, brand: string, own: boolean, factor: number) => {
    const stem = STEM[cat.id];
    const base = BASE_PRICE[cat.id];
    if (!stem || base === undefined) return;
    const [es, ca, size, sizeLabel] = stem;
    const id = `sample:${chain}:${cat.id}:${own ? 'own' : 'brand'}`;
    const r = rng(id);
    const packPrice = base * (size.amount / cat.defaultSize.amount) * factor * (0.93 + r() * 0.14);
    products.push({
      id,
      chain,
      chainProductId: id,
      ean: own ? undefined : sampleEan(`${cat.id}:${brand}`),
      name: `${CATALAN_NAMES.has(chain) ? ca : es} ${brand} ${sizeLabel}`,
      brand,
      isOwnBrand: own,
      categoryId: cat.id,
      size,
    });
    series.set(id, priceSeries(id, packPrice));
  };

  for (const chain of SAMPLE_CHAINS) {
    const ownBrand = CHAINS[chain].ownBrands[0]!;
    for (const cat of CATEGORIES) {
      const r = rng(`${chain}:${cat.id}`);
      const ownBrandName = chain === 'mercadona' && ['household'].includes(cat.group)
        ? 'Bosque Verde'
        : chain === 'mercadona' && cat.group === 'personal'
          ? 'Deliplus'
          : ownBrand;
      if (r() > 0.04) addProduct(chain, cat, ownBrandName, true, OWN_FACTOR[chain]!);
      const national = NATIONAL_BRAND[cat.id];
      if (national && r() < BRAND_COVERAGE[chain]!) addProduct(chain, cat, national, false, 1.45 * BRAND_FACTOR[chain]!);
    }
  }

  const prices: PriceObservation[] = products.map((p) => {
    const s = series.get(p.id)!;
    const price = s[s.length - 1]!;
    const prev = s[s.length - 2]!;
    return {
      productId: p.id,
      chain: p.chain,
      zone: ZONE[p.chain]!,
      price,
      unitPrice: p.size ? round(price / p.size.amount, 4) : null,
      promotion: price < prev * 0.9 ? 'promo' : undefined,
      observedAt: today.toISOString(),
      source: 'sample',
    };
  });

  const history = (productId: string): PricePoint[] => {
    const s = series.get(productId);
    if (!s) return [];
    return s.map((price, i) => ({
      price,
      observedAt: new Date(today.getTime() - (s.length - 1 - i) * DAY_MS).toISOString(),
    }));
  };

  return { stores, products, prices, history };
}
