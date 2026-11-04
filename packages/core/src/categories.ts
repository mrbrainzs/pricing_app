import type { Lang, Size } from './types';
import { normalize } from './text';

export type CategoryGroup = 'dairy' | 'bakery' | 'pantry' | 'produce' | 'meat_fish' | 'drinks' | 'household' | 'personal';

export interface Category {
  id: string;
  group: CategoryGroup;
  /** Display name in each app language. */
  names: Record<Lang, string>;
  /** Extra words people type for this item, in any language. */
  synonyms: string[];
  /** Reference quantity used to compare chains fairly (prices are normalised to it). */
  defaultSize: Size;
  /**
   * Phrases that put a chain product in this category, matched at word starts on the
   * normalised product name (Spanish and Catalan). A trailing "$" requires a whole word.
   */
  include: string[];
  exclude?: string[];
  /** Largest pack accepted, as a multiple of defaultSize (default 3). Water is often sold in 6-packs. */
  maxPackRatio?: number;
}

const kg = (amount: number): Size => ({ amount, unit: 'kg' });
const l = (amount: number): Size => ({ amount, unit: 'l' });
const ud = (amount: number): Size => ({ amount, unit: 'unit' });

/**
 * Generic items for the shopping list. Order matters for classification: more specific
 * categories come before general ones (extra virgin olive oil before olive oil).
 */
export const CATEGORIES: Category[] = [
  // Dairy and eggs
  {
    id: 'milk', group: 'dairy', defaultSize: l(1),
    names: { ca: 'Llet', es: 'Leche', en: 'Milk' },
    synonyms: ['llet sencera', 'llet semidesnatada', 'leche entera', 'leche semidesnatada', 'whole milk', 'semi skimmed milk'],
    include: ['leche', 'llet'],
    exclude: ['chocolate', 'cacao', 'condensada', 'evaporada', 'en polvo', 'coco', 'soja', 'avena', 'almendra', 'arroz', 'batido', 'merengada', 'fermentada', 'galleta', 'crema', 'flan', 'natillas', 'cafe', 'bebida', 'yogur', 'queso', 'mantequilla', 'mantega', 'dulce de leche', 'infantil', 'crecimiento', 'pan de leche', 'cuajada', 'arros', 'xocolata', 'beguda', 'iogurt', 'formatge'],
  },
  {
    id: 'eggs', group: 'dairy', defaultSize: ud(12),
    names: { ca: 'Ous', es: 'Huevos', en: 'Eggs' },
    synonyms: ['ou', 'huevo', 'egg', 'dotzena d ous', 'docena de huevos'],
    include: ['huevos', 'huevo$', 'ous$', 'ou$'],
    exclude: ['chocolate', 'codorniz', 'pasta', 'kinder', 'pascua', 'liquido', 'claras', 'cocidos', 'xocolata', 'guatlla', 'tortilla'],
  },
  {
    id: 'yogurt_plain', group: 'dairy', defaultSize: kg(0.5),
    names: { ca: 'Iogurt natural', es: 'Yogur natural', en: 'Plain yogurt' },
    synonyms: ['iogurt', 'iogurts', 'yogur', 'yogures', 'yogurt', 'yoghurt'],
    include: ['yogur natural', 'iogurt natural'],
    exclude: ['bebible', 'liquid', 'liquido', 'sabor'],
  },
  {
    id: 'butter', group: 'dairy', defaultSize: kg(0.25),
    names: { ca: 'Mantega', es: 'Mantequilla', en: 'Butter' },
    synonyms: [],
    include: ['mantequilla', 'mantega'],
    exclude: ['galleta', 'pasta de', 'bollo', 'croissant', 'sabor', 'cacahuete', 'crema de', 'palmera', 'magdalena', 'cacauet'],
  },
  {
    id: 'cheese_sliced', group: 'dairy', defaultSize: kg(0.25),
    names: { ca: 'Formatge a llesques', es: 'Queso en lonchas', en: 'Sliced cheese' },
    synonyms: ['formatge', 'queso', 'cheese', 'formatge de llesques'],
    include: ['queso en lonchas', 'queso lonchas', 'lonchas de queso', 'queso tierno en lonchas', 'formatge a llesques', 'formatge en llesques'],
  },
  // Bakery and pantry
  {
    id: 'bread_sliced', group: 'bakery', defaultSize: kg(0.5),
    names: { ca: 'Pa de motlle', es: 'Pan de molde', en: 'Sliced bread' },
    synonyms: ['pa', 'pan', 'bread', 'pa de molde'],
    include: ['pan de molde', 'pa de motlle'],
    exclude: ['rallado', 'tostado', 'ratllat'],
  },
  {
    id: 'rice', group: 'pantry', defaultSize: kg(1),
    names: { ca: 'Arròs', es: 'Arroz', en: 'Rice' },
    synonyms: ['arros rodo', 'arroz redondo', 'arroz largo'],
    include: ['arroz', 'arros'],
    exclude: ['con leche', 'tortita', 'bebida', 'harina', 'vinagre', 'preparado', 'vasito', 'microondas', 'cocido', 'tres delicias', 'paella', 'amb llet', 'beguda', 'galeta', 'snack', 'leche'],
  },
  {
    id: 'pasta', group: 'pantry', defaultSize: kg(0.5),
    names: { ca: 'Pasta', es: 'Pasta', en: 'Pasta' },
    synonyms: ['macarrons', 'macarrones', 'espaguetis', 'spaghetti', 'macaroni'],
    include: ['espagueti', 'spaghetti', 'macarron', 'macarro', 'penne', 'tallarin', 'fusilli', 'hélices', 'helices', 'tiburones', 'plumas', 'fideo', 'fideus'],
    exclude: ['salsa', 'rellen', 'ensalada', 'plato', 'carbonara', 'bolonesa', 'boloñesa', 'gratinad', 'preparad', 'fresca', 'fresc'],
  },
  {
    id: 'olive_oil_ev', group: 'pantry', defaultSize: l(1),
    names: { ca: "Oli d'oliva verge extra", es: 'Aceite de oliva virgen extra', en: 'Extra virgin olive oil' },
    synonyms: ['oli verge extra', 'aove', 'evoo', 'olive oil extra virgin'],
    include: ['aceite de oliva virgen extra', 'oli d oliva verge extra', 'oli oliva verge extra'],
    exclude: ['spray', 'atun', 'sardina', 'patatas', 'tonyina'],
  },
  {
    id: 'olive_oil', group: 'pantry', defaultSize: l(1),
    names: { ca: "Oli d'oliva", es: 'Aceite de oliva', en: 'Olive oil' },
    synonyms: ['oli', 'aceite', 'oil', 'oli d oliva suau', 'aceite de oliva suave', 'aceite de oliva intenso'],
    include: ['aceite de oliva', 'oli d oliva', 'oli oliva'],
    exclude: ['virgen', 'verge', 'spray', 'atun', 'sardina', 'patatas', 'tonyina', 'en aceite'],
  },
  {
    id: 'sunflower_oil', group: 'pantry', defaultSize: l(1),
    names: { ca: 'Oli de gira-sol', es: 'Aceite de girasol', en: 'Sunflower oil' },
    synonyms: ['girasol', 'gira sol', 'sunflower'],
    include: ['aceite de girasol', 'aceite girasol', 'oli de gira sol', 'oli gira sol'],
    exclude: ['atun', 'patatas', 'tonyina', 'semillas', 'pipas'],
  },
  {
    id: 'coffee_ground', group: 'pantry', defaultSize: kg(0.25),
    names: { ca: 'Cafè molt', es: 'Café molido', en: 'Ground coffee' },
    synonyms: ['cafe', 'coffee', 'cafe molido natural'],
    include: ['cafe molido', 'cafe molt'],
    exclude: ['descafeinado', 'descafeinat', 'capsula', 'soluble'],
  },
  {
    id: 'sugar', group: 'pantry', defaultSize: kg(1),
    names: { ca: 'Sucre', es: 'Azúcar', en: 'Sugar' },
    synonyms: ['sucre blanc', 'azucar blanco', 'white sugar'],
    include: ['azucar', 'sucre'],
    exclude: ['sin azucar', 'sense sucre', 'glass', 'galleta', 'cacao', 'chocolate', 'mermelada', 'bebida', 'refresco', 'cereal', 'caramelo', 'chicle', 'xocolata', 'beguda', 'edulcorante'],
  },
  {
    id: 'flour', group: 'pantry', defaultSize: kg(1),
    names: { ca: 'Farina', es: 'Harina', en: 'Flour' },
    synonyms: ['farina de blat', 'harina de trigo', 'wheat flour'],
    include: ['harina de trigo', 'harina$', 'farina de blat', 'farina$'],
    exclude: ['maiz', 'rebozar', 'preparado', 'garbanzo', 'arroz', 'avena', 'fritos', 'reposteria', 'blat de moro'],
  },
  {
    id: 'salt', group: 'pantry', defaultSize: kg(1),
    names: { ca: 'Sal', es: 'Sal', en: 'Salt' },
    synonyms: ['sal fina', 'sal marina', 'table salt'],
    include: ['sal$'],
    exclude: ['escamas', 'ajo', 'hierbas', 'lavavajillas', 'baño', 'bany', 'rentaplats', 'patatas', 'frutos'],
  },
  {
    id: 'tomato_crushed', group: 'pantry', defaultSize: kg(1),
    names: { ca: 'Tomàquet triturat', es: 'Tomate triturado', en: 'Crushed tomatoes' },
    synonyms: ['tomaquet de llauna', 'tomate en lata', 'tinned tomatoes', 'canned tomatoes'],
    include: ['tomate triturado', 'tomaquet triturat'],
  },
  {
    id: 'tomato_fried', group: 'pantry', defaultSize: kg(1),
    names: { ca: 'Tomàquet fregit', es: 'Tomate frito', en: 'Tomato sauce' },
    synonyms: ['salsa de tomate', 'salsa de tomaquet', 'tomato sauce'],
    include: ['tomate frito', 'tomaquet fregit'],
  },
  {
    id: 'tuna_canned', group: 'pantry', defaultSize: kg(0.25),
    names: { ca: 'Tonyina en llauna', es: 'Atún en lata', en: 'Canned tuna' },
    synonyms: ['tonyina', 'atun', 'tuna'],
    include: ['atun claro', 'atun en aceite', 'atun al natural', 'atun en', 'tonyina'],
    exclude: ['fresco', 'congelado', 'pate', 'ensalada', 'empanada', 'pizza', 'salsa', 'lomos de atun frescos', 'fresca', 'congelada'],
  },
  {
    id: 'chickpeas', group: 'pantry', defaultSize: kg(0.4),
    names: { ca: 'Cigrons cuits', es: 'Garbanzos cocidos', en: 'Cooked chickpeas' },
    synonyms: ['cigrons', 'garbanzos', 'chickpeas'],
    include: ['garbanzo cocido', 'garbanzos cocidos', 'cigrons cuits', 'cigro cuit'],
  },
  {
    id: 'lentils', group: 'pantry', defaultSize: kg(1),
    names: { ca: 'Llenties', es: 'Lentejas', en: 'Lentils' },
    synonyms: ['llentia', 'lenteja', 'lentil'],
    include: ['lenteja', 'llentia', 'llenties'],
    exclude: ['plato', 'con chorizo', 'guiso', 'pasta', 'crema', 'estofad', 'amb xoric'],
  },
  // Fresh produce
  {
    id: 'tomatoes', group: 'produce', defaultSize: kg(1),
    names: { ca: 'Tomàquets', es: 'Tomates', en: 'Tomatoes' },
    synonyms: ['tomaquet', 'tomate', 'tomato'],
    include: ['tomate', 'tomaquet'],
    exclude: ['triturado', 'triturat', 'frito', 'fregit', 'concentrado', 'salsa', 'seco', 'ketchup', 'zumo', 'pelado', 'gazpacho', 'natural entero', 'lata', 'untar', 'sec', 'suc', 'tamizado', 'rallado', 'ratllat', 'deshidratado'],
  },
  {
    id: 'bananas', group: 'produce', defaultSize: kg(1),
    names: { ca: 'Plàtans', es: 'Plátanos', en: 'Bananas' },
    synonyms: ['platan', 'platano', 'banana', 'banano'],
    include: ['platano', 'platan', 'banana'],
    exclude: ['chips', 'seco', 'deshidratado', 'batido', 'yogur', 'zumo', 'papilla', 'potito', 'snack', 'iogurt'],
  },
  {
    id: 'apples', group: 'produce', defaultSize: kg(1),
    names: { ca: 'Pomes', es: 'Manzanas', en: 'Apples' },
    synonyms: ['poma', 'manzana', 'apple'],
    include: ['manzana', 'poma$', 'pomes$'],
    exclude: ['zumo', 'compota', 'sidra', 'tarta', 'chips', 'yogur', 'pure', 'potito', 'bebida', 'vinagre', 'suc', 'snack', 'deshidratada'],
  },
  {
    id: 'oranges', group: 'produce', defaultSize: kg(1),
    names: { ca: 'Taronges', es: 'Naranjas', en: 'Oranges' },
    synonyms: ['taronja', 'naranja', 'orange'],
    include: ['naranja', 'taronja', 'taronges'],
    exclude: ['zumo', 'mermelada', 'bebida', 'refresco', 'sabor', 'piel', 'chocolate', 'naranjada', 'suc', 'melmelada', 'gajos en almibar'],
  },
  {
    id: 'potatoes', group: 'produce', defaultSize: kg(1),
    names: { ca: 'Patates', es: 'Patatas', en: 'Potatoes' },
    synonyms: ['patata', 'potato'],
    include: ['patata', 'patates'],
    exclude: ['fritas', 'chips', 'snack', 'tortilla', 'pure', 'congelad', 'gajos', 'bravas', 'rellena', 'horno', 'paja', 'lisas', 'onduladas', 'prefrita', 'fregides', 'xips', 'sabor'],
  },
  {
    id: 'onions', group: 'produce', defaultSize: kg(1),
    names: { ca: 'Cebes', es: 'Cebollas', en: 'Onions' },
    synonyms: ['ceba', 'cebolla', 'onion'],
    include: ['cebolla', 'ceba$', 'cebes$'],
    exclude: ['frita', 'crujiente', 'encurtid', 'polvo', 'sopa', 'salsa', 'aros', 'caramelizada', 'confitada', 'tortilla', 'congelad', 'fregida'],
  },
  {
    id: 'carrots', group: 'produce', defaultSize: kg(1),
    names: { ca: 'Pastanagues', es: 'Zanahorias', en: 'Carrots' },
    synonyms: ['pastanaga', 'zanahoria', 'carrot'],
    include: ['zanahoria', 'pastanag'],
    exclude: ['zumo', 'pure', 'crema', 'tarta', 'suc', 'congelad'],
  },
  {
    id: 'lettuce', group: 'produce', defaultSize: ud(1),
    names: { ca: 'Enciam', es: 'Lechuga', en: 'Lettuce' },
    synonyms: ['enciam iceberg', 'lechuga iceberg', 'lettuce'],
    include: ['lechuga', 'enciam'],
    exclude: ['ensalada', 'mezcla', 'brotes', 'amanida', 'barreja'],
  },
  // Meat and fish
  {
    id: 'chicken_breast', group: 'meat_fish', defaultSize: kg(1),
    names: { ca: 'Pit de pollastre', es: 'Pechuga de pollo', en: 'Chicken breast' },
    synonyms: ['pollastre', 'pollo', 'chicken', 'pit pollastre'],
    include: ['pechuga de pollo', 'pechugas de pollo', 'filetes de pechuga de pollo', 'pit de pollastre', 'filets de pit de pollastre'],
    exclude: ['empanad', 'cocida', 'asada', 'lonchas', 'fiambre', 'nuggets', 'rellena', 'arrebossat', 'cuit', 'llesques', 'pavo', 'gall dindi'],
  },
  {
    id: 'minced_meat', group: 'meat_fish', defaultSize: kg(0.5),
    names: { ca: 'Carn picada', es: 'Carne picada', en: 'Minced meat' },
    synonyms: ['picada', 'mince', 'ground beef', 'carne molida'],
    include: ['carne picada', 'picada de vacuno', 'picada vacuno', 'burger meat', 'carn picada'],
  },
  {
    id: 'ham_cooked', group: 'meat_fish', defaultSize: kg(0.25),
    names: { ca: 'Pernil dolç', es: 'Jamón cocido', en: 'Cooked ham' },
    synonyms: ['pernil', 'jamon york', 'york', 'ham'],
    include: ['jamon cocido', 'pernil dolc', 'pernil cuit'],
    exclude: ['croqueta', 'pizza', 'sandwich', 'bocadillo', 'empanad'],
  },
  // Drinks
  {
    id: 'water', group: 'drinks', defaultSize: l(1), maxPackRatio: 10,
    names: { ca: 'Aigua', es: 'Agua', en: 'Bottled water' },
    synonyms: ['aigua mineral', 'agua mineral', 'water'],
    include: ['agua mineral', 'agua$', 'aigua mineral', 'aigua$'],
    exclude: ['con gas', 'amb gas', 'tonica', 'coco', 'saborizada', 'micelar', 'perfume', 'colonia', 'oxigenada', 'destilada', 'rosas', 'sabor', 'bebida', 'fresca', 'de mar', 'limon', 'llimona'],
  },
  {
    id: 'beer', group: 'drinks', defaultSize: l(1), maxPackRatio: 6,
    names: { ca: 'Cervesa', es: 'Cerveza', en: 'Beer' },
    synonyms: ['birra', 'birres', 'beer', 'cerveses', 'cervezas'],
    include: ['cerveza', 'cervesa'],
    exclude: ['sin alcohol', 'sense alcohol', '0,0', '0.0', 'radler', 'con limon', 'amb llimona', 'sin gluten'],
  },
  {
    id: 'orange_juice', group: 'drinks', defaultSize: l(1),
    names: { ca: 'Suc de taronja', es: 'Zumo de naranja', en: 'Orange juice' },
    synonyms: ['suc', 'zumo', 'juice', 'suc taronja', 'zumo naranja'],
    include: ['zumo de naranja', 'suc de taronja', 'zumo naranja', 'suc taronja'],
    exclude: ['con leche', 'amb llet', 'refresco', 'nectar', 'mango', 'zanahoria', 'pastanaga'],
  },
  // Household
  {
    id: 'toilet_paper', group: 'household', defaultSize: ud(12),
    names: { ca: 'Paper higiènic', es: 'Papel higiénico', en: 'Toilet paper' },
    synonyms: ['paper wc', 'papel wc', 'toilet roll', 'loo roll'],
    include: ['papel higienico', 'paper higienic'],
    exclude: ['humedo', 'humit'],
  },
  {
    id: 'kitchen_roll', group: 'household', defaultSize: ud(2),
    names: { ca: 'Paper de cuina', es: 'Papel de cocina', en: 'Kitchen roll' },
    synonyms: ['paper cuina', 'papel cocina', 'paper towel'],
    include: ['papel de cocina', 'rollo de cocina', 'paper de cuina'],
  },
  {
    id: 'laundry_detergent', group: 'household', defaultSize: ud(40),
    names: { ca: 'Detergent per a la roba', es: 'Detergente para ropa', en: 'Laundry detergent' },
    synonyms: ['detergent', 'detergente', 'sabo de rentadora', 'laundry'],
    include: ['detergente', 'detergent'],
    exclude: ['lavavajillas', 'vajilla', 'rentaplats', 'rentavaixelles', 'suavizante', 'suavitzant', 'mano', 'ma$', 'prendas delicadas'],
  },
  {
    id: 'dish_soap', group: 'household', defaultSize: l(1),
    names: { ca: 'Rentaplats', es: 'Lavavajillas a mano', en: 'Washing-up liquid' },
    synonyms: ['fairy', 'lavavajillas', 'dish soap', 'washing up liquid'],
    include: ['lavavajillas a mano', 'lavavajillas mano', 'friegaplatos', 'rentaplats a ma', 'rentaplats'],
    exclude: ['maquina', 'pastillas', 'capsulas', 'maquina', 'rentavaixelles', 'pastilles'],
  },
  // Personal care
  {
    id: 'shampoo', group: 'personal', defaultSize: l(1),
    names: { ca: 'Xampú', es: 'Champú', en: 'Shampoo' },
    synonyms: ['xampu', 'champu', 'shampoo'],
    include: ['champu', 'xampu'],
    exclude: ['perro', 'mascota', 'seco', 'gos', 'sec$'],
  },
  {
    id: 'toothpaste', group: 'personal', defaultSize: l(0.1),
    names: { ca: 'Pasta de dents', es: 'Pasta de dientes', en: 'Toothpaste' },
    synonyms: ['dentifric', 'dentifrico', 'toothpaste'],
    include: ['pasta dentifrica', 'pasta de dientes', 'dentifrico', 'pasta de dents', 'dentifric'],
    exclude: ['infantil', 'cepillo', 'raspall'],
  },
];

export const CATEGORY_BY_ID: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function categoryName(id: string | null | undefined, lang: Lang): string | null {
  if (!id) return null;
  return CATEGORY_BY_ID[id]?.names[lang] ?? null;
}

interface CompiledRule {
  id: string;
  include: RegExp[];
  exclude: RegExp[];
}

function phraseRegex(phrase: string): RegExp {
  const whole = phrase.endsWith('$');
  const p = normalize(whole ? phrase.slice(0, -1) : phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^| )${p}${whole ? '(?= |$)' : ''}`);
}

let compiled: CompiledRule[] | null = null;
function rules(): CompiledRule[] {
  compiled ??= CATEGORIES.map((c) => ({
    id: c.id,
    include: c.include.map(phraseRegex),
    exclude: (c.exclude ?? []).map(phraseRegex),
  }));
  return compiled;
}

/**
 * Puts a chain product into a generic category by its name, or returns null. The brand is
 * removed first, so "Mantega Central Lechera Asturiana" is butter, not milk.
 */
export function classifyProduct(name: string, brand?: string | null): string | null {
  let n = normalize(name);
  const b = brand ? normalize(brand) : '';
  if (b && b.length >= 3) n = ` ${n} `.replace(` ${b} `, ' ').trim();
  for (const r of rules()) {
    if (r.include.some((re) => re.test(n)) && !r.exclude.some((re) => re.test(n))) return r.id;
  }
  return null;
}
