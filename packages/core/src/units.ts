import type { BaseUnit, Size } from './types';

const UNIT_WORDS: Record<string, { unit: BaseUnit; factor: number }> = {
  kg: { unit: 'kg', factor: 1 },
  kgs: { unit: 'kg', factor: 1 },
  kilo: { unit: 'kg', factor: 1 },
  kilos: { unit: 'kg', factor: 1 },
  g: { unit: 'kg', factor: 0.001 },
  gr: { unit: 'kg', factor: 0.001 },
  grs: { unit: 'kg', factor: 0.001 },
  gramos: { unit: 'kg', factor: 0.001 },
  grams: { unit: 'kg', factor: 0.001 },
  l: { unit: 'l', factor: 1 },
  lt: { unit: 'l', factor: 1 },
  lts: { unit: 'l', factor: 1 },
  litro: { unit: 'l', factor: 1 },
  litros: { unit: 'l', factor: 1 },
  litre: { unit: 'l', factor: 1 },
  litres: { unit: 'l', factor: 1 },
  liter: { unit: 'l', factor: 1 },
  ml: { unit: 'l', factor: 0.001 },
  cl: { unit: 'l', factor: 0.01 },
  dl: { unit: 'l', factor: 0.1 },
  ud: { unit: 'unit', factor: 1 },
  uds: { unit: 'unit', factor: 1 },
  u: { unit: 'unit', factor: 1 },
  un: { unit: 'unit', factor: 1 },
  unidad: { unit: 'unit', factor: 1 },
  unidades: { unit: 'unit', factor: 1 },
  unitat: { unit: 'unit', factor: 1 },
  unitats: { unit: 'unit', factor: 1 },
  units: { unit: 'unit', factor: 1 },
  rollos: { unit: 'unit', factor: 1 },
  rotllos: { unit: 'unit', factor: 1 },
  rolls: { unit: 'unit', factor: 1 },
  lavados: { unit: 'unit', factor: 1 },
  rentades: { unit: 'unit', factor: 1 },
  dosis: { unit: 'unit', factor: 1 },
  washes: { unit: 'unit', factor: 1 },
  lv: { unit: 'unit', factor: 1 },
  // "0,5 Dc" = half a dozen (Consum). Full words are left out: "1/2 docena" would read as 2 dozen.
  dc: { unit: 'unit', factor: 12 },
};

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`([a-z]+)`;
// "6 x 1 l", "pack 6 bricks x 1 l", "4 x 125 g"
const MULTI = new RegExp(String.raw`(\d+)\s*(?:[a-z]+\s*)?[x×]\s*` + NUM + String.raw`\s*` + UNIT + String.raw`\b`, 'gi');
// "1,5 l", "500 g", "12 ud"
const SINGLE = new RegExp(NUM + String.raw`\s*` + UNIT + String.raw`\b`, 'gi');

function toNumber(s: string): number {
  return Number(s.replace(',', '.'));
}

/** Converts an amount in a given unit word ("g", "cl", "ud") to a base-unit Size. */
export function toSize(amount: number, unitWord: string): Size | null {
  const u = UNIT_WORDS[unitWord.toLowerCase()];
  if (!u || !(amount > 0)) return null;
  return { amount: round(amount * u.factor, 6), unit: u.unit };
}

/** Extracts the pack size from a product name or size string. Returns the last match found. */
export function parseSize(text: string): Size | null {
  const lower = text.toLowerCase();
  let result: Size | null = null;
  for (const m of lower.matchAll(MULTI)) {
    const size = toSize(Number(m[1]) * toNumber(m[2]!), m[3]!);
    if (size) result = size;
  }
  if (result) return result;
  for (const m of lower.matchAll(SINGLE)) {
    const size = toSize(toNumber(m[1]!), m[2]!);
    if (size) result = size;
  }
  return result;
}

export function unitPrice(price: number, size: Size | null): number | null {
  if (!size || size.amount <= 0) return null;
  return round(price / size.amount, 4);
}

export function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export const UNIT_LABEL: Record<BaseUnit, string> = { kg: 'kg', l: 'L', unit: 'ud' };

/** Ratio between two sizes of the same unit, or null when units differ. */
export function sizeRatio(a: Size | null, b: Size | null): number | null {
  if (!a || !b || a.unit !== b.unit || b.amount === 0) return null;
  return a.amount / b.amount;
}
