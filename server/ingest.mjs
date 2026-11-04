// ingest/src/run.ts
import { parseArgs } from "node:util";

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
  consum: {
    id: "consum",
    name: "Consum",
    color: "#F39200",
    ownBrands: ["Consum"],
    online: true,
    // The online shop shows one price without asking for a location.
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

// packages/core/src/brands.ts
var KNOWN_BRANDS = [
  "Central Lechera Asturiana",
  "Asturiana",
  "Pascual",
  "ATO",
  "Puleva",
  "Kaiku",
  "Covap",
  "Llet Nostra",
  "Lauki",
  "Celta",
  "Feiraco",
  "Danone",
  "Activia",
  "Danet",
  "Oikos",
  "Yoplait",
  "La Fageda",
  "Nestl\xE9",
  "La Lechera",
  "Nesquik",
  "Nescaf\xE9",
  "Nidina",
  "Pr\xE9sident",
  "Garc\xEDa Baquero",
  "El Caser\xEDo",
  "Philadelphia",
  "Babybel",
  "Kerrygold",
  "Flora",
  "Tulip\xE1n",
  "Carbonell",
  "Koipe",
  "Koipesol",
  "La Espa\xF1ola",
  "Borges",
  "Hojiblanca",
  "Ybarra",
  "Coosur",
  "Oleoestepa",
  "SOS",
  "Brillante",
  "La Fallera",
  "Nomen",
  "Gallo",
  "Barilla",
  "Garofalo",
  "Buitoni",
  "Rummo",
  "Bimbo",
  "Panrico",
  "Recondo",
  "Calvo",
  "Isabel",
  "Albo",
  "Cuca",
  "Rianxeira",
  "Orlando",
  "Sol\xEDs",
  "Hida",
  "Apis",
  "Luengo",
  "Cidacos",
  "Litoral",
  "Gallina Blanca",
  "Knorr",
  "Starlux",
  "ElPozo",
  "El Pozo",
  "Campofr\xEDo",
  "Navidul",
  "Casa Tarradellas",
  "Noel",
  "Oscar Mayer",
  "Argal",
  "Marcilla",
  "Saimaza",
  "Bonka",
  "Lavazza",
  "Dolce Gusto",
  "Starbucks",
  "Tassimo",
  "Cola Cao",
  "Azucarera",
  "Acor",
  "Font Vella",
  "Bezoya",
  "Lanjar\xF3n",
  "Aquabona",
  "Sol\xE1n de Cabras",
  "Viladrau",
  "Vichy Catalan",
  "Estrella Damm",
  "Damm",
  "Moritz",
  "Mahou",
  "San Miguel",
  "Heineken",
  "Alhambra",
  "Amstel",
  "Cruzcampo",
  "Voll-Damm",
  "Don Sim\xF3n",
  "Granini",
  "Zumosol",
  "Juver",
  "Coca-Cola",
  "Fanta",
  "Pepsi",
  "Schweppes",
  "Aquarius",
  "Scottex",
  "Colhogar",
  "Renova",
  "Foxy",
  "Ariel",
  "Skip",
  "Wipp",
  "Dixan",
  "Colon",
  "Norit",
  "Fairy",
  "Mistol",
  "Finish",
  "Pantene",
  "H&S",
  "Head & Shoulders",
  "Elvive",
  "Garnier",
  "Fructis",
  "Herbal Essences",
  "Johnson",
  "Nivea",
  "Dove",
  "Sanex",
  "Colgate",
  "Signal",
  "Sensodyne",
  "Oral-B",
  "Licor del Polo",
  "Kinder",
  "Milka",
  "Valor",
  "Torras",
  "Lindt",
  "Chupa Chups",
  "La Menorquina",
  "Frigo",
  "H\xE4agen-Dazs",
  "Puleva Peques"
];
var compiled = null;
function detectBrand(name) {
  compiled ??= [...KNOWN_BRANDS].sort((a, b) => b.length - a.length).map((brand) => ({ brand, re: new RegExp(`(?:^| )${normalize(brand).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?= |$)`) }));
  const n = normalize(name);
  return compiled.find((b) => b.re.test(n))?.brand;
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
    include: ["azucar$", "sucre$"],
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
    exclude: ["mermelada", "bebida", "refresco", "sabor", "piel", "chocolate", "naranjada", "melmelada", "gajos en almibar"]
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
function phraseRegex(phrase, position) {
  const whole = phrase.endsWith("$");
  const p = normalize(whole ? phrase.slice(0, -1) : phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = position === "first" ? "^" : position === "start" ? "^(?:[^ ]+ )?" : "(?:^| )";
  return new RegExp(`${prefix}${p}${whole ? "(?= |$)" : ""}`);
}
var NOT_GROCERIES = [
  "semilla",
  "llavor",
  "mascota",
  "pienso",
  "comedero",
  "gato$",
  "gatos$",
  "gat$",
  "perro$",
  "perros$",
  "gos$",
  "aftersun",
  "solar$",
  "sun$",
  "spf",
  "corporal",
  "body milk",
  "desmaquillante",
  "juguete",
  "maceta",
  "leche de continuacion",
  "leche continuacion",
  "leche inicio",
  "leche de inicio",
  "llet de continuacio"
];
var compiled2 = null;
var notGroceries = null;
function rules() {
  compiled2 ??= CATEGORIES.map((c) => ({
    id: c.id,
    // Fresh produce names start with the product ("Naranjas de mesa"); "Rondo naranja" is a pastry.
    include: c.include.map((ph) => phraseRegex(ph, c.group === "produce" ? "first" : "start")),
    exclude: (c.exclude ?? []).map((ph) => phraseRegex(ph, "anywhere"))
  }));
  return compiled2;
}
function classifyProduct(name, brand) {
  let n = normalize(name);
  const b = brand ? normalize(brand) : "";
  if (b && b.length >= 3) n = ` ${n} `.replace(` ${b} `, " ").trim();
  notGroceries ??= NOT_GROCERIES.map((ph) => phraseRegex(ph, "anywhere"));
  if (notGroceries.some((re) => re.test(n))) return null;
  for (const r of rules()) {
    if (r.include.some((re) => re.test(n)) && !r.exclude.some((re) => re.test(n))) return r.id;
  }
  return null;
}

// packages/core/src/freshness.ts
var DAY_MS = 24 * 60 * 60 * 1e3;

// packages/core/src/geo.ts
function distanceKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
var BARCELONA_POSTAL_CODES = {
  "08001": { lat: 41.38, lng: 2.17, area: "El Raval" },
  "08002": { lat: 41.3825, lng: 2.177, area: "Barri G\xF2tic" },
  "08003": { lat: 41.384, lng: 2.184, area: "Sant Pere, la Ribera, Barceloneta" },
  "08004": { lat: 41.372, lng: 2.16, area: "Poble-sec" },
  "08005": { lat: 41.399, lng: 2.2, area: "Poblenou" },
  "08006": { lat: 41.399, lng: 2.148, area: "Sant Gervasi \u2013 Galvany" },
  "08007": { lat: 41.39, lng: 2.165, area: "Eixample" },
  "08008": { lat: 41.393, lng: 2.156, area: "Eixample" },
  "08009": { lat: 41.394, lng: 2.169, area: "Dreta de l\u2019Eixample" },
  "08010": { lat: 41.393, lng: 2.176, area: "Dreta de l\u2019Eixample" },
  "08011": { lat: 41.383, lng: 2.16, area: "Sant Antoni" },
  "08012": { lat: 41.403, lng: 2.157, area: "Vila de Gr\xE0cia" },
  "08013": { lat: 41.4, lng: 2.179, area: "Sagrada Fam\xEDlia" },
  "08014": { lat: 41.375, lng: 2.138, area: "Sants" },
  "08015": { lat: 41.377, lng: 2.151, area: "Sant Antoni \u2013 Hostafrancs" },
  "08016": { lat: 41.437, lng: 2.177, area: "Nou Barris" },
  "08017": { lat: 41.399, lng: 2.122, area: "Sarri\xE0" },
  "08018": { lat: 41.402, lng: 2.192, area: "Fort Pienc \u2013 Poblenou" },
  "08019": { lat: 41.411, lng: 2.206, area: "Diagonal Mar" },
  "08020": { lat: 41.419, lng: 2.2, area: "Sant Mart\xED" },
  "08021": { lat: 41.396, lng: 2.141, area: "Sant Gervasi" },
  "08022": { lat: 41.41, lng: 2.135, area: "Sant Gervasi \u2013 la Bonanova" },
  "08023": { lat: 41.413, lng: 2.149, area: "Vallcarca" },
  "08024": { lat: 41.41, lng: 2.16, area: "Gr\xE0cia" },
  "08025": { lat: 41.407, lng: 2.172, area: "Baix Guinard\xF3" },
  "08026": { lat: 41.411, lng: 2.184, area: "Sant Mart\xED \u2013 el Clot" },
  "08027": { lat: 41.429, lng: 2.188, area: "Sant Andreu" },
  "08028": { lat: 41.378, lng: 2.125, area: "Les Corts" },
  "08029": { lat: 41.387, lng: 2.143, area: "Les Corts \u2013 Eixample" },
  "08030": { lat: 41.436, lng: 2.198, area: "Sant Andreu \u2013 Bon Pastor" },
  "08031": { lat: 41.432, lng: 2.164, area: "Horta" },
  "08032": { lat: 41.425, lng: 2.154, area: "Horta \u2013 el Carmel" },
  "08033": { lat: 41.45, lng: 2.188, area: "Trinitat \u2013 Torre Bar\xF3" },
  "08034": { lat: 41.391, lng: 2.11, area: "Pedralbes" },
  "08035": { lat: 41.425, lng: 2.14, area: "Vall d\u2019Hebron" },
  "08036": { lat: 41.388, lng: 2.148, area: "Eixample (Hospital Cl\xEDnic)" },
  "08037": { lat: 41.4, lng: 2.164, area: "Gr\xE0cia \u2013 Passeig de Sant Joan" },
  "08038": { lat: 41.365, lng: 2.15, area: "Montju\xEFc" },
  "08039": { lat: 41.375, lng: 2.185, area: "Port Vell" },
  "08040": { lat: 41.348, lng: 2.14, area: "Zona Franca" },
  "08041": { lat: 41.419, lng: 2.176, area: "Guinard\xF3" },
  "08042": { lat: 41.439, lng: 2.178, area: "Nou Barris \u2013 Prosperitat" }
};
function isCataloniaPostalCode(code) {
  return /^(08|17|25|43)\d{3}$/.test(code.trim());
}
function postalCodeLocation(code) {
  return BARCELONA_POSTAL_CODES[code.trim()] ?? null;
}
function nearestPostalCode(pos) {
  let best = null;
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

// ingest/src/chains/terms.ts
function genericSearchTerms(lang = "es") {
  return [...new Set(CATEGORIES.map((c) => c.names[lang].toLowerCase()))];
}

// ingest/src/chains/bonarea.ts
var BONAREA_SEARCH = "https://www.bonarea-online.com/es/shop/find";
var BONAREA_ZONE = "cat";
var CARD = 'class="block-product block-product-shopping none"';
var ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
function decodeHtml(text) {
  return text.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m);
}
function euro(text) {
  const clean = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function parseBonareaPage(html) {
  const out = [];
  for (const chunk of html.split(CARD).slice(1)) {
    const c = chunk.slice(0, 4e3);
    const code = c.match(/data-identifier=["']?([0-9]{2}\*[0-9]+)/)?.[1];
    const name = c.match(/<div class=["']?text["']?><p>([^<]+)/)?.[1];
    if (!code || !name) continue;
    const price = c.match(/<div class=["']?price["']?>\s*<span>\s*([\d.,]+)\s*€\/u\.?\s*<\/span>/);
    const unit = c.match(/<div class=["']?price["']?>[\s\S]*?<\/span>\s*\(\s*([\d.,]+)\s*€\/(kg|l|ml|u)\.?\s*\)/);
    const unitValue = unit ? euro(unit[1]) : null;
    out.push({
      code,
      url: c.match(/data-friendly=["']?(https:\/\/[^\s"'>]+)/)?.[1],
      imageUrl: c.match(/data-src=["']?(https:\/\/[^\s"'>]+)/)?.[1]?.replace(/&amp;/g, "&"),
      name: decodeHtml(name).replace(/\s+/g, " ").trim(),
      weight: c.match(/<div class=["']?weight["']?>([^<]*)<\/div>/)?.[1]?.trim() || void 0,
      price: price ? euro(price[1]) : null,
      unitPrice: unit && unitValue ? { value: unitValue, unit: unit[2] } : null,
      outOfStock: c.includes("block-no-stock")
    });
  }
  return out;
}
function bonareaSize(card) {
  const weight = card.weight?.replace(/^aprox\.?\s*/i, "").replace(/^pack\s+/i, "");
  const m = weight?.match(/^([\d.,]+)\s*([a-z]+)\.?$/i);
  if (m) {
    const amount = Number(m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : m[1]);
    const size = toSize(amount, m[2]);
    if (size) return size;
  }
  return parseSize(card.name);
}
function isBonareaOwnBrand(code) {
  return /^\d{2}\*\d{4}$/.test(code);
}
var UNIT_BASE = { kg: "kg", l: "l", u: "unit" };
var MAX_PRICE = 300;
function cardToProduct(card) {
  const known = detectBrand(card.name);
  const own = !known && isBonareaOwnBrand(card.code);
  return {
    chain: "bonarea",
    chainProductId: card.code,
    name: card.name,
    brand: known ?? (own ? "bon\xC0rea" : void 0),
    isOwnBrand: own,
    categoryId: classifyProduct(card.name, known),
    size: bonareaSize(card),
    imageUrl: card.imageUrl
  };
}
function cardToPrice(card, size, observedAt) {
  if (card.outOfStock || !card.price || card.price > MAX_PRICE) return null;
  const base = card.unitPrice ? UNIT_BASE[card.unitPrice.unit] : void 0;
  let unitPrice = null;
  if (card.unitPrice && base && (!size || size.unit === base)) unitPrice = card.unitPrice.value;
  else if (size) unitPrice = round(card.price / size.amount, 4);
  return {
    chain: "bonarea",
    chainProductId: card.code,
    zone: BONAREA_ZONE,
    price: card.price,
    unitPrice,
    observedAt,
    source: "online"
  };
}
async function scrapeBonarea(http, opts = {}) {
  const observedAt = (opts.now ?? /* @__PURE__ */ new Date()).toISOString();
  const log = opts.log ?? (() => {
  });
  const products = /* @__PURE__ */ new Map();
  const prices2 = /* @__PURE__ */ new Map();
  let emptyPages = 0;
  for (const term of opts.terms ?? genericSearchTerms("es")) {
    const res = await http.request(`${BONAREA_SEARCH}?${new URLSearchParams({ searchWords: term })}`, {
      headers: { accept: "text/html,application/xhtml+xml", "accept-language": "es-ES,es;q=0.9,ca;q=0.8" }
    });
    const cards = parseBonareaPage(await res.text());
    if (cards.length === 0) emptyPages++;
    for (const card of cards) {
      if (products.has(card.code)) continue;
      const product = cardToProduct(card);
      if (!product.categoryId || !product.size) continue;
      const price = cardToPrice(card, product.size, observedAt);
      if (!price) continue;
      products.set(card.code, product);
      prices2.set(card.code, price);
    }
    log(`"${term}": ${cards.length} cards, ${products.size} products kept so far`);
  }
  if (emptyPages > 0) log(`${emptyPages} searches returned no product cards`);
  return { products: [...products.values()], prices: [...prices2.values()] };
}

// ingest/src/chains/consum.ts
var CONSUM_API = "https://tienda.consum.es/api/rest/V1.0/catalog/product";
var CONSUM_ZONE = "cat";
var PAGE_SIZE = 40;
var num = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
var UNIT_TYPES = {
  "1 kg": { unit: "kg", per: 1 },
  "1 l": { unit: "l", per: 1 },
  "100 ml": { unit: "l", per: 0.1 },
  "100 g": { unit: "kg", per: 0.1 },
  "100 gr": { unit: "kg", per: 0.1 },
  "1 ud": { unit: "unit", per: 1 },
  "1 u": { unit: "unit", per: 1 }
};
function prices(item) {
  const list = item.priceData?.prices ?? [];
  const regular = list.find((p) => p.id === "PRICE") ?? list[0];
  const offer = list.find((p) => p !== regular && p.id !== "PRICE");
  return {
    price: num(regular?.value?.centAmount),
    unitAmount: num(regular?.value?.centUnitAmount),
    offer: num(offer?.value?.centAmount)
  };
}
function displayName(item) {
  return (item.productData?.description || item.productData?.name || "").replace(/\s+/g, " ").trim();
}
function consumSize(item) {
  const { price, unitAmount } = prices(item);
  const type = UNIT_TYPES[(item.priceData?.unitPriceUnitType ?? "").trim().toLowerCase()];
  if (price && unitAmount && type) return { amount: round(price / unitAmount * type.per, 4), unit: type.unit };
  return parseSize(displayName(item));
}
function parseConsumProduct(item) {
  const name = displayName(item);
  if (!name || item.id === void 0 || item.id === null) return null;
  const brand = item.productData?.brand?.name?.trim() || void 0;
  const ean = item.ean && /^\d{8,14}$/.test(item.ean.trim()) ? item.ean.trim() : void 0;
  return {
    chain: "consum",
    chainProductId: String(item.id),
    name,
    brand,
    ean,
    isOwnBrand: isOwnBrand("consum", brand),
    categoryId: classifyProduct(name, brand),
    size: consumSize(item),
    imageUrl: item.productData?.imageURL ?? void 0
  };
}
var MAX_PRICE2 = 300;
function parseConsumPrice(item, size, observedAt) {
  const { price, unitAmount, offer } = prices(item);
  if (!price || price > MAX_PRICE2) return null;
  const type = UNIT_TYPES[(item.priceData?.unitPriceUnitType ?? "").trim().toLowerCase()];
  let unitPrice = null;
  if (unitAmount && type && (!size || size.unit === type.unit)) unitPrice = round(unitAmount / type.per, 4);
  else if (size) unitPrice = round(price / size.amount, 4);
  return {
    chain: "consum",
    chainProductId: String(item.id),
    zone: CONSUM_ZONE,
    price,
    unitPrice,
    promotion: offer && offer < price ? `offer ${offer.toFixed(2)}` : void 0,
    observedAt,
    source: "online"
  };
}
function consumSearchTerms() {
  return genericSearchTerms("es");
}
async function scrapeConsum(http, opts = {}) {
  const observedAt = (opts.now ?? /* @__PURE__ */ new Date()).toISOString();
  const log = opts.log ?? (() => {
  });
  const maxPages = opts.maxPages ?? 3;
  const products = /* @__PURE__ */ new Map();
  const priceById = /* @__PURE__ */ new Map();
  for (const term of opts.terms ?? consumSearchTerms()) {
    for (let page = 0; page < maxPages; page++) {
      const url = `${CONSUM_API}?${new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), q: term })}`;
      const data = await http.json(url);
      for (const item of data.products ?? []) {
        const product = parseConsumProduct(item);
        if (!product?.categoryId || products.has(product.chainProductId)) continue;
        const price = parseConsumPrice(item, product.size, observedAt);
        if (!price) continue;
        products.set(product.chainProductId, product);
        priceById.set(product.chainProductId, price);
      }
      if (!data.hasMore) break;
    }
    log(`"${term}": ${products.size} products so far`);
  }
  return { products: [...products.values()], prices: [...priceById.values()] };
}

// ingest/src/chains/mercadona.ts
var MERCADONA_API = "https://tienda.mercadona.es/api";
var num2 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
var REFERENCE_UNIT = { kg: "kg", l: "l", ud: "unit", u: "unit", unidad: "unit" };
function mercadonaSize(p) {
  const pi = p.price_instructions;
  const amount = num2(pi.unit_size);
  if (amount && pi.size_format) {
    const size = toSize(amount, pi.size_format);
    if (size) return size;
  }
  return parseSize(`${p.display_name} ${p.packaging ?? ""}`);
}
function guessBrand(displayName2) {
  const own = ["Hacendado", "Deliplus", "Bosque Verde", "Compy", "Solcare"];
  return own.find((b) => displayName2.toLowerCase().includes(b.toLowerCase()));
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
  const price = num2(pi.unit_price);
  if (!price) return null;
  const refUnit = pi.reference_format ? REFERENCE_UNIT[pi.reference_format.trim().toLowerCase()] : void 0;
  const size = mercadonaSize(p);
  let unitPrice = refUnit && (!size || refUnit === size.unit) ? num2(pi.reference_price) ?? num2(pi.bulk_price) : null;
  if (unitPrice === null) {
    unitPrice = size ? round(price / size.amount, 4) : null;
  }
  const previous = num2(pi.previous_unit_price);
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
  const prices2 = /* @__PURE__ */ new Map();
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
        if (price) prices2.set(String(p.id), price);
      }
    }
    log(`${leaf.path}: ${products.size} products so far`);
  }
  return { products: [...products.values()], prices: [...prices2.values()] };
}

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
    CREATE TABLE IF NOT EXISTS import_runs (name TEXT PRIMARY KEY, finished_at TEXT NOT NULL, detail TEXT);
    INSERT OR IGNORE INTO schema_migrations VALUES(2, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  `);
  const chain = db.prepare("INSERT OR IGNORE INTO chains VALUES(?, ?)");
  for (const c of Object.values(CHAINS)) chain.run(c.id, c.name);
  const category = db.prepare("INSERT INTO categories VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data");
  for (const c of CATEGORIES) category.run(c.id, JSON.stringify(c));
  return db;
}
function replaceStores(db, source, stores) {
  const insert = db.prepare("INSERT INTO stores VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM stores WHERE json_extract(data, '$.source') = ?").run(source);
    for (const s of stores) {
      if (s.source !== source) throw new Error(`Store ${s.id} is not from ${source}`);
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng) || !s.zone) throw new Error(`Store ${s.id} has no position or zone`);
      insert.run(s.id, JSON.stringify(s));
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return stores.length;
}
function lastRun(db, name) {
  return db.prepare("SELECT finished_at FROM import_runs WHERE name=?").get(name)?.finished_at ?? null;
}
function recordRun(db, name, at, detail) {
  db.prepare("INSERT INTO import_runs VALUES(?, ?, ?) ON CONFLICT(name) DO UPDATE SET finished_at=excluded.finished_at, detail=excluded.detail").run(name, at.toISOString(), detail === void 0 ? null : JSON.stringify(detail));
}
function storeZones(db, chain) {
  const rows = db.prepare(`SELECT json_extract(data, '$.zone') AS zone, MIN(json_extract(data, '$.postalCode')) AS postal
    FROM stores WHERE json_extract(data, '$.chain') = ? AND json_extract(data, '$.postalCode') IS NOT NULL GROUP BY zone`).all(chain);
  return new Map(rows.map((r) => [r.zone, r.postal]));
}

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
  async save(chain, products, prices2) {
    await mkdir(this.dir, { recursive: true });
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const file = join(this.dir, `${chain}-${stamp}.json`);
    await writeFile(file, JSON.stringify({ chain, products, prices: prices2 }, null, 2));
    return { products: products.length, prices: prices2.length, shrunk: [] };
  }
};

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
  async save(chain, products, prices2) {
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
      for (const p of prices2) {
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

// ingest/src/stores/osm.ts
var OVERPASS_URL = "https://overpass-api.de/api/interpreter";
var BARCELONA_BBOX = { south: 41.317, west: 2.052, north: 41.468, east: 2.229 };
function overpassQuery(bbox = BARCELONA_BBOX) {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:120];
nwr["shop"~"^(supermarket|convenience)$"](${box});
out center tags;`;
}
var CHAIN_PATTERNS = [
  ["mercadona", /\bmercadona\b/],
  ["alcampo", /\balcampo\b|\bauchan\b/],
  ["bonarea", /\bbon ?area\b/],
  ["caprabo", /\bcaprabo\b/],
  ["bonpreu", /\bbon ?preu\b|\besclat\b/],
  // "Consum" at the start only: "Cooperativa de Consum …" is a different shop. Charter franchises are left out.
  ["consum", /^consum( |$)/],
  // "Dia", "DIA", "Dia Market", "La Plaza de DIA" — but not "Diagonal" or "Super Dia y Noche".
  ["dia", /^(la plaza de )?dia( market| maxi)?$/]
];
function chainFromTags(tags = {}) {
  for (const key of ["brand", "name", "operator"]) {
    const value = tags[key];
    if (!value) continue;
    const n = normalize(value);
    for (const [chain, re] of CHAIN_PATTERNS) if (re.test(n)) return chain;
  }
  return null;
}
function address(tags) {
  const street = tags["addr:street"];
  if (!street) return void 0;
  return tags["addr:housenumber"] ? `${street}, ${tags["addr:housenumber"]}` : street;
}
function storePostalCode(tags, lat, lng) {
  const tagged = tags["addr:postcode"]?.trim();
  if (tagged && /^\d{5}$/.test(tagged) && isCataloniaPostalCode(tagged)) return tagged;
  const nearest = nearestPostalCode({ lat, lng });
  const centre = nearest ? postalCodeLocation(nearest) : null;
  return nearest && centre && distanceKm(centre, { lat, lng }) <= 1.5 ? nearest : void 0;
}
function parseOsmElements(elements) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const chain = chainFromTags(tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!chain || lat === void 0 || lng === void 0) continue;
    const id = `osm:${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const addr = address(tags);
    const rawName = tags.name?.trim() || CHAINS[chain].name;
    const name = addr && normalize(rawName) === normalize(CHAINS[chain].name) ? `${rawName} \xB7 ${tags["addr:street"]}` : rawName;
    out.push({
      id,
      chain,
      name,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      address: addr,
      postalCode: storePostalCode(tags, lat, lng),
      openingHours: tags.opening_hours,
      source: "openstreetmap",
      osmType: el.type
    });
  }
  return out;
}
async function fetchOsmStores(http, bbox = BARCELONA_BBOX) {
  const res = await http.request(OVERPASS_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(overpassQuery(bbox))}`,
    signal: AbortSignal.timeout(18e4)
  });
  const json = await res.json();
  if (!Array.isArray(json.elements)) throw new Error("Overpass returned no elements array");
  return parseOsmElements(json.elements);
}
async function assignZones(candidates, resolve) {
  const stores = [];
  const skipped = [];
  for (const c of candidates) {
    let zone = null;
    try {
      zone = await resolve(c.chain, c.postalCode);
    } catch {
      zone = null;
    }
    if (!zone) {
      skipped.push(c);
      continue;
    }
    const { osmType: _osmType, ...store } = c;
    stores.push({ ...store, zone });
  }
  return { stores, skipped };
}
function defaultZoneResolver(mercadonaWarehouse2) {
  const cache = /* @__PURE__ */ new Map();
  return async (chain, postalCode) => {
    if (chain === "mercadona") {
      if (!postalCode) return null;
      if (!cache.has(postalCode)) cache.set(postalCode, mercadonaWarehouse2(postalCode));
      return cache.get(postalCode);
    }
    return CHAINS[chain].singlePriceZone ? "cat" : "bcn";
  };
}
function checkStoreResult(stores, minStores = 20, minChains = 3) {
  const chains = new Set(stores.map((s) => s.chain));
  if (stores.length < minStores || chains.size < minChains) {
    throw new Error(`Store import looks incomplete (${stores.length} stores, ${chains.size} chains); keeping the previous list.`);
  }
}

// ingest/src/stores/refresh.ts
var STORES_RUN = "stores:openstreetmap";
var STORES_MAX_AGE_DAYS = 7;
function storesDue(db, now = /* @__PURE__ */ new Date()) {
  const last = lastRun(db, STORES_RUN);
  return !last || now.getTime() - Date.parse(last) > STORES_MAX_AGE_DAYS * 864e5;
}
async function refreshStores(db, http, log, deps = {}) {
  const candidates = await (deps.fetchStores ?? fetchOsmStores)(http);
  const resolver = defaultZoneResolver(deps.warehouse ?? ((pc) => mercadonaWarehouse(http, pc)));
  const { stores, skipped } = await assignZones(candidates, resolver);
  checkStoreResult(stores);
  replaceStores(db, "openstreetmap", stores);
  const byChain = {};
  for (const s of stores) byChain[s.chain] = (byChain[s.chain] ?? 0) + 1;
  recordRun(db, STORES_RUN, deps.now ?? /* @__PURE__ */ new Date(), { stores: stores.length, skipped: skipped.length, byChain });
  log(`stores: ${stores.length} saved (${Object.entries(byChain).map(([c, n]) => `${c} ${n}`).join(", ")})` + (skipped.length ? `; ${skipped.length} skipped without a verified price zone` : ""));
  return { stores, skipped };
}

// ingest/src/run.ts
var DEFAULT_POSTAL_CODES = ["08001", "08012", "08014", "08018", "08027", "08028"];
async function save(ctx, chain, result, log, label) {
  const classified = result.products.filter((p) => p.categoryId).length;
  log(`${label}: ${result.products.length} products (${classified} matched to generic items), ${result.prices.length} prices`);
  const saved = await ctx.sink.save(chain, result.products, result.prices);
  log(`saved ${saved.products} products, ${saved.prices} prices${saved.shrunk.length ? `, size went down: ${saved.shrunk.join(", ")}` : ""}`);
}
var importMercadona = async (ctx, log) => {
  const zones = /* @__PURE__ */ new Map();
  for (const pc of ctx.postalCodes) {
    const wh = await mercadonaWarehouse(ctx.http, pc);
    log(`postal code ${pc} -> warehouse ${wh}`);
    if (!zones.has(wh)) zones.set(wh, pc);
  }
  if (ctx.sink instanceof SqliteSink) {
    for (const [zone, pc] of storeZones(ctx.sink.db, "mercadona")) {
      if (!zones.has(zone)) {
        zones.set(zone, pc);
        log(`warehouse ${zone} added because stores use it (postal code ${pc})`);
      }
    }
  }
  const existing = await ctx.sink.existingProducts("mercadona");
  const seenDetail = /* @__PURE__ */ new Set();
  const needsDetail = (id) => {
    if (ctx.details === "none" || seenDetail.has(id)) return false;
    seenDetail.add(id);
    return ctx.details === "all" || !existing.get(id)?.ean;
  };
  for (const wh of zones.keys()) {
    const result = await scrapeMercadona(ctx.http, { warehouse: wh, needsDetail, maxCategories: ctx.maxCategories, log });
    await save(ctx, "mercadona", result, log, `warehouse ${wh}`);
  }
};
var importConsum = async (ctx, log) => {
  const terms = consumSearchTerms().slice(0, ctx.maxCategories);
  const result = await scrapeConsum(ctx.http, { terms, log });
  if (result.products.length < Math.min(20, terms.length)) {
    throw new Error(`only ${result.products.length} products found for ${terms.length} searches; the shop may have changed`);
  }
  await save(ctx, "consum", result, log, "online shop");
};
var importBonarea = async (ctx, log) => {
  const terms = genericSearchTerms("es").slice(0, ctx.maxCategories);
  const result = await scrapeBonarea(ctx.http, { terms, log });
  if (result.products.length < Math.min(20, terms.length)) {
    throw new Error(`only ${result.products.length} products found for ${terms.length} searches; the page layout may have changed`);
  }
  await save(ctx, "bonarea", result, log, "online shop");
};
var IMPORTERS = { mercadona: importMercadona, consum: importConsum, bonarea: importBonarea };
async function main() {
  const { values } = parseArgs({
    options: {
      chain: { type: "string", default: "mercadona" },
      postal: { type: "string", default: DEFAULT_POSTAL_CODES.join(",") },
      sink: { type: "string", default: "json" },
      details: { type: "string", default: "new" },
      "max-categories": { type: "string" },
      out: { type: "string", default: "out" },
      stores: { type: "string", default: "auto" }
    }
  });
  let sink;
  if (values.sink === "sqlite") {
    if (!process.env.DATABASE_PATH) throw new Error("Set DATABASE_PATH to the local SQLite file.");
    sink = new SqliteSink(process.env.DATABASE_PATH);
  } else if (values.sink === "json") {
    sink = new JsonSink(values.out);
  } else throw new Error("Unknown sink. Use json or sqlite.");
  const chains = values.chain === "all" ? Object.keys(IMPORTERS) : values.chain.split(",").map((c) => c.trim()).filter(Boolean);
  const unknown = chains.filter((c) => !IMPORTERS[c]);
  if (unknown.length || chains.length === 0) {
    throw new Error(`No importer for "${unknown.join(", ")}". Importers: ${Object.keys(IMPORTERS).join(", ")} (or all).`);
  }
  if (!["auto", "force", "skip", "only"].includes(values.stores)) throw new Error("--stores must be auto, force, skip or only.");
  const http = new PoliteClient({ delayMs: 400 });
  if (sink instanceof SqliteSink && values.stores !== "skip") {
    if (values.stores !== "auto" || storesDue(sink.db)) {
      try {
        await refreshStores(sink.db, http, (m) => console.log(`[stores] ${m}`));
      } catch (err) {
        if (values.stores === "only") throw err;
        console.warn(`[stores] refresh failed, keeping previous locations: ${err.message}`);
      }
    }
    if (values.stores === "only") return;
  } else if (values.stores === "only") {
    throw new Error("--stores only needs --sink sqlite.");
  }
  const ctx = {
    sink,
    http,
    postalCodes: values.postal.split(",").map((s) => s.trim()).filter(Boolean),
    details: values.details,
    maxCategories: values["max-categories"] ? Number(values["max-categories"]) : void 0
  };
  const failed = [];
  for (const chain of chains) {
    const log = (m) => console.log(`[${chain}] ${m}`);
    try {
      await IMPORTERS[chain](ctx, log);
    } catch (err) {
      failed.push(chain);
      console.error(`[${chain}] import failed: ${err.message}`);
    }
  }
  if (failed.length) throw new Error(`Import failed for: ${failed.join(", ")}`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
