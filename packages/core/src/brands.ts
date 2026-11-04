import { normalize } from './text';

/**
 * Well-known grocery brands sold across chains in Spain. Used to name the brand of a
 * product when a shop doesn't say, and so a branded product is never taken for a
 * chain's own brand (bonÀrea sells "Leche entera Pascual" under its own short codes).
 */
export const KNOWN_BRANDS = [
  'Central Lechera Asturiana', 'Asturiana', 'Pascual', 'ATO', 'Puleva', 'Kaiku', 'Covap', 'Llet Nostra', 'Lauki', 'Celta', 'Feiraco',
  'Danone', 'Activia', 'Danet', 'Oikos', 'Yoplait', 'La Fageda', 'Nestlé', 'La Lechera', 'Nesquik', 'Nescafé', 'Nidina',
  'Président', 'García Baquero', 'El Caserío', 'Philadelphia', 'Babybel', 'Kerrygold', 'Flora', 'Tulipán',
  'Carbonell', 'Koipe', 'Koipesol', 'La Española', 'Borges', 'Hojiblanca', 'Ybarra', 'Coosur', 'Oleoestepa',
  'SOS', 'Brillante', 'La Fallera', 'Nomen', 'Gallo', 'Barilla', 'Garofalo', 'Buitoni', 'Rummo',
  'Bimbo', 'Panrico', 'Recondo', 'Calvo', 'Isabel', 'Albo', 'Cuca', 'Rianxeira', 'Orlando', 'Solís', 'Hida', 'Apis',
  'Luengo', 'Cidacos', 'Litoral', 'Gallina Blanca', 'Knorr', 'Starlux',
  'ElPozo', 'El Pozo', 'Campofrío', 'Navidul', 'Casa Tarradellas', 'Noel', 'Oscar Mayer', 'Argal',
  'Marcilla', 'Saimaza', 'Bonka', 'Lavazza', 'Dolce Gusto', 'Starbucks', 'Tassimo', 'Cola Cao',
  'Azucarera', 'Acor', 'Font Vella', 'Bezoya', 'Lanjarón', 'Aquabona', 'Solán de Cabras', 'Viladrau', 'Vichy Catalan',
  'Estrella Damm', 'Damm', 'Moritz', 'Mahou', 'San Miguel', 'Heineken', 'Alhambra', 'Amstel', 'Cruzcampo', 'Voll-Damm',
  'Don Simón', 'Granini', 'Zumosol', 'Juver', 'Coca-Cola', 'Fanta', 'Pepsi', 'Schweppes', 'Aquarius',
  'Scottex', 'Colhogar', 'Renova', 'Foxy', 'Ariel', 'Skip', 'Wipp', 'Dixan', 'Colon', 'Norit', 'Fairy', 'Mistol', 'Finish',
  'Pantene', 'H&S', 'Head & Shoulders', 'Elvive', 'Garnier', 'Fructis', 'Herbal Essences', 'Johnson', 'Nivea', 'Dove', 'Sanex',
  'Colgate', 'Signal', 'Sensodyne', 'Oral-B', 'Licor del Polo', 'Kinder', 'Milka', 'Valor', 'Torras', 'Lindt', 'Chupa Chups',
  'La Menorquina', 'Frigo', 'Häagen-Dazs', 'Puleva Peques',
] as const;

let compiled: { brand: string; re: RegExp }[] | null = null;

/** The first well-known brand named in a product name, longest names first ("Central Lechera Asturiana" before "Asturiana"). */
export function detectBrand(name: string): string | undefined {
  compiled ??= [...KNOWN_BRANDS]
    .sort((a, b) => b.length - a.length)
    .map((brand) => ({ brand, re: new RegExp(`(?:^| )${normalize(brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?= |$)`) }));
  const n = normalize(name);
  return compiled.find((b) => b.re.test(n))?.brand;
}
