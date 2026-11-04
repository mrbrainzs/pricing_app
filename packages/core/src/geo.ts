export interface LatLng {
  lat: number;
  lng: number;
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Approximate centres of Barcelona city postal codes (08001–08042). Good enough to rank
 * nearby stores; GPS gives a precise position when the user allows it.
 */
export const BARCELONA_POSTAL_CODES: Record<string, LatLng & { area: string }> = {
  '08001': { lat: 41.38, lng: 2.17, area: 'El Raval' },
  '08002': { lat: 41.3825, lng: 2.177, area: 'Barri Gòtic' },
  '08003': { lat: 41.384, lng: 2.184, area: 'Sant Pere, la Ribera, Barceloneta' },
  '08004': { lat: 41.372, lng: 2.16, area: 'Poble-sec' },
  '08005': { lat: 41.399, lng: 2.2, area: 'Poblenou' },
  '08006': { lat: 41.399, lng: 2.148, area: 'Sant Gervasi – Galvany' },
  '08007': { lat: 41.39, lng: 2.165, area: 'Eixample' },
  '08008': { lat: 41.393, lng: 2.156, area: 'Eixample' },
  '08009': { lat: 41.394, lng: 2.169, area: 'Dreta de l’Eixample' },
  '08010': { lat: 41.393, lng: 2.176, area: 'Dreta de l’Eixample' },
  '08011': { lat: 41.383, lng: 2.16, area: 'Sant Antoni' },
  '08012': { lat: 41.403, lng: 2.157, area: 'Vila de Gràcia' },
  '08013': { lat: 41.4, lng: 2.179, area: 'Sagrada Família' },
  '08014': { lat: 41.375, lng: 2.138, area: 'Sants' },
  '08015': { lat: 41.377, lng: 2.151, area: 'Sant Antoni – Hostafrancs' },
  '08016': { lat: 41.437, lng: 2.177, area: 'Nou Barris' },
  '08017': { lat: 41.399, lng: 2.122, area: 'Sarrià' },
  '08018': { lat: 41.402, lng: 2.192, area: 'Fort Pienc – Poblenou' },
  '08019': { lat: 41.411, lng: 2.206, area: 'Diagonal Mar' },
  '08020': { lat: 41.419, lng: 2.2, area: 'Sant Martí' },
  '08021': { lat: 41.396, lng: 2.141, area: 'Sant Gervasi' },
  '08022': { lat: 41.41, lng: 2.135, area: 'Sant Gervasi – la Bonanova' },
  '08023': { lat: 41.413, lng: 2.149, area: 'Vallcarca' },
  '08024': { lat: 41.41, lng: 2.16, area: 'Gràcia' },
  '08025': { lat: 41.407, lng: 2.172, area: 'Baix Guinardó' },
  '08026': { lat: 41.411, lng: 2.184, area: 'Sant Martí – el Clot' },
  '08027': { lat: 41.429, lng: 2.188, area: 'Sant Andreu' },
  '08028': { lat: 41.378, lng: 2.125, area: 'Les Corts' },
  '08029': { lat: 41.387, lng: 2.143, area: 'Les Corts – Eixample' },
  '08030': { lat: 41.436, lng: 2.198, area: 'Sant Andreu – Bon Pastor' },
  '08031': { lat: 41.432, lng: 2.164, area: 'Horta' },
  '08032': { lat: 41.425, lng: 2.154, area: 'Horta – el Carmel' },
  '08033': { lat: 41.45, lng: 2.188, area: 'Trinitat – Torre Baró' },
  '08034': { lat: 41.391, lng: 2.11, area: 'Pedralbes' },
  '08035': { lat: 41.425, lng: 2.14, area: 'Vall d’Hebron' },
  '08036': { lat: 41.388, lng: 2.148, area: 'Eixample (Hospital Clínic)' },
  '08037': { lat: 41.4, lng: 2.164, area: 'Gràcia – Passeig de Sant Joan' },
  '08038': { lat: 41.365, lng: 2.15, area: 'Montjuïc' },
  '08039': { lat: 41.375, lng: 2.185, area: 'Port Vell' },
  '08040': { lat: 41.348, lng: 2.14, area: 'Zona Franca' },
  '08041': { lat: 41.419, lng: 2.176, area: 'Guinardó' },
  '08042': { lat: 41.439, lng: 2.178, area: 'Nou Barris – Prosperitat' },
};

export function isValidPostalCode(code: string): boolean {
  return /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/.test(code.trim());
}

/** Catalonia's postal codes start with 08 (Barcelona), 17 (Girona), 25 (Lleida) or 43 (Tarragona). */
export function isCataloniaPostalCode(code: string): boolean {
  return /^(08|17|25|43)\d{3}$/.test(code.trim());
}

export function postalCodeLocation(code: string): LatLng | null {
  return BARCELONA_POSTAL_CODES[code.trim()] ?? null;
}

/** Nearest known postal code to a GPS position. */
export function nearestPostalCode(pos: LatLng): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const [code, loc] of Object.entries(BARCELONA_POSTAL_CODES)) {
    const d = distanceKm(pos, loc);
    if (d < bestD) {
      bestD = d;
      best = code;
    }
  }
  return best;
}
