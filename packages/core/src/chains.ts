import type { ChainId } from './types';

export interface ChainInfo {
  id: ChainId;
  name: string;
  /** Brand colour used for chips and badges. */
  color: string;
  /** Own-brand names, used to flag own-brand products. */
  ownBrands: string[];
  /** Whether v1 collects this chain's prices online. */
  online: boolean;
  /** True when one price applies to all of Catalonia. */
  singlePriceZone: boolean;
}

export const CHAINS: Record<ChainId, ChainInfo> = {
  mercadona: {
    id: 'mercadona',
    name: 'Mercadona',
    color: '#00843D',
    ownBrands: ['Hacendado', 'Deliplus', 'Bosque Verde', 'Compy', 'Solcare'],
    online: true,
    singlePriceZone: false,
  },
  alcampo: {
    id: 'alcampo',
    name: 'Alcampo',
    color: '#E30613',
    ownBrands: ['Auchan', 'Alcampo', 'Producto Alcampo', 'Cosmia'],
    online: true,
    singlePriceZone: false,
  },
  bonarea: {
    id: 'bonarea',
    name: 'bonÀrea',
    color: '#7AB800',
    ownBrands: ['bonÀrea', 'bonarea'],
    online: true,
    singlePriceZone: true,
  },
  caprabo: {
    id: 'caprabo',
    name: 'Caprabo',
    color: '#D7142B',
    ownBrands: ['Eroski', 'Caprabo', 'Eroski Basic', 'Belle'],
    online: true,
    singlePriceZone: false,
  },
  dia: {
    id: 'dia',
    name: 'DIA',
    color: '#E2001A',
    ownBrands: ['Dia', 'DIA', 'Al Punto', 'Bonté', 'Basic Dia'],
    online: true,
    singlePriceZone: false,
  },
  bonpreu: {
    id: 'bonpreu',
    name: 'Bonpreu / Esclat',
    color: '#E4002B',
    ownBrands: ['Bonpreu', 'Esclat', 'Bonpreu Esclat'],
    online: true,
    singlePriceZone: true,
  },
  aldi: { id: 'aldi', name: 'Aldi', color: '#00005F', ownBrands: [], online: false, singlePriceZone: false },
  condis: { id: 'condis', name: 'Condis', color: '#E30A17', ownBrands: ['Condis'], online: false, singlePriceZone: false },
  lidl: { id: 'lidl', name: 'Lidl', color: '#0050AA', ownBrands: [], online: false, singlePriceZone: false },
};

export function isOwnBrand(chain: ChainId, brand: string | undefined | null): boolean {
  if (!brand) return false;
  const b = brand.trim().toLowerCase();
  return CHAINS[chain].ownBrands.some((own) => own.toLowerCase() === b);
}
