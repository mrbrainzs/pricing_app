// ingest/src/run.ts
import { parseArgs } from "node:util";

// ingest/src/http.ts
var DEFAULT_USER_AGENT = "QuinSuperPriceBot/0.1 (+https://github.com/mrbrainzs/pricing_app)";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var PoliteClient = class {
  constructor(opts = {}) {
    this.opts = opts;
  }
  last = 0;
  async request(url, init = {}) {
    const delay = this.opts.delayMs ?? 400;
    const retries = this.opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + delay - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      try {
        const res = await fetch(url, {
          ...init,
          signal: init.signal ?? AbortSignal.timeout(3e4),
          headers: { "user-agent": this.opts.userAgent ?? DEFAULT_USER_AGENT, accept: "application/json", ...init.headers }
        });
        if (res.ok) return res;
        if (attempt < retries && (res.status === 429 || res.status >= 500)) {
          await sleep(2 ** attempt * 2e3);
          continue;
        }
        throw new Error(`${init.method ?? "GET"} ${url} -> HTTP ${res.status}`);
      } catch (err) {
        if (attempt < retries && !(err instanceof Error && err.message.includes("-> HTTP"))) {
          await sleep(2 ** attempt * 2e3);
          continue;
        }
        throw err;
      }
    }
  }
  async json(url, init) {
    return (await this.request(url, init)).json();
  }
};

// packages/core/src/text.ts
function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/l·l/g, "ll").replace(/[^a-z0-9ñç.,\s]/g, " ").replace(/\s+/g, " ").trim();
}

// packages/core/src/units.ts
var UNIT_WORDS = {
  kg: { unit: "kg", factor: 1 },
  kgs: { unit: "kg", factor: 1 },
  kilo: { unit: "kg", factor: 1 },
  kilos: { unit: "kg", factor: 1 },
  g: { unit: "kg", factor: 1e-3 },
  gr: { unit: "kg", factor: 1e-3 },
  grs: { unit: "kg", factor: 1e-3 },
  gramos: { unit: "kg", factor: 1e-3 },
  grams: { unit: "kg", factor: 1e-3 },
  l: { unit: "l", factor: 1 },
  lt: { unit: "l", factor: 1 },
  lts: { unit: "l", factor: 1 },
  litro: { unit: "l", factor: 1 },
  litros: { unit: "l", factor: 1 },
  litre: { unit: "l", factor: 1 },
  litres: { unit: "l", factor: 1 },
  liter: { unit: "l", factor: 1 },
  ml: { unit: "l", factor: 1e-3 },
  cl: { unit: "l", factor: 0.01 },
  dl: { unit: "l", factor: 0.1 },
  ud: { unit: "unit", factor: 1 },
  uds: { unit: "unit", factor: 1 },
  u: { unit: "unit", factor: 1 },
  un: { unit: "unit", factor: 1 },
  unidad: { unit: "unit", factor: 1 },
  unidades: { unit: "unit", factor: 1 },
  unitat: { unit: "unit", factor: 1 },
  unitats: { unit: "unit", factor: 1 },
  units: { unit: "unit", factor: 1 },
  rollos: { unit: "unit", factor: 1 },
  rotllos: { unit: "unit", factor: 1 },
  rolls: { unit: "unit", factor: 1 },
  lavados: { unit: "unit", factor: 1 },
  rentades: { unit: "unit", factor: 1 },
  dosis: { unit: "unit", factor: 1 },
  washes: { unit: "unit", factor: 1 }
};
var NUM = String.raw`(\d+(?:[.,]\d+)?)`;
var UNIT = String.raw`([a-z]+)`;
var MULTI = new RegExp(String.raw`(\d+)\s*(?:[a-z]+\s*)?[x×]\s*` + NUM + String.raw`\s*` + UNIT + String.raw`\b`, "gi");
var SINGLE = new RegExp(NUM + String.raw`\s*` + UNIT + String.raw`\b`, "gi");
function toNumber(s) {
  return Number(s.replace(",", "."));
}
function toSize(amount, unitWord) {
  const u = UNIT_WORDS[unitWord.toLowerCase()];
  if (!u || !(amount > 0)) return null;
  return { amount: round(amount * u.factor, 6), unit: u.unit };
}
function parseSize(text) {
  const lower = text.toLowerCase();
  let result = null;
  for (const m of lower.matchAll(MULTI)) {
    const size = toSize(Number(m[1]) * toNumber(m[2]), m[3]);
    if (size) result = size;
  }
  if (result) return result;
  for (const m of lower.matchAll(SINGLE)) {
    const size = toSize(toNumber(m[1]), m[2]);
    if (size) result = size;
  }
  return result;
}
function round(n, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// packages/core/src/chains.ts
var CHAINS = {
  mercadona: {
    id: "mercadona",
    name: "Mercadona",
    color: "#00843D",
    ownBrands: ["Hacendado", "Deliplus", "Bosque Verde", "Compy", "Solcare"],
    online: true,
    singlePriceZone: false
  },
  alcampo: {
    id: "alcampo",
    name: "Alcampo",
    color: "#E30613",
    ownBrands: ["Auchan", "Alcampo", "Producto Alcampo", "Cosmia"],
    online: true,
    singlePriceZone: false
  },
  bonarea: {
    id: "bonarea",
    name: "bon\xC0rea",
    color: "#7AB800",
    ownBrands: ["bon\xC0rea", "bonarea"],
    online: true,
    singlePriceZone: true
  },
  caprabo: {
    id: "caprabo",
    name: "Caprabo",
    color: "#D7142B",
    ownBrands: ["Eroski", "Caprabo", "Eroski Basic", "Belle"],
    online: true,
    singlePriceZone: false
  },
  dia: {
    id: "dia",
    name: "DIA",
    color: "#E2001A",
    ownBrands: ["Dia", "DIA", "Al Punto", "Bont\xE9", "Basic Dia"],
    online: true,
    singlePriceZone: false
  },
  bonpreu: {
    id: "bonpreu",
    name: "Bonpreu / Esclat",
    color: "#E4002B",
    ownBrands: ["Bonpreu", "Esclat", "Bonpreu Esclat"],
    online: true,
    singlePriceZone: true
  },
  aldi: { id: "aldi", name: "Aldi", color: "#00005F", ownBrands: [], online: false, singlePriceZone: false },
  condis: { id: "condis", name: "Condis", color: "#E30A17", ownBrands: ["Condis"], online: false, singlePriceZone: false },
  lidl: { id: "lidl", name: "Lidl", color: "#0050AA", ownBrands: [], online: false, singlePriceZone: false }
};
function isOwnBrand(chain, brand) {
  if (!brand) return false;
  const b = brand.trim().toLowerCase();
  return CHAINS[chain].ownBrands.some((own) => own.toLowerCase() === b);
}

// packages/core/src/categories.ts
var kg = (amount) => ({ amount, unit: "kg" });
var l = (amount) => ({ amount, unit: "l" });
var ud = (amount) => ({ amount, unit: "unit" });
var CATEGORIES = [
  // Dairy and eggs
  {
    id: "milk",
    group: "dairy",
    defaultSize: l(1),
    names: { ca: "Llet", es: "Leche", en: "Milk" },
    synonyms: ["llet sencera", "llet semidesnatada", "leche entera", "leche semidesnatada", "whole milk", "semi skimmed milk"],
    include: ["leche", "llet"],
    exclude: ["chocolate", "cacao", "condensada", "evaporada", "en polvo", "coco", "soja", "avena", "almendra", "arroz", "batido", "merengada", "fermentada", "galleta", "crema", "flan", "natillas", "cafe", "bebida", "yogur", "queso", "mantequilla", "mantega", "dulce de leche", "infantil", "crecimiento", "pan de leche", "cuajada", "arros", "xocolata", "beguda", "iogurt", "formatge"]
  },
  {
    id: "eggs",
    group: "dairy",
    defaultSize: ud(12),
    names: { ca: "Ous", es: "Huevos", en: "Eggs" },
    synonyms: ["ou", "huevo", "egg", "dotzena d ous", "docena de huevos"],
    include: ["huevos", "huevo$", "ous$", "ou$"],
    exclude: ["chocolate", "codorniz", "pasta", "kinder", "pascua", "liquido", "claras", "cocidos", "xocolata", "guatlla", "tortilla"]
  },
  {
    id: "yogurt_plain",
    group: "dairy",
    defaultSize: kg(0.5),
    names: { ca: "Iogurt natural", es: "Yogur natural", en: "Plain yogurt" },
    synonyms: ["iogurt", "iogurts", "yogur", "yogures", "yogurt", "yoghurt"],
    include: ["yogur natural", "iogurt natural"],
    exclude: ["bebible", "liquid", "liquido", "sabor"]
  },
  {
    id: "butter",
    group: "dairy",
    defaultSize: kg(0.25),
    names: { ca: "Mantega", es: "Mantequilla", en: "Butter" },
    synonyms: [],
    include: ["mantequilla", "mantega"],
    exclude: ["galleta", "pasta de", "bollo", "croissant", "sabor", "cacahuete", "crema de", "palmera", "magdalena", "cacauet"]
  },
  {
    id: "cheese_sliced",
    group: "dairy",
    defaultSize: kg(0.25),
    names: { ca: "Formatge a llesques", es: "Queso en lonchas", en: "Sliced cheese" },
    synonyms: ["formatge", "queso", "cheese", "formatge de llesques"],
    include: ["queso en lonchas", "queso lonchas", "lonchas de queso", "queso tierno en lonchas", "formatge a llesques", "formatge en llesques"]
  },
  // Bakery and pantry
  {
    id: "bread_sliced",
    group: "bakery",
    defaultSize: kg(0.5),
    names: { ca: "Pa de motlle", es: "Pan de molde", en: "Sliced bread" },
    synonyms: ["pa", "pan", "bread", "pa de molde"],
    include: ["pan de molde", "pa de motlle"],
    exclude: ["rallado", "tostado", "ratllat"]
  },
  {
    id: "rice",
    group: "pantry",
    defaultSize: kg(1),
    names: { ca: "Arr\xF2s", es: "Arroz", en: "Rice" },
    synonyms: ["arros rodo", "arroz redondo", "arroz largo"],
    include: ["arroz", "arros"],
    exclude: ["con leche", "tortita", "bebida", "harina", "vinagre", "preparado", "vasito", "microondas", "cocido", "tres delicias", "paella", "amb llet", "beguda", "galeta", "snack", "leche"]
  },
  {
    id: "pasta",
    group: "pantry",
    defaultSize: kg(0.5),
    names: { ca: "Pasta", es: "Pasta", en: "Pasta" },
    synonyms: ["macarrons", "macarrones", "espaguetis", "spaghetti", "macaroni"],
    include: ["espagueti", "spaghetti", "macarron", "macarro", "penne", "tallarin", "fusilli", "h\xE9lices", "helices", "tiburones", "plumas", "fideo", "fideus"],
    exclude: ["salsa", "rellen", "ensalada", "plato", "carbonara", "bolonesa", "bolo\xF1esa", "gratinad", "preparad", "fresca", "fresc"]
  },
  {
    id: "olive_oil_ev",
    group: "pantry",
    defaultSize: l(1),
    names: { ca: "Oli d'oliva verge extra", es: "Aceite de oliva virgen extra", en: "Extra virgin olive oil" },
    synonyms: ["oli verge extra", "aove", "evoo", "olive oil extra virgin"],
    include: ["aceite de oliva virgen extra", "oli d oliva verge extra", "oli oliva verge extra"],
    exclude: ["spray", "atun", "sardina", "patatas", "tonyina"]
  },
  {
    id: "olive_oil",
    group: "pantry",
    defaultSize: l(1),
    names: { ca: "Oli d'oliva", es: "Aceite de oliva", en: "Olive oil" },
    synonyms: ["oli", "aceite", "oil", "oli d oliva suau", "aceite de oliva suave", "aceite de oliva intenso"],
    include: ["aceite de oliva", "oli d oliva", "oli oliva"],
    exclude: ["virgen", "verge", "spray", "atun", "sardina", "patatas", "tonyina", "en aceite"]
  },
  {
    id: "sunflower_oil",
    group: "pantry",
    defaultSize: l(1),
    names: { ca: "Oli de gira-sol", es: "Aceite de girasol", en: "Sunflower oil" },
    synonyms: ["girasol", "gira sol", "sunflower"],
    include: ["aceite de girasol", "aceite girasol", "oli de gira sol", "oli gira sol"],
    exclude: ["atun", "patatas", "tonyina", "semillas", "pipas"]
  },
  {
    id: "coffee_ground",
    group: "pantry",
    defaultSize: kg(0.25),
    names: { ca: "Caf\xE8 molt", es: "Caf\xE9 molido", en: "Ground coffee" },
    synonyms: ["cafe", "coffee", "cafe molido natural"],
    include: ["cafe molido", "cafe molt"],
    exclude: ["descafeinado", "descafeinat", "capsula", "soluble"]
  },
  {
    id: "sugar",
    group: "pantry",
    defaultSize: kg(1),
    names: { ca: "Sucre", es: "Az\xFAcar", en: "Sugar" },
    synonyms: ["sucre blanc", "azucar blanco", "white sugar"],
    include: ["azucar", "sucre"],
    exclude: ["sin azucar", "sense sucre", "glass", "galleta", "cacao", "chocolate", "mermelada", "bebida", "refresco", "cereal", "caramelo", "chicle", "xocolata", "beguda", "edulcorante"]
  },
  {
    id: "flour",
    group: "pantry",
    defaultSize: kg(1),
    names: { ca: "Farina", es: "Harina", en: "Flour" },
    synonyms: ["farina de blat", "harina de trigo", "wheat flour"],
    include: ["harina de trigo", "harina$", "farina de blat", "farina$"],
    exclude: ["maiz", "rebozar", "preparado", "garbanzo", "arroz", "avena", "fritos", "reposteria", "blat de moro"]
  },
  {
    id: "salt",
    group: "pantry",
    defaultSize: kg(1),
    names: { ca: "Sal", es: "Sal", en: "Salt" },
    synonyms: ["sal fina", "sal marina", "table salt"],
    include: ["sal$"],
    exclude: ["escamas", "ajo", "hierbas", "lavavajillas", "ba\xF1o", "bany", "rentaplats", "patatas", "frutos"]
  },
  {
    id: "tomato_crushed",
    group: "pantry",
    defaultSize: kg(1),
    names: { ca: "Tom\xE0quet triturat", es: "Tomate triturado", en: "Crushed tomatoes" },
    synonyms: ["tomaquet de llauna", "tomate en lata", "tinned tomatoes", "canned tomatoes"],
    include: ["tomate triturado", "tomaquet triturat"]
  },
  {
    id: "tomato_fried",
    group: "pantry",
    defaultSize: kg(1),
    names: { ca: "Tom\xE0quet fregit", es: "Tomate frito", en: "Tomato sauce" },
    synonyms: ["salsa de tomate", "salsa de tomaquet", "tomato sauce"],
    include: ["tomate frito", "tomaquet fregit"]
  },
  {
    id: "tuna_canned",
    group: "pantry",
    defaultSize: kg(0.25),
    names: { ca: "Tonyina en llauna", es: "At\xFAn en lata", en: "Canned tuna" },
    synonyms: ["tonyina", "atun", "tuna"],
    include: ["atun claro", "atun en aceite", "atun al natural", "atun en", "tonyina"],
    exclude: ["fresco", "congelado", "pate", "ensalada", "empanada", "pizza", "salsa", "lomos de atun frescos", "fresca", "congelada"]
  },
  {
    id: "chickpeas",
    group: "pantry",
    defaultSize: kg(0.4),
    names: { ca: "Cigrons cuits", es: "Garbanzos cocidos", en: "Cooked chickpeas" },
    synonyms: ["cigrons", "garbanzos", "chickpeas"],
    include: ["garbanzo cocido", "garbanzos cocidos", "cigrons cuits", "cigro cuit"]
  },
  {
    id: "lentils",
    group: "pantry",
    defaultSize: kg(1),
    names: { ca: "Llenties", es: "Lentejas", en: "Lentils" },
    synonyms: ["llentia", "lenteja", "lentil"],
    include: ["lenteja", "llentia", "llenties"],
    exclude: ["plato", "con chorizo", "guiso", "pasta", "crema", "estofad", "amb xoric"]
  },
  // Fresh produce
  {
    id: "tomatoes",
    group: "produce",
    defaultSize: kg(1),
    names: { ca: "Tom\xE0quets", es: "Tomates", en: "Tomatoes" },
    synonyms: ["tomaquet", "tomate", "tomato"],
    include: ["tomate", "tomaquet"],
    exclude: ["triturado", "triturat", "frito", "fregit", "concentrado", "salsa", "seco", "ketchup", "zumo", "pelado", "gazpacho", "natural entero", "lata", "untar", "sec", "suc", "tamizado", "rallado", "ratllat", "deshidratado"]
  },
  {
    id: "bananas",
    group: "produce",
    defaultSize: kg(1),
    names: { ca: "Pl\xE0tans", es: "Pl\xE1tanos", en: "Bananas" },
    synonyms: ["platan", "platano", "banana", "banano"],
    include: ["platano", "platan", "banana"],
    exclude: ["chips", "seco", "deshidratado", "batido", "yogur", "zumo", "papilla", "potito", "snack", "iogurt"]
  },
  {
    id: "apples",
    group: "produce",
    defaultSize: kg(1),
    names: { ca: "Pomes", es: "Manzanas", en: "Apples" },
    synonyms: ["poma", "manzana", "apple"],
    include: ["manzana", "poma$", "pomes$"],
    exclude: ["zumo", "compota", "sidra", "tarta", "chips", "yogur", "pure", "potito", "bebida", "vinagre", "suc", "snack", "deshidratada"]
  },
  {
    id: "oranges",
    group: "produce",
    defaultSize: kg(1),
    names: { ca: "Taronges", es: "Naranjas", en: "Oranges" },
    synonyms: ["taronja", "naranja", "orange"],
    include: ["naranja", "taronja", "taronges"],
    exclude: ["zumo", "mermelada", "bebida", "refresco", "sabor", "piel", "chocolate", "naranjada", "suc", "melmelada", "gajos en almibar"]
  },
  {
    id: "potatoes",
    group: "produce",
    defaultSize: kg(1),
    names: { ca: "Patates", es: "Patatas", en: "Potatoes" },
    synonyms: ["patata", "potato"],
    include: ["patata", "patates"],
    exclude: ["fritas", "chips", "snack", "tortilla", "pure", "congelad", "gajos", "bravas", "rellena", "horno", "paja", "lisas", "onduladas", "prefrita", "fregides", "xips", "sabor"]
  },
  {
    id: "onions",
    group: "produce",
    defaultSize: kg(1),
    names: { ca: "Cebes", es: "Cebollas", en: "Onions" },
    synonyms: ["ceba", "cebolla", "onion"],
    include: ["cebolla", "ceba$", "cebes$"],
    exclude: ["frita", "crujiente", "encurtid", "polvo", "sopa", "salsa", "aros", "caramelizada", "confitada", "tortilla", "congelad", "fregida"]
  },
  {
    id: "carrots",
    group: "produce",
    defaultSize: kg(1),
    names: { ca: "Pastanagues", es: "Zanahorias", en: "Carrots" },
    synonyms: ["pastanaga", "zanahoria", "carrot"],
    include: ["zanahoria", "pastanag"],
    exclude: ["zumo", "pure", "crema", "tarta", "suc", "congelad"]
  },
  {
    id: "lettuce",
    group: "produce",
    defaultSize: ud(1),
    names: { ca: "Enciam", es: "Lechuga", en: "Lettuce" },
    synonyms: ["enciam iceberg", "lechuga iceberg", "lettuce"],
    include: ["lechuga", "enciam"],
    exclude: ["ensalada", "mezcla", "brotes", "amanida", "barreja"]
  },
  // Meat and fish
  {
    id: "chicken_breast",
    group: "meat_fish",
    defaultSize: kg(1),
    names: { ca: "Pit de pollastre", es: "Pechuga de pollo", en: "Chicken breast" },
    synonyms: ["pollastre", "pollo", "chicken", "pit pollastre"],
    include: ["pechuga de pollo", "pechugas de pollo", "filetes de pechuga de pollo", "pit de pollastre", "filets de pit de pollastre"],
    exclude: ["empanad", "cocida", "asada", "lonchas", "fiambre", "nuggets", "rellena", "arrebossat", "cuit", "llesques", "pavo", "gall dindi"]
  },
  {
    id: "minced_meat",
    group: "meat_fish",
    defaultSize: kg(0.5),
    names: { ca: "Carn picada", es: "Carne picada", en: "Minced meat" },
    synonyms: ["picada", "mince", "ground beef", "carne molida"],
    include: ["carne picada", "picada de vacuno", "picada vacuno", "burger meat", "carn picada"]
  },
  {
    id: "ham_cooked",
    group: "meat_fish",
    defaultSize: kg(0.25),
    names: { ca: "Pernil dol\xE7", es: "Jam\xF3n cocido", en: "Cooked ham" },
    synonyms: ["pernil", "jamon york", "york", "ham"],
    include: ["jamon cocido", "pernil dolc", "pernil cuit"],
    exclude: ["croqueta", "pizza", "sandwich", "bocadillo", "empanad"]
  },
  // Drinks
  {
    id: "water",
    group: "drinks",
    defaultSize: l(1),
    maxPackRatio: 10,
    names: { ca: "Aigua", es: "Agua", en: "Bottled water" },
    synonyms: ["aigua mineral", "agua mineral", "water"],
    include: ["agua mineral", "agua$", "aigua mineral", "aigua$"],
    exclude: ["con gas", "amb gas", "tonica", "coco", "saborizada", "micelar", "perfume", "colonia", "oxigenada", "destilada", "rosas", "sabor", "bebida", "fresca", "de mar", "limon", "llimona"]
  },
  {
    id: "beer",
    group: "drinks",
    defaultSize: l(1),
    maxPackRatio: 6,
    names: { ca: "Cervesa", es: "Cerveza", en: "Beer" },
    synonyms: ["birra", "birres", "beer", "cerveses", "cervezas"],
    include: ["cerveza", "cervesa"],
    exclude: ["sin alcohol", "sense alcohol", "0,0", "0.0", "radler", "con limon", "amb llimona", "sin gluten"]
  },
  {
    id: "orange_juice",
    group: "drinks",
    defaultSize: l(1),
    names: { ca: "Suc de taronja", es: "Zumo de naranja", en: "Orange juice" },
    synonyms: ["suc", "zumo", "juice", "suc taronja", "zumo naranja"],
    include: ["zumo de naranja", "suc de taronja", "zumo naranja", "suc taronja"],
    exclude: ["con leche", "amb llet", "refresco", "nectar", "mango", "zanahoria", "pastanaga"]
  },
  // Household
  {
    id: "toilet_paper",
    group: "household",
    defaultSize: ud(12),
    names: { ca: "Paper higi\xE8nic", es: "Papel higi\xE9nico", en: "Toilet paper" },
    synonyms: ["paper wc", "papel wc", "toilet roll", "loo roll"],
    include: ["papel higienico", "paper higienic"],
    exclude: ["humedo", "humit"]
  },
  {
    id: "kitchen_roll",
    group: "household",
    defaultSize: ud(2),
    names: { ca: "Paper de cuina", es: "Papel de cocina", en: "Kitchen roll" },
    synonyms: ["paper cuina", "papel cocina", "paper towel"],
    include: ["papel de cocina", "rollo de cocina", "paper de cuina"]
  },
  {
    id: "laundry_detergent",
    group: "household",
    defaultSize: ud(40),
    names: { ca: "Detergent per a la roba", es: "Detergente para ropa", en: "Laundry detergent" },
    synonyms: ["detergent", "detergente", "sabo de rentadora", "laundry"],
    include: ["detergente", "detergent"],
    exclude: ["lavavajillas", "vajilla", "rentaplats", "rentavaixelles", "suavizante", "suavitzant", "mano", "ma$", "prendas delicadas"]
  },
  {
    id: "dish_soap",
    group: "household",
    defaultSize: l(1),
    names: { ca: "Rentaplats", es: "Lavavajillas a mano", en: "Washing-up liquid" },
    synonyms: ["fairy", "lavavajillas", "dish soap", "washing up liquid"],
    include: ["lavavajillas a mano", "lavavajillas mano", "friegaplatos", "rentaplats a ma", "rentaplats"],
    exclude: ["maquina", "pastillas", "capsulas", "maquina", "rentavaixelles", "pastilles"]
  },
  // Personal care
  {
    id: "shampoo",
    group: "personal",
    defaultSize: l(1),
    names: { ca: "Xamp\xFA", es: "Champ\xFA", en: "Shampoo" },
    synonyms: ["xampu", "champu", "shampoo"],
    include: ["champu", "xampu"],
    exclude: ["perro", "mascota", "seco", "gos", "sec$"]
  },
  {
    id: "toothpaste",
    group: "personal",
    defaultSize: l(0.1),
    names: { ca: "Pasta de dents", es: "Pasta de dientes", en: "Toothpaste" },
    synonyms: ["dentifric", "dentifrico", "toothpaste"],
    include: ["pasta dentifrica", "pasta de dientes", "dentifrico", "pasta de dents", "dentifric"],
    exclude: ["infantil", "cepillo", "raspall"]
  }
];
var CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
function phraseRegex(phrase) {
  const whole = phrase.endsWith("$");
  const p = normalize(whole ? phrase.slice(0, -1) : phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^| )${p}${whole ? "(?= |$)" : ""}`);
}
var compiled = null;
function rules() {
  compiled ??= CATEGORIES.map((c) => ({
    id: c.id,
    include: c.include.map(phraseRegex),
    exclude: (c.exclude ?? []).map(phraseRegex)
  }));
  return compiled;
}
function classifyProduct(name, brand) {
  let n = normalize(name);
  const b = brand ? normalize(brand) : "";
  if (b && b.length >= 3) n = ` ${n} `.replace(` ${b} `, " ").trim();
  for (const r of rules()) {
    if (r.include.some((re) => re.test(n)) && !r.exclude.some((re) => re.test(n))) return r.id;
  }
  return null;
}

// packages/core/src/freshness.ts
var DAY_MS = 24 * 60 * 60 * 1e3;

// ingest/src/chains/mercadona.ts
var MERCADONA_API = "https://tienda.mercadona.es/api";
var num = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
var REFERENCE_UNIT = { kg: "kg", l: "l", ud: "unit", u: "unit", unidad: "unit" };
function mercadonaSize(p) {
  const pi = p.price_instructions;
  const amount = num(pi.unit_size);
  if (amount && pi.size_format) {
    const size = toSize(amount, pi.size_format);
    if (size) return size;
  }
  return parseSize(`${p.display_name} ${p.packaging ?? ""}`);
}
function guessBrand(displayName) {
  const own = ["Hacendado", "Deliplus", "Bosque Verde", "Compy", "Solcare"];
  return own.find((b) => displayName.toLowerCase().includes(b.toLowerCase()));
}
function parseMercadonaProduct(p, chainCategory, detail) {
  const brand = detail?.brand?.trim() || guessBrand(p.display_name);
  return {
    chain: "mercadona",
    chainProductId: String(p.id),
    name: p.display_name.trim(),
    brand,
    ean: detail?.ean?.trim() || void 0,
    isOwnBrand: isOwnBrand("mercadona", brand),
    categoryId: classifyProduct(p.display_name, brand),
    size: mercadonaSize(p),
    imageUrl: p.thumbnail ?? void 0,
    chainCategory
  };
}
function parseMercadonaPrice(p, zone, observedAt) {
  const pi = p.price_instructions;
  const price = num(pi.unit_price);
  if (!price) return null;
  const refUnit = pi.reference_format ? REFERENCE_UNIT[pi.reference_format.trim().toLowerCase()] : void 0;
  let unitPrice = refUnit ? num(pi.reference_price) ?? num(pi.bulk_price) : null;
  if (unitPrice === null) {
    const size = mercadonaSize(p);
    unitPrice = size ? round(price / size.amount, 4) : null;
  }
  const previous = num(pi.previous_unit_price);
  return {
    chain: "mercadona",
    chainProductId: String(p.id),
    zone,
    price,
    unitPrice,
    promotion: pi.price_decreased && previous && previous > price ? `was ${previous.toFixed(2)}` : void 0,
    observedAt,
    source: "online"
  };
}
async function mercadonaWarehouse(http, postalCode) {
  const res = await http.request(`${MERCADONA_API}/postal-codes/actions/change-pc/`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ new_postal_code: postalCode })
  });
  const warehouse = res.headers.get("x-customer-wh");
  if (!warehouse || !/^[a-z0-9_-]+$/i.test(warehouse)) throw new Error(`No verified pricing zone for ${postalCode}`);
  return warehouse;
}
async function scrapeMercadona(http, opts) {
  const wh = opts.warehouse;
  const observedAt = (opts.now ?? /* @__PURE__ */ new Date()).toISOString();
  const log = opts.log ?? (() => {
  });
  const tree = await http.json(`${MERCADONA_API}/categories/?lang=es&wh=${wh}`);
  const leafIds = tree.results.flatMap((top) => top.categories.map((c) => ({ id: c.id, path: `${top.name} > ${c.name}` })));
  const limit = opts.maxCategories ?? leafIds.length;
  const products = /* @__PURE__ */ new Map();
  const prices = /* @__PURE__ */ new Map();
  for (const leaf of leafIds.slice(0, limit)) {
    const detail = await http.json(`${MERCADONA_API}/categories/${leaf.id}/?lang=es&wh=${wh}`);
    for (const sub of detail.categories) {
      for (const p of sub.products) {
        if (p.published === false || products.has(String(p.id))) continue;
        let productDetail;
        if (opts.needsDetail?.(String(p.id))) {
          try {
            productDetail = await http.json(`${MERCADONA_API}/products/${p.id}/?lang=es&wh=${wh}`);
          } catch (err) {
            log(`detail failed for ${p.id}: ${err.message}`);
          }
        }
        products.set(String(p.id), parseMercadonaProduct(p, `${leaf.path} > ${sub.name}`, productDetail));
        const price = parseMercadonaPrice(p, wh, observedAt);
        if (price) prices.set(String(p.id), price);
      }
    }
    log(`${leaf.path}: ${products.size} products so far`);
  }
  return { products: [...products.values()], prices: [...prices.values()] };
}

// ingest/src/sink.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
var JsonSink = class {
  constructor(dir) {
    this.dir = dir;
  }
  async existingProducts() {
    return /* @__PURE__ */ new Map();
  }
  async save(chain, products, prices) {
    await mkdir(this.dir, { recursive: true });
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const file = join(this.dir, `${chain}-${stamp}.json`);
    await writeFile(file, JSON.stringify({ chain, products, prices }, null, 2));
    return { products: products.length, prices: prices.length, shrunk: [] };
  }
};

// ingest/src/database.ts
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
var { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=10000;
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chains (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, chain TEXT NOT NULL REFERENCES chains(id), chain_product_id TEXT NOT NULL,
      data TEXT NOT NULL CHECK(json_valid(data)), first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
      previous_size_amount REAL, size_changed_at TEXT, UNIQUE(chain, chain_product_id)
    );
    CREATE TABLE IF NOT EXISTS price_observations (
      id INTEGER PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
      chain TEXT NOT NULL REFERENCES chains(id), zone TEXT NOT NULL,
      price REAL NOT NULL CHECK(price > 0), unit_price REAL CHECK(unit_price >= 0),
      promotion TEXT, observed_at TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('online','receipt','leaflet')),
      UNIQUE(product_id, zone, observed_at)
    );
    CREATE INDEX IF NOT EXISTS price_latest_idx ON price_observations(product_id, zone, observed_at DESC);
    CREATE INDEX IF NOT EXISTS price_time_idx ON price_observations(observed_at);
    INSERT OR IGNORE INTO schema_migrations VALUES(1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  `);
  const chain = db.prepare("INSERT OR IGNORE INTO chains VALUES(?, ?)");
  for (const c of Object.values(CHAINS)) chain.run(c.id, c.name);
  const category = db.prepare("INSERT INTO categories VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data");
  for (const c of CATEGORIES) category.run(c.id, JSON.stringify(c));
  return db;
}

// ingest/src/sqliteSink.ts
var SqliteSink = class {
  db;
  constructor(path) {
    this.db = openDatabase(path);
  }
  close() {
    this.db.close();
  }
  async existingProducts(chain) {
    return new Map(this.db.prepare("SELECT data FROM products WHERE chain=?").all(chain).map((r) => {
      const p = JSON.parse(r.data);
      return [p.chainProductId, { id: p.id, chainProductId: p.chainProductId, sizeAmount: p.size?.amount ?? null, ean: p.ean ?? null }];
    }));
  }
  async save(chain, products, prices) {
    const existing = await this.existingProducts(chain);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const shrunk = [];
    const upsert = this.db.prepare(`INSERT INTO products
      (id,chain,chain_product_id,data,first_seen,last_seen,previous_size_amount,size_changed_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(chain,chain_product_id) DO UPDATE SET data=excluded.data,last_seen=excluded.last_seen,
      previous_size_amount=COALESCE(excluded.previous_size_amount,products.previous_size_amount),
      size_changed_at=COALESCE(excluded.size_changed_at,products.size_changed_at)`);
    const insert = this.db.prepare(`INSERT INTO price_observations
      (product_id,chain,zone,price,unit_price,promotion,observed_at,source) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(product_id,zone,observed_at) DO NOTHING`);
    let inserted = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const p of products) {
        if (p.chain !== chain) throw new Error("Product chain mismatch");
        const old = existing.get(p.chainProductId);
        const id = old?.id ?? `${chain}:${p.chainProductId}`;
        const changed = old?.sizeAmount != null && p.size != null && Math.abs(old.sizeAmount - p.size.amount) > 1e-6;
        const stored = { ...p, id, ean: p.ean ?? old?.ean ?? void 0 };
        upsert.run(
          id,
          chain,
          p.chainProductId,
          JSON.stringify(stored),
          now,
          now,
          changed ? old.sizeAmount : null,
          changed ? now : null
        );
        if (changed && p.size.amount < old.sizeAmount) shrunk.push(p.chainProductId);
      }
      for (const p of prices) {
        if (p.chain !== chain || !Number.isFinite(p.price) || p.price <= 0 || !Number.isFinite(Date.parse(p.observedAt))) {
          throw new Error("Invalid price observation");
        }
        inserted += Number(insert.run(
          `${chain}:${p.chainProductId}`,
          chain,
          p.zone,
          p.price,
          p.unitPrice,
          p.promotion ?? null,
          new Date(p.observedAt).toISOString(),
          p.source
        ).changes);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return { products: products.length, prices: inserted, shrunk };
  }
};

// ingest/src/run.ts
var DEFAULT_POSTAL_CODES = ["08001", "08012", "08014", "08018", "08027", "08028"];
async function main() {
  const { values } = parseArgs({
    options: {
      chain: { type: "string", default: "mercadona" },
      postal: { type: "string", default: DEFAULT_POSTAL_CODES.join(",") },
      sink: { type: "string", default: "json" },
      details: { type: "string", default: "new" },
      "max-categories": { type: "string" },
      out: { type: "string", default: "out" }
    }
  });
  let sink;
  if (values.sink === "sqlite") {
    if (!process.env.DATABASE_PATH) throw new Error("Set DATABASE_PATH to the local SQLite file.");
    sink = new SqliteSink(process.env.DATABASE_PATH);
  } else if (values.sink === "json") {
    sink = new JsonSink(values.out);
  } else throw new Error("Unknown sink. Use json or sqlite.");
  if (values.chain !== "mercadona") {
    throw new Error(`Chain "${values.chain}" has no importer yet. v1 importers: mercadona.`);
  }
  const http = new PoliteClient({ delayMs: 400 });
  const log = (m) => console.log(`[mercadona] ${m}`);
  const postalCodes = values.postal.split(",").map((s) => s.trim()).filter(Boolean);
  const zones = /* @__PURE__ */ new Map();
  for (const pc of postalCodes) {
    const wh = await mercadonaWarehouse(http, pc);
    log(`postal code ${pc} -> warehouse ${wh}`);
    if (!zones.has(wh)) zones.set(wh, pc);
  }
  const existing = await sink.existingProducts("mercadona");
  const seenDetail = /* @__PURE__ */ new Set();
  const needsDetail = (id) => {
    if (values.details === "none" || seenDetail.has(id)) return false;
    seenDetail.add(id);
    return values.details === "all" || !existing.get(id)?.ean;
  };
  for (const wh of zones.keys()) {
    const result = await scrapeMercadona(http, {
      warehouse: wh,
      needsDetail,
      maxCategories: values["max-categories"] ? Number(values["max-categories"]) : void 0,
      log
    });
    const classified = result.products.filter((p) => p.categoryId).length;
    log(`warehouse ${wh}: ${result.products.length} products (${classified} matched to generic items), ${result.prices.length} prices`);
    const saved = await sink.save("mercadona", result.products, result.prices);
    log(`saved ${saved.products} products, ${saved.prices} prices${saved.shrunk.length ? `, size went down: ${saved.shrunk.join(", ")}` : ""}`);
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
