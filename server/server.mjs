// ingest/src/server.ts
import { createServer } from "node:http";

// packages/core/src/text.ts
function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/l·l/g, "ll").replace(/[^a-z0-9ñç.,\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(text) {
  return normalize(text).split(" ").map((t) => t.replace(/[.,]/g, "")).filter((t) => t.length > 0);
}
function editDistance(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[rows - 1][cols - 1];
}
function allowedTypos(length) {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}
function tokenMatches(query, word) {
  if (word === query) return true;
  if (query.length >= 3 && word.startsWith(query)) return true;
  const max = allowedTypos(query.length);
  return max > 0 && editDistance(query, word, max) <= max;
}

// packages/core/src/units.ts
var NUM = String.raw`(\d+(?:[.,]\d+)?)`;
var UNIT = String.raw`([a-z]+)`;
var MULTI = new RegExp(String.raw`(\d+)\s*(?:[a-z]+\s*)?[x×]\s*` + NUM + String.raw`\s*` + UNIT + String.raw`\b`, "gi");
var SINGLE = new RegExp(NUM + String.raw`\s*` + UNIT + String.raw`\b`, "gi");
function round(n, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
function sizeRatio(a, b) {
  if (!a || !b || a.unit !== b.unit || b.amount === 0) return null;
  return a.amount / b.amount;
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

// packages/core/src/categories.ts
var MAX_UNIT_PRICE = {
  milk: 4,
  eggs: 1.2,
  yogurt_plain: 12,
  butter: 40,
  cheese_sliced: 45,
  bread_sliced: 12,
  rice: 12,
  pasta: 12,
  olive_oil_ev: 25,
  olive_oil: 18,
  sunflower_oil: 8,
  coffee_ground: 50,
  sugar: 8,
  flour: 8,
  salt: 10,
  tomato_crushed: 8,
  tomato_fried: 10,
  tuna_canned: 60,
  chickpeas: 10,
  lentils: 12,
  tomatoes: 18,
  bananas: 6,
  apples: 8,
  oranges: 6,
  potatoes: 6,
  onions: 8,
  carrots: 6,
  lettuce: 4,
  chicken_breast: 15,
  minced_meat: 25,
  ham_cooked: 45,
  water: 3,
  beer: 12,
  orange_juice: 12,
  toilet_paper: 1.5,
  kitchen_roll: 4,
  laundry_detergent: 1.2,
  dish_soap: 15,
  shampoo: 60,
  toothpaste: 150
};
function plausibleUnitPrice(categoryId, unitPrice, unit) {
  const category = CATEGORY_BY_ID[categoryId];
  const max = MAX_UNIT_PRICE[categoryId];
  if (!category || max === void 0 || unitPrice === null || unit !== category.defaultSize.unit) return true;
  return unitPrice <= max;
}
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
    include: ["yogur natural", "iogurt natural", "yogur + natural$", "iogurt + natural$"],
    exclude: ["bebible", "liquid", "liquido", "sabor", "griego", "grec", "azucarad", "ensucrat", "edulcorad"]
  },
  {
    id: "butter",
    group: "dairy",
    defaultSize: kg(0.25),
    names: { ca: "Mantega", es: "Mantequilla", en: "Butter" },
    synonyms: [],
    include: ["mantequilla", "mantega"],
    exclude: ["galleta", "pasta de", "bollo", "croissant", "sabor", "cacahuete", "crema de", "palmera", "magdalena", "cacauet", "palomitas", "tartaleta", "hojaldre", "rosquilla", "trenza", "untar"]
  },
  {
    id: "cheese_sliced",
    group: "dairy",
    defaultSize: kg(0.25),
    names: { ca: "Formatge a llesques", es: "Queso en lonchas", en: "Sliced cheese" },
    synonyms: ["formatge", "queso", "cheese", "formatge de llesques"],
    include: ["queso en lonchas", "queso lonchas", "lonchas de queso", "queso + lonchas", "formatge a llesques", "formatge en llesques", "formatge + llesques"],
    exclude: ["rallado", "ratllat", "sandwich"]
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
    include: ["tomate triturado", "tomaquet triturat", "tomate + triturado", "tomaquet + triturat"],
    exclude: ["cebolla", "ceba"]
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
    exclude: ["natural", "triturado", "triturat", "frito", "fregit", "concentrado", "salsa", "seco", "ketchup", "zumo", "pelado", "gazpacho", "natural entero", "lata", "untar", "sec", "suc", "tamizado", "rallado", "ratllat", "deshidratado"]
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
    include: ["lechuga", "enciam", "cogollo", "corazones de lechuga", "corazon de lechuga", "corazones lechuga", "cors d enciam"],
    exclude: ["ensalada", "mezcla", "brotes", "amanida", "barreja"]
  },
  // Meat and fish
  {
    id: "chicken_breast",
    group: "meat_fish",
    defaultSize: kg(1),
    names: { ca: "Pit de pollastre", es: "Pechuga de pollo", en: "Chicken breast" },
    synonyms: ["pollastre", "pollo", "chicken", "pit pollastre"],
    include: ["pechuga de pollo", "pechugas de pollo", "filetes de pechuga de pollo", "filete de pechuga de pollo", "finisimo de pechuga de pollo", "pit de pollastre", "filets de pit de pollastre", "filet de pit de pollastre"],
    exclude: ["empanad", "cocida", "asada", "lonchas", "fiambre", "nuggets", "rellena", "arrebossat", "cuit", "llesques", "pavo", "gall dindi", "al natural", "tiras"]
  },
  {
    id: "minced_meat",
    group: "meat_fish",
    defaultSize: kg(0.5),
    names: { ca: "Carn picada", es: "Carne picada", en: "Minced meat" },
    synonyms: ["picada", "mince", "ground beef", "carne molida"],
    include: ["carne picada", "picada de vacuno", "picada vacuno", "burger meat", "carn picada", "preparado de carne picada", "preparado de carne de vacuno", "preparado de carne burger meat"]
  },
  {
    id: "ham_cooked",
    group: "meat_fish",
    defaultSize: kg(0.25),
    names: { ca: "Pernil dol\xE7", es: "Jam\xF3n cocido", en: "Cooked ham" },
    synonyms: ["pernil", "jamon york", "york", "ham"],
    include: ["jamon cocido", "finisimo de jamon cocido", "pernil dolc", "pernil cuit"],
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
    include: ["papel de cocina", "papel cocina", "rollo de cocina", "rollo papel cocina", "rollo de papel de cocina", "paper de cuina", "paper cuina"],
    exclude: ["portarrollos", "portarotllos", "aluminio", "alumini"]
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
    include: ["lavavajillas a mano", "lavavajillas mano", "lavavajillas$", "friegaplatos", "rentaplats a ma", "rentaplats"],
    exclude: ["maquina", "pastillas", "capsulas", "rentavaixelles", "pastilles", "abrillantador", "sal$", "todo en", "polvo", "limpiamaquinas", "ambientador"]
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

// packages/core/src/list.ts
var index = null;
function nameIndex() {
  index ??= CATEGORIES.flatMap(
    (c) => [c.names.ca, c.names.es, c.names.en, ...c.synonyms].map((s) => {
      const text = normalize(s);
      return { categoryId: c.id, text, words: tokens(s) };
    })
  );
  return index;
}
var STOP_WORDS = /* @__PURE__ */ new Set(["de", "del", "la", "el", "les", "los", "las", "a", "en", "per", "para", "of", "the", "d", "l"]);
function resolveItemText(text) {
  const query = normalize(text);
  if (!query) return null;
  const qWords = tokens(text).filter((w) => !STOP_WORDS.has(w));
  if (qWords.length === 0) return null;
  let best = null;
  for (const entry of nameIndex()) {
    let score = 0;
    if (entry.text === query) score = 1;
    else {
      const entryWords = entry.words.filter((w) => !STOP_WORDS.has(w));
      const matched = qWords.filter((q) => entryWords.some((w) => tokenMatches(q, w))).length;
      const covered = entryWords.filter((w) => qWords.some((q) => tokenMatches(q, w))).length;
      if (matched === qWords.length) {
        score = 0.6 + 0.3 * (covered / entryWords.length);
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { categoryId: entry.categoryId, score };
  }
  return best;
}

// packages/core/src/search.ts
var STOP = /* @__PURE__ */ new Set(["de", "del", "la", "el", "les", "los", "las", "a", "en", "con", "amb", "per", "para", "of", "the", "d", "l"]);
function wordScore(q, words) {
  let best = 0;
  for (const w of words) {
    if (w === q) return 1;
    if (q.length >= 3 && w.startsWith(q)) best = Math.max(best, 0.9);
    else if (tokenMatches(q, w)) best = Math.max(best, 0.7);
  }
  return best;
}
function searchProducts(query, products, limit = 50) {
  const qWords = tokens(query).filter((w) => !STOP.has(w));
  if (qWords.length === 0) return [];
  const resolved = resolveItemText(query);
  const categoryId = resolved && resolved.score >= 0.75 ? resolved.categoryId : null;
  const hits = [];
  for (const p of products) {
    const words = tokens(`${p.name} ${p.brand ?? ""}`);
    let text = 0;
    let allMatched = true;
    for (const q of qWords) {
      const s = wordScore(q, words);
      if (s === 0) {
        allMatched = false;
        break;
      }
      text += s;
    }
    let score = allMatched ? text / qWords.length * 0.95 : 0;
    if (categoryId && p.categoryId === categoryId) score = Math.max(score, 0.8);
    if (score > 0) {
      if (p.ean && normalize(query) === p.ean) score = 1;
      hits.push({ product: p, score });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  return hits.slice(0, limit);
}

// packages/core/src/freshness.ts
var DAY_MS = 24 * 60 * 60 * 1e3;
var STALE_AFTER_DAYS = 3;
var ONLINE_EXPIRES_AFTER_DAYS = 7;
var RECEIPT_EXPIRES_AFTER_DAYS = 14;
function ageInDays(observedAt, now) {
  return (now.getTime() - new Date(observedAt).getTime()) / DAY_MS;
}
function freshness(obs, now) {
  const age = ageInDays(obs.observedAt, now);
  const maxAge = obs.source === "receipt" ? RECEIPT_EXPIRES_AFTER_DAYS : ONLINE_EXPIRES_AFTER_DAYS;
  if (age > maxAge) return "expired";
  if (age > STALE_AFTER_DAYS) return "stale";
  return "fresh";
}
function isUsable(obs, now) {
  return freshness(obs, now) !== "expired";
}

// packages/core/src/geo.ts
function distanceKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// packages/core/src/compare.ts
function indexPrices(prices, now) {
  const idx = /* @__PURE__ */ new Map();
  for (const p of prices) {
    if (!isUsable(p, now)) continue;
    const key = p.storeId ? `${p.productId}|store:${p.storeId}` : `${p.productId}|zone:${p.zone}`;
    const prev = idx.get(key);
    if (!prev || p.observedAt > prev.observedAt) idx.set(key, p);
  }
  return idx;
}
function priceAt(idx, product, store) {
  return idx.get(`${product.id}|store:${store.id}`) ?? idx.get(`${product.id}|zone:${store.zone}`);
}
function fitsLevel(p, level) {
  if (level.kind === "any") return true;
  if (level.kind === "own") return p.isOwnBrand;
  const want = normalize(level.brand);
  if (!want) return true;
  return normalize(p.brand ?? "") === want || normalize(p.name).includes(want);
}
var MIN_SIZE_RATIO = 0.4;
var MAX_SIZE_RATIO = 3;
function lineFor(item, product, obs, now, matchType) {
  let cost;
  const unitPrice = obs.unitPrice ?? (product.size ? obs.price / product.size.amount : null);
  const category = item.categoryId ? CATEGORY_BY_ID[item.categoryId] : void 0;
  const def = category?.defaultSize;
  if (matchType === "category" && def) {
    const ratio = sizeRatio(product.size, def);
    const maxRatio = category?.maxPackRatio ?? MAX_SIZE_RATIO;
    if (ratio === null || ratio < MIN_SIZE_RATIO || ratio > maxRatio || unitPrice === null) return null;
    if (!plausibleUnitPrice(item.categoryId, unitPrice, product.size?.unit)) return null;
    cost = unitPrice * def.amount * item.quantity;
  } else {
    cost = obs.price * item.quantity;
  }
  return {
    itemId: item.id,
    product,
    price: obs.price,
    unitPrice: unitPrice === null ? null : round(unitPrice, 2),
    cost: round(cost),
    matchType,
    observedAt: obs.observedAt,
    source: obs.source,
    freshness: freshness(obs, now),
    promotion: obs.promotion
  };
}
function bestLine(item, store, chainProducts, byCategory, idx, now) {
  let best = null;
  const consider = (p, type) => {
    if (!fitsLevel(p, item.level)) return;
    const obs = priceAt(idx, p, store);
    if (!obs) return;
    const line = lineFor(item, p, obs, now, type);
    if (!line) return;
    if (!best || line.cost < best.cost || line.cost === best.cost && line.freshness === "fresh" && best.freshness !== "fresh") best = line;
  };
  if (item.categoryId) {
    for (const p of byCategory.get(item.categoryId) ?? []) consider(p, "category");
  } else {
    const hits = searchProducts(item.text, chainProducts, 10).filter((h) => h.score >= 0.75);
    const top = hits[0]?.score ?? 0;
    for (const h of hits) if (h.score >= top - 0.05) consider(h.product, "search");
  }
  return best;
}
function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function compareBasket(input) {
  const { items, products, now, origin } = input;
  const maxDistanceKm = input.maxDistanceKm ?? 3;
  const minSaving = input.minSavingForSplit ?? 3;
  const maxMissingShare = input.maxMissingShare ?? 0.2;
  const idx = indexPrices(input.prices, now);
  const nearest = /* @__PURE__ */ new Map();
  for (const store of input.stores) {
    if (input.chains && !input.chains.includes(store.chain)) continue;
    const d = distanceKm(origin, store);
    if (d > maxDistanceKm) continue;
    const prev = nearest.get(store.chain);
    if (!prev || d < prev.d) nearest.set(store.chain, { store, d });
  }
  const productsByChain = /* @__PURE__ */ new Map();
  for (const p of products) {
    const list = productsByChain.get(p.chain) ?? [];
    list.push(p);
    productsByChain.set(p.chain, list);
  }
  const noPrices = [];
  const raw = [...nearest.values()].flatMap(({ store, d }) => {
    const chainProducts = productsByChain.get(store.chain) ?? [];
    if (!chainProducts.some((p) => priceAt(idx, p, store))) {
      noPrices.push(store.chain);
      return [];
    }
    const byCategory = /* @__PURE__ */ new Map();
    for (const p of chainProducts) {
      if (!p.categoryId) continue;
      const list = byCategory.get(p.categoryId) ?? [];
      list.push(p);
      byCategory.set(p.categoryId, list);
    }
    const lines = /* @__PURE__ */ new Map();
    for (const item of items) {
      const line = bestLine(item, store, chainProducts, byCategory, idx, now);
      if (line) lines.set(item.id, line);
    }
    return [{ store, distanceKm: round(d, 2), lines }];
  });
  const unavailable = items.filter((i) => raw.every((r) => !r.lines.has(i.id))).map((i) => i.id);
  const available = items.filter((i) => !unavailable.includes(i.id));
  const medianCost = /* @__PURE__ */ new Map();
  for (const item of available) {
    medianCost.set(item.id, median(raw.flatMap((r) => r.lines.has(item.id) ? [r.lines.get(item.id).cost] : [])));
  }
  const baskets = raw.map(({ store, distanceKm: dist, lines }) => {
    const found = available.filter((i) => lines.has(i.id));
    const missing = available.filter((i) => !lines.has(i.id)).map((i) => i.id);
    const total = round(found.reduce((sum, i) => sum + lines.get(i.id).cost, 0));
    const penalty = missing.reduce((sum, id) => sum + (medianCost.get(id) ?? 0), 0);
    return {
      store,
      distanceKm: dist,
      lines: available.flatMap((i) => lines.has(i.id) ? [lines.get(i.id)] : []),
      missing,
      total,
      comparableTotal: round(total + penalty),
      found: found.length,
      requested: available.length,
      flagged: available.length > 0 && missing.length / available.length > maxMissingShare,
      staleCount: [...lines.values()].filter((l2) => l2.freshness === "stale").length,
      diffToNext: null
    };
  });
  baskets.sort(
    (a, b) => Number(a.flagged) - Number(b.flagged) || a.comparableTotal - b.comparableTotal || a.distanceKm - b.distanceKm
  );
  baskets.forEach((b, i) => {
    const next = baskets[i + 1];
    b.diffToNext = next ? round(next.comparableTotal - b.comparableTotal) : null;
  });
  return { ranking: baskets, split: bestSplit(baskets, available, medianCost, minSaving), unavailable, noPrices };
}
function bestSplit(baskets, items, medianCost, minSaving) {
  const best = baskets.find((b) => !b.flagged) ?? baskets[0];
  if (!best || baskets.length < 2) return null;
  let winner = null;
  for (let i = 0; i < baskets.length; i++) {
    for (let j = i + 1; j < baskets.length; j++) {
      const a = baskets[i];
      const b = baskets[j];
      const la = new Map(a.lines.map((l2) => [l2.itemId, l2]));
      const lb = new Map(b.lines.map((l2) => [l2.itemId, l2]));
      const atA = [];
      const atB = [];
      const missing = [];
      for (const item of items) {
        const x = la.get(item.id);
        const y = lb.get(item.id);
        if (x && (!y || x.cost <= y.cost)) atA.push(x);
        else if (y) atB.push(y);
        else missing.push(item.id);
      }
      if (atA.length === 0 || atB.length === 0) continue;
      const found = atA.length + atB.length;
      if (found < best.found) continue;
      const total = round([...atA, ...atB].reduce((s, l2) => s + l2.cost, 0));
      const comparableTotal = round(total + missing.reduce((s, id) => s + (medianCost.get(id) ?? 0), 0));
      const saving = round(best.comparableTotal - comparableTotal);
      if (!winner || saving > winner.saving) {
        winner = { stores: [a, b], lines: [atA, atB], total, comparableTotal, found, missing, saving, worthIt: false };
      }
    }
  }
  if (!winner || winner.saving <= 0) return null;
  winner.worthIt = winner.saving >= minSaving;
  return winner;
}

// packages/core/src/shareCard.ts
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

// packages/core/src/madridTime.ts
function madridOffsetByRule(at) {
  const year = at.getUTCFullYear();
  const lastSunday = (month) => {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1);
  };
  const t = at.getTime();
  return t >= lastSunday(2) && t < lastSunday(9) ? 120 : 60;
}
var formatter;
function offsetFromIntl(at) {
  if (formatter === void 0) {
    try {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Madrid",
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric"
      });
    } catch {
      formatter = null;
    }
  }
  if (!formatter) return null;
  try {
    const parts = {};
    for (const p of formatter.formatToParts(at)) if (p.type !== "literal") parts[p.type] = Number(p.value);
    const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute);
    const offset = Math.round((local - Math.floor(at.getTime() / 6e4) * 6e4) / 6e4);
    return offset === 60 || offset === 120 ? offset : null;
  } catch {
    return null;
  }
}
function madridOffsetMinutes(at) {
  return offsetFromIntl(at) ?? madridOffsetByRule(at);
}
function madridTime(at) {
  const local = new Date(at.getTime() + madridOffsetMinutes(at) * 6e4);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: (local.getUTCDay() + 6) % 7,
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes()
  };
}
function fromMadridTime(year, month, day, minutes) {
  const wall = Date.UTC(year, month - 1, day, 0, minutes);
  let t = wall - madridOffsetMinutes(new Date(wall)) * 6e4;
  t = wall - madridOffsetMinutes(new Date(t)) * 6e4;
  return new Date(t);
}

// packages/core/src/basketIndex.ts
var INDEX_BASKET = [
  // Dairy and eggs
  "milk",
  "eggs",
  "yogurt_plain",
  "cheese_sliced",
  // Bakery and pantry
  "bread_sliced",
  "rice",
  "pasta",
  "olive_oil_ev",
  "tomato_crushed",
  "tuna_canned",
  "chickpeas",
  "coffee_ground",
  // Fresh produce
  "tomatoes",
  "bananas",
  "apples",
  "potatoes",
  "onions",
  // Meat
  "chicken_breast",
  "ham_cooked",
  // Drinks
  "water"
];
var INDEX_TIME_MINUTES = 7 * 60;
function indexMoment(now) {
  const m = madridTime(now);
  const monday = fromMadridTime(m.year, m.month, m.day - m.weekday, INDEX_TIME_MINUTES);
  return monday <= now ? monday : fromMadridTime(m.year, m.month, m.day - m.weekday - 7, INDEX_TIME_MINUTES);
}
function previousIndexMoment(at) {
  const m = madridTime(at);
  return fromMadridTime(m.year, m.month, m.day - 7, m.minutes);
}
function busiestZones(prices) {
  const counts = /* @__PURE__ */ new Map();
  for (const p of prices) {
    if (p.storeId) continue;
    const zones = counts.get(p.chain) ?? /* @__PURE__ */ new Map();
    zones.set(p.zone, (zones.get(p.zone) ?? 0) + 1);
    counts.set(p.chain, zones);
  }
  const out = {};
  for (const [chain, zones] of counts) {
    out[chain] = [...zones].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }
  return out;
}
function basketIndexAt(input) {
  const basket = input.basket ?? INDEX_BASKET;
  const maxMissingShare = input.maxMissingShare ?? 0.2;
  const at = input.at.getTime();
  const oldest = at - ONLINE_EXPIRES_AFTER_DAYS * 864e5;
  const prices = input.prices.filter((p) => {
    const t = Date.parse(p.observedAt);
    return !p.storeId && t <= at && t >= oldest;
  });
  const zones = { ...busiestZones(prices), ...input.zones };
  const wanted = new Set(basket);
  const products = input.products.filter((p) => p.categoryId && wanted.has(p.categoryId));
  const chains = new Set(prices.map((p) => p.chain));
  const stores = [...chains].flatMap((chain) => {
    const zone = zones[chain];
    return zone ? [{ id: `index:${chain}`, chain, name: CHAINS[chain].name, zone, lat: 0, lng: 0 }] : [];
  });
  const items = basket.filter((id) => CATEGORY_BY_ID[id]).map((id) => ({ id, text: id, categoryId: id, level: { kind: "any" }, quantity: 1 }));
  const result = compareBasket({ items, stores, products, prices, origin: { lat: 0, lng: 0 }, now: input.at, maxDistanceKm: 1 });
  const rows = result.ranking.flatMap((b) => {
    if (b.found === 0) return [];
    const priced = new Set(b.lines.map((l2) => l2.itemId));
    const missing = basket.filter((id) => !priced.has(id));
    const lines = b.lines.map((l2) => ({
      itemId: l2.itemId,
      productId: l2.product.id,
      productName: l2.product.name,
      brand: l2.product.brand,
      isOwnBrand: l2.product.isOwnBrand,
      price: l2.price,
      cost: l2.cost,
      observedAt: l2.observedAt,
      promotion: l2.promotion
    }));
    return [{
      chain: b.store.chain,
      zone: b.store.zone,
      total: round(lines.reduce((sum, l2) => sum + l2.cost, 0)),
      found: lines.length,
      missing,
      ranked: missing.length / basket.length <= maxMissingShare,
      rank: null,
      lines
    }];
  });
  rows.sort((a, b) => Number(b.ranked) - Number(a.ranked) || (a.ranked ? a.total - b.total : b.found - a.found || a.total - b.total) || a.chain.localeCompare(b.chain));
  rows.filter((r) => r.ranked).forEach((r, i) => {
    r.rank = i + 1;
  });
  return { at: input.at.toISOString(), chains: rows };
}
function indexChanges(current, previous) {
  const out = {};
  for (const now of current.chains) {
    const before = previous.chains.find((c) => c.chain === now.chain);
    if (!now.ranked || !before?.ranked) continue;
    const old = new Map(before.lines.map((l2) => [l2.itemId, l2.cost]));
    const common = now.lines.filter((l2) => old.has(l2.itemId));
    const was = common.reduce((sum, l2) => sum + old.get(l2.itemId), 0);
    const is = common.reduce((sum, l2) => sum + l2.cost, 0);
    if (common.length === 0 || was <= 0) continue;
    out[now.chain] = { amount: round(is - was), percent: round((is - was) / was * 100, 1), items: common.length };
  }
  return out;
}
function weeklyBasketIndex(input) {
  const at = indexMoment(input.now);
  const zones = { ...busiestZones(input.prices), ...input.zones };
  const current = basketIndexAt({ ...input, zones, at });
  const before = basketIndexAt({ ...input, zones, at: previousIndexMoment(at) });
  const previous = before.chains.some((c) => c.ranked) ? before : null;
  const used = {};
  for (const c of [...current.chains, ...previous?.chains ?? []]) used[c.chain] = c.zone;
  return {
    basket: [...input.basket ?? INDEX_BASKET],
    zones: used,
    current,
    previous,
    changes: previous ? indexChanges(current, previous) : {},
    isSample: input.isSample ?? false
  };
}

// packages/core/src/sharedList.ts
var SHARED_LIST_LIMITS = {
  /** Request body, in bytes. */
  maxBodyBytes: 32 * 1024,
  maxItems: 300,
  /** Characters (code points), after trimming. */
  maxTextLength: 120,
  maxBrandLength: 60,
  maxItemIdLength: 40,
  minQuantity: 1,
  maxQuantity: 99,
  maxOpsPerRequest: 100,
  /** Lists nobody opened or edited for this long are deleted. */
  ttlDays: 180
};
var SHARED_LIST_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
var ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
var FORBIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/;
function isSharedListId(value) {
  return typeof value === "string" && SHARED_LIST_ID_PATTERN.test(value);
}
function isSharedItemId(value) {
  return typeof value === "string" && ITEM_ID_PATTERN.test(value);
}
function textLength(text) {
  return Array.from(text).length;
}
var fail = (error, index2) => index2 === void 0 ? { ok: false, error } : { ok: false, error, index: index2 };
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function unknownKey(value, allowed) {
  return Object.keys(value).find((k) => !allowed.includes(k));
}
function parseText(value, path, max, allowEmpty) {
  if (typeof value !== "string") return fail(`${path} must be a string`);
  if (FORBIDDEN_CHARS.test(value)) return fail(`${path} contains control characters`);
  const text = value.trim();
  if (!allowEmpty && !text) return fail(`${path} must not be empty`);
  if (textLength(text) > max) return fail(`${path} must be at most ${max} characters`);
  return { ok: true, value: text };
}
function parseLevel(value, path) {
  if (!isPlainObject(value)) return fail(`${path} must be an object`);
  if (value.kind === "own" || value.kind === "any") {
    if (unknownKey(value, ["kind"])) return fail(`${path} has an unknown field`);
    return { ok: true, value: { kind: value.kind } };
  }
  if (value.kind === "specific") {
    if (unknownKey(value, ["kind", "brand"])) return fail(`${path} has an unknown field`);
    const brand = parseText(value.brand, `${path}.brand`, SHARED_LIST_LIMITS.maxBrandLength, true);
    return brand.ok ? { ok: true, value: { kind: "specific", brand: brand.value } } : brand;
  }
  return fail(`${path}.kind must be "own", "any" or "specific"`);
}
var FIELD_NAMES = ["text", "categoryId", "level", "quantity", "checked"];
function parseField(name, value, path) {
  switch (name) {
    case "text":
      return parseText(value, path, SHARED_LIST_LIMITS.maxTextLength, false);
    case "categoryId":
      if (value === null) return { ok: true, value: null };
      return typeof value === "string" && Object.prototype.hasOwnProperty.call(CATEGORY_BY_ID, value) ? { ok: true, value } : fail(`${path} must be null or a known category`);
    case "level":
      return parseLevel(value, path);
    case "quantity":
      return Number.isInteger(value) && value >= SHARED_LIST_LIMITS.minQuantity && value <= SHARED_LIST_LIMITS.maxQuantity ? { ok: true, value } : fail(`${path} must be a whole number from ${SHARED_LIST_LIMITS.minQuantity} to ${SHARED_LIST_LIMITS.maxQuantity}`);
    case "checked":
      return typeof value === "boolean" ? { ok: true, value } : fail(`${path} must be true or false`);
  }
}
function parseSharedItem(value, path = "item") {
  if (!isPlainObject(value)) return fail(`${path} must be an object`);
  if (unknownKey(value, ["id", ...FIELD_NAMES])) return fail(`${path} has an unknown field`);
  if (!isSharedItemId(value.id)) return fail(`${path}.id is not a valid item id`);
  const item = { id: value.id };
  for (const name of FIELD_NAMES) {
    if (!(name in value)) return fail(`${path}.${name} is required`);
    const field = parseField(name, value[name], `${path}.${name}`);
    if (!field.ok) return field;
    item[name] = field.value;
  }
  return { ok: true, value: item };
}
function parseSharedPatch(value, path = "set") {
  if (!isPlainObject(value)) return fail(`${path} must be an object`);
  if (unknownKey(value, FIELD_NAMES)) return fail(`${path} has an unknown field`);
  const patch = {};
  for (const name of FIELD_NAMES) {
    if (!(name in value)) continue;
    const field = parseField(name, value[name], `${path}.${name}`);
    if (!field.ok) return field;
    patch[name] = field.value;
  }
  if (Object.keys(patch).length === 0) return fail(`${path} must change at least one field`);
  return { ok: true, value: patch };
}
function parseSharedOp(value, path = "op") {
  if (!isPlainObject(value)) return fail(`${path} must be an object`);
  if (value.op === "add") {
    if (unknownKey(value, ["op", "item"])) return fail(`${path} has an unknown field`);
    const item = parseSharedItem(value.item, `${path}.item`);
    return item.ok ? { ok: true, value: { op: "add", item: item.value } } : item;
  }
  if (value.op === "update") {
    if (unknownKey(value, ["op", "id", "set"])) return fail(`${path} has an unknown field`);
    if (!isSharedItemId(value.id)) return fail(`${path}.id is not a valid item id`);
    const set = parseSharedPatch(value.set, `${path}.set`);
    return set.ok ? { ok: true, value: { op: "update", id: value.id, set: set.value } } : set;
  }
  if (value.op === "remove") {
    if (unknownKey(value, ["op", "id"])) return fail(`${path} has an unknown field`);
    if (!isSharedItemId(value.id)) return fail(`${path}.id is not a valid item id`);
    return { ok: true, value: { op: "remove", id: value.id } };
  }
  return fail(`${path}.op must be "add", "update" or "remove"`);
}
function parseCreateBody(value) {
  if (!isPlainObject(value)) return fail("body must be an object");
  if (unknownKey(value, ["items"])) return fail("body has an unknown field");
  if (!Array.isArray(value.items)) return fail("items must be an array");
  if (value.items.length > SHARED_LIST_LIMITS.maxItems) return fail(`a list can have at most ${SHARED_LIST_LIMITS.maxItems} items`);
  const items = [];
  const ids = /* @__PURE__ */ new Set();
  for (const [index2, raw] of value.items.entries()) {
    const item = parseSharedItem(raw, `items[${index2}]`);
    if (!item.ok) return fail(item.error, index2);
    if (ids.has(item.value.id)) return fail(`items[${index2}].id is repeated`, index2);
    ids.add(item.value.id);
    items.push(item.value);
  }
  return { ok: true, value: { items } };
}
function parseOpsBody(value) {
  if (!isPlainObject(value)) return fail("body must be an object");
  if (unknownKey(value, ["ops"])) return fail("body has an unknown field");
  if (!Array.isArray(value.ops) || value.ops.length === 0) return fail("ops must be a non-empty array");
  if (value.ops.length > SHARED_LIST_LIMITS.maxOpsPerRequest) return fail(`at most ${SHARED_LIST_LIMITS.maxOpsPerRequest} operations per request`);
  const ops = [];
  for (const [index2, raw] of value.ops.entries()) {
    const op = parseSharedOp(raw, `ops[${index2}]`);
    if (!op.ok) return fail(op.error, index2);
    ops.push(op.value);
  }
  return { ok: true, value: { ops } };
}

// ingest/src/database.ts
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
var { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db2 = new DatabaseSync(path);
  db2.exec(`
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
    -- Shared lists (F10): no accounts or personal data; the random id is the only key.
    -- accessed_at drives expiry (180 days without being opened or edited).
    CREATE TABLE IF NOT EXISTS shared_lists (
      id TEXT PRIMARY KEY CHECK(length(id) = 22), version INTEGER NOT NULL CHECK(version >= 1),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, accessed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS shared_lists_accessed_idx ON shared_lists(accessed_at);
    CREATE TABLE IF NOT EXISTS shared_list_items (
      list_id TEXT NOT NULL REFERENCES shared_lists(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL CHECK(length(item_id) BETWEEN 1 AND 40),
      position INTEGER NOT NULL,
      text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 120),
      category_id TEXT,
      level_kind TEXT NOT NULL CHECK(level_kind IN ('own','any','specific')),
      brand TEXT CHECK(brand IS NULL OR length(brand) <= 60),
      quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
      checked INTEGER NOT NULL CHECK(checked IN (0,1)),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(list_id, item_id)
    ) WITHOUT ROWID;
    INSERT OR IGNORE INTO schema_migrations VALUES(3, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  `);
  const chain = db2.prepare("INSERT OR IGNORE INTO chains VALUES(?, ?)");
  for (const c of Object.values(CHAINS)) chain.run(c.id, c.name);
  const category = db2.prepare("INSERT INTO categories VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data");
  for (const c of CATEGORIES) category.run(c.id, JSON.stringify(c));
  return db2;
}
function catalog(db2, now = /* @__PURE__ */ new Date()) {
  const stores = db2.prepare("SELECT data FROM stores").all().map((r) => JSON.parse(r.data));
  const cutoff = new Date(now.getTime() - 7 * 864e5).toISOString();
  const prices = db2.prepare(`
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY product_id,zone ORDER BY observed_at DESC,id DESC) AS rank
      FROM price_observations WHERE observed_at >= ?
    ) WHERE rank=1
  `).all(cutoff).map((r) => ({
    productId: r.product_id,
    chain: r.chain,
    zone: r.zone,
    price: r.price,
    unitPrice: r.unit_price,
    promotion: r.promotion ?? void 0,
    observedAt: r.observed_at,
    source: r.source
  }));
  const ids = new Set(prices.map((p) => p.productId));
  const products = db2.prepare("SELECT data FROM products").all().map((r) => JSON.parse(r.data)).filter((p) => ids.has(p.id));
  return { stores, products, prices, isSample: false };
}
function history(db2, productId) {
  const zone = db2.prepare("SELECT zone FROM price_observations WHERE product_id=? ORDER BY observed_at DESC,zone LIMIT 1").get(productId)?.zone;
  if (!zone) return [];
  return db2.prepare(`SELECT price, observed_at AS observedAt FROM price_observations
    WHERE product_id=? AND zone=? AND observed_at >= ? ORDER BY observed_at`).all(productId, zone, new Date(Date.now() - 90 * 864e5).toISOString());
}
function mainMercadonaZone(db2) {
  const row = db2.prepare(`SELECT json_extract(data, '$.zone') AS zone, COUNT(*) AS n FROM stores
    WHERE json_extract(data, '$.chain') = 'mercadona' AND json_extract(data, '$.zone') IS NOT NULL
    GROUP BY zone ORDER BY n DESC, zone LIMIT 1`).get();
  return row?.zone ?? "bcn1";
}
function weeklyIndex(db2, now = /* @__PURE__ */ new Date()) {
  const at = indexMoment(now);
  const from = new Date(previousIndexMoment(at).getTime() - ONLINE_EXPIRES_AFTER_DAYS * 864e5).toISOString();
  const mercadona = mainMercadonaZone(db2);
  const basket = [...INDEX_BASKET];
  const products = db2.prepare(`SELECT data FROM products
    WHERE json_extract(data, '$.categoryId') IN (${basket.map(() => "?").join(",")})`).all(...basket).map((r) => JSON.parse(r.data));
  const ids = products.map((p) => p.id);
  const prices = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = db2.prepare(`SELECT * FROM price_observations
      WHERE product_id IN (${chunk.map(() => "?").join(",")}) AND observed_at >= ? AND observed_at <= ?
        AND (chain <> 'mercadona' OR zone = ?)`).all(...chunk, from, at.toISOString(), mercadona);
    for (const r of rows) {
      prices.push({
        productId: r.product_id,
        chain: r.chain,
        zone: r.zone,
        price: r.price,
        unitPrice: r.unit_price,
        promotion: r.promotion ?? void 0,
        observedAt: r.observed_at,
        source: r.source
      });
    }
  }
  return weeklyBasketIndex({ products, prices, now, zones: { mercadona } });
}

// ingest/src/rateLimit.ts
import { isIP } from "node:net";
var RateLimiter = class {
  constructor(capacity, perSecond, maxKeys = 5e4) {
    this.capacity = capacity;
    this.perSecond = perSecond;
    this.maxKeys = maxKeys;
  }
  buckets = /* @__PURE__ */ new Map();
  /** Takes `cost` tokens; returns 0 when allowed, otherwise seconds until it would be. */
  take(key, cost = 1, now = Date.now()) {
    if (cost > this.capacity) return Math.ceil((cost - this.capacity) / this.perSecond) || 1;
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    const tokens2 = Math.min(this.capacity, bucket.tokens + (now - bucket.at) / 1e3 * this.perSecond);
    if (tokens2 < cost) {
      this.buckets.set(key, { tokens: tokens2, at: now });
      return Math.max(1, Math.ceil((cost - tokens2) / this.perSecond));
    }
    if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) this.prune(now);
    this.buckets.set(key, { tokens: tokens2 - cost, at: now });
    return 0;
  }
  /** Puts back tokens taken for a request that was then refused for another reason. */
  refund(key, cost = 1) {
    const bucket = this.buckets.get(key);
    if (bucket) bucket.tokens = Math.min(this.capacity, bucket.tokens + cost);
  }
  /** Drops buckets that have refilled completely (they behave like new ones). */
  prune(now = Date.now()) {
    const fullAfterMs = this.capacity / this.perSecond * 1e3;
    for (const [key, bucket] of this.buckets) if (now - bucket.at >= fullAfterMs) this.buckets.delete(key);
    if (this.buckets.size >= this.maxKeys) {
      const keys = [...this.buckets.keys()];
      for (const key of keys.slice(0, Math.ceil(keys.length / 2))) this.buckets.delete(key);
    }
  }
  get size() {
    return this.buckets.size;
  }
};
function isLoopback(address) {
  return address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
}
function addressKey(address) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1];
  if (isIP(address) !== 6) return address;
  const [head = "", tail = ""] = address.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = address.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
function clientKey(req) {
  const peer = req.socket.remoteAddress ?? "unknown";
  if (isLoopback(peer)) {
    const header = req.headers["x-real-ip"];
    const real = typeof header === "string" ? header.trim() : "";
    if (real && isIP(real)) return addressKey(real);
  }
  return addressKey(peer);
}

// ingest/src/sharedLists.ts
import { randomBytes } from "node:crypto";
var DAY_MS2 = 864e5;
var TOUCH_INTERVAL_MS = DAY_MS2;
var ListFullError = class extends Error {
  constructor() {
    super("list_full");
  }
};
function newSharedListId() {
  return randomBytes(16).toString("base64url");
}
function expiryCutoff(now) {
  return new Date(now.getTime() - SHARED_LIST_LIMITS.ttlDays * DAY_MS2).toISOString();
}
function rowToItem(r) {
  const level = r.level_kind === "specific" ? { kind: "specific", brand: r.brand ?? "" } : { kind: r.level_kind };
  return {
    id: r.item_id,
    text: r.text,
    categoryId: r.category_id ?? null,
    level,
    quantity: Number(r.quantity),
    checked: Number(r.checked) === 1
  };
}
function readItems(db2, listId) {
  return db2.prepare("SELECT * FROM shared_list_items WHERE list_id=? ORDER BY position, item_id").all(listId).map(rowToItem);
}
function insertItem(db2, listId, item, position, at) {
  db2.prepare(`INSERT INTO shared_list_items
    (list_id,item_id,position,text,category_id,level_kind,brand,quantity,checked,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
    listId,
    item.id,
    position,
    item.text,
    item.categoryId,
    item.level.kind,
    item.level.kind === "specific" ? item.level.brand : null,
    item.quantity,
    item.checked ? 1 : 0,
    at
  );
}
function transaction(db2, fn) {
  db2.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db2.exec("COMMIT");
    return result;
  } catch (err) {
    db2.exec("ROLLBACK");
    throw err;
  }
}
function countSharedLists(db2) {
  return Number(db2.prepare("SELECT COUNT(*) AS n FROM shared_lists").get()?.n ?? 0);
}
function createSharedList(db2, items, now = /* @__PURE__ */ new Date()) {
  if (items.length > SHARED_LIST_LIMITS.maxItems) throw new ListFullError();
  const at = now.toISOString();
  const id = newSharedListId();
  transaction(db2, () => {
    db2.prepare("INSERT INTO shared_lists (id,version,created_at,updated_at,accessed_at) VALUES(?,1,?,?,?)").run(id, at, at, at);
    items.forEach((item, i) => insertItem(db2, id, item, i + 1, at));
  });
  return { id, version: 1, updatedAt: at, items: readItems(db2, id) };
}
function listRow(db2, id, now) {
  const row = db2.prepare("SELECT version, updated_at, accessed_at FROM shared_lists WHERE id=?").get(id);
  if (!row) return null;
  if (row.accessed_at < expiryCutoff(now)) return null;
  return { version: Number(row.version), updatedAt: row.updated_at, accessedAt: row.accessed_at };
}
function getSharedList(db2, id, now = /* @__PURE__ */ new Date(), since) {
  const row = listRow(db2, id, now);
  if (!row) return null;
  if (Date.parse(row.accessedAt) < now.getTime() - TOUCH_INTERVAL_MS) {
    try {
      db2.prepare("UPDATE shared_lists SET accessed_at=? WHERE id=?").run(now.toISOString(), id);
    } catch {
    }
  }
  if (since === row.version) return { id, version: row.version, updatedAt: row.updatedAt, unchanged: true };
  return { id, version: row.version, updatedAt: row.updatedAt, items: readItems(db2, id) };
}
var COLUMNS = {
  text: (p) => [["text", p.text]],
  categoryId: (p) => [["category_id", p.categoryId]],
  level: (p) => [["level_kind", p.level.kind], ["brand", p.level.kind === "specific" ? p.level.brand : null]],
  quantity: (p) => [["quantity", p.quantity]],
  checked: (p) => [["checked", p.checked ? 1 : 0]]
};
function applySharedListOps(db2, id, ops, now = /* @__PURE__ */ new Date()) {
  const at = now.toISOString();
  return transaction(db2, () => {
    const row = listRow(db2, id, now);
    if (!row) return null;
    const rejected = [];
    let changed = false;
    let count = Number(db2.prepare("SELECT COUNT(*) AS n FROM shared_list_items WHERE list_id=?").get(id)?.n ?? 0);
    let position = Number(db2.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM shared_list_items WHERE list_id=?").get(id)?.p ?? 0);
    const exists = db2.prepare("SELECT 1 AS x FROM shared_list_items WHERE list_id=? AND item_id=?");
    ops.forEach((op, index2) => {
      if (op.op === "add") {
        if (exists.get(id, op.item.id)) return;
        if (count >= SHARED_LIST_LIMITS.maxItems) {
          rejected.push({ index: index2, error: "list_full" });
          return;
        }
        position += 1;
        count += 1;
        insertItem(db2, id, op.item, position, at);
        changed = true;
      } else if (op.op === "update") {
        const pairs = Object.keys(op.set).filter((k) => Object.prototype.hasOwnProperty.call(COLUMNS, k)).flatMap((k) => COLUMNS[k](op.set));
        if (!pairs.length) return;
        const result = db2.prepare(`UPDATE shared_list_items SET ${pairs.map(([c]) => `${c}=?`).join(",")}, updated_at=?
          WHERE list_id=? AND item_id=?`).run(...pairs.map(([, v]) => v), at, id, op.id);
        if (Number(result.changes) > 0) changed = true;
      } else {
        const result = db2.prepare("DELETE FROM shared_list_items WHERE list_id=? AND item_id=?").run(id, op.id);
        if (Number(result.changes) > 0) {
          changed = true;
          count -= 1;
        }
      }
    });
    const version = changed ? row.version + 1 : row.version;
    const updatedAt = changed ? at : row.updatedAt;
    db2.prepare("UPDATE shared_lists SET version=?, updated_at=?, accessed_at=? WHERE id=?").run(version, updatedAt, at, id);
    return { id, version, updatedAt, items: readItems(db2, id), rejected };
  });
}
function deleteExpiredSharedLists(db2, now = /* @__PURE__ */ new Date()) {
  return Number(db2.prepare("DELETE FROM shared_lists WHERE accessed_at < ?").run(expiryCutoff(now)).changes);
}

// ingest/src/api.ts
var DEFAULT_WRITE_LIMITS = {
  maxLists: 2e4,
  createBurst: 10,
  createPerHour: 20,
  globalCreateBurst: 100,
  globalCreatePerHour: 600,
  opsBurst: 600,
  opsPerMinute: 300,
  globalOpsBurst: 3e3,
  globalOpsPerMinute: 3e3
};
var HttpError = class extends Error {
  constructor(status, code, detail, extra = {}, headers = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.extra = extra;
    this.headers = headers;
  }
};
function send(res, status, data, headers = {}) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}
function isBusy(err) {
  const e = err;
  return e?.errcode === 5 || e?.errcode === 6 || /database is locked|SQLITE_BUSY/i.test(e?.message ?? "");
}
var JSON_TYPE = /^application\/json\s*(?:;\s*charset\s*=\s*"?utf-8"?\s*)?$/i;
async function readJson(req, maxBytes) {
  if (!JSON_TYPE.test(req.headers["content-type"] ?? "")) throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json");
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > maxBytes) {
    req.resume();
    throw new HttpError(413, "body_too_large", `at most ${maxBytes} bytes`);
  }
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  await new Promise((resolve, reject) => {
    let ended = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on("end", () => {
      ended = true;
      resolve();
    });
    req.on("error", reject);
    req.on("close", () => {
      if (!ended) reject(new HttpError(400, "incomplete_body"));
    });
  });
  if (tooLarge) throw new HttpError(413, "body_too_large", `at most ${maxBytes} bytes`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new HttpError(400, "invalid_json", "body is not valid UTF-8");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "body is not valid JSON");
  }
}
function valid(parsed) {
  if (parsed.ok) return parsed.value;
  throw new HttpError(400, "invalid_request", parsed.error, parsed.index === void 0 ? {} : { index: parsed.index });
}
function createApiHandler(db2, options = {}) {
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const limits = { ...DEFAULT_WRITE_LIMITS, ...options.limits };
  const createLimiter = new RateLimiter(limits.createBurst, limits.createPerHour / 3600);
  const globalCreateLimiter = new RateLimiter(limits.globalCreateBurst, limits.globalCreatePerHour / 3600);
  const opsLimiter = new RateLimiter(limits.opsBurst, limits.opsPerMinute / 60);
  const globalOpsLimiter = new RateLimiter(limits.globalOpsBurst, limits.globalOpsPerMinute / 60);
  const limit = (client, global, key, cost) => {
    const wait = client.take(key, cost);
    if (wait) throw new HttpError(429, "rate_limited", "too many changes; try again later", {}, { "retry-after": String(wait) });
    const globalWait = global.take("*", cost);
    if (globalWait) {
      client.refund(key, cost);
      throw new HttpError(429, "rate_limited", "too many changes; try again later", {}, { "retry-after": String(globalWait) });
    }
  };
  const applyOps = (key, listId, ops) => {
    if (ops.length > 1) limit(opsLimiter, globalOpsLimiter, key, ops.length - 1);
    const result = applySharedListOps(db2, listId, ops, now());
    if (!result) throw new HttpError(404, "not_found");
    return result;
  };
  async function lists(req, res, url) {
    const parts = url.pathname.split("/").slice(3);
    const [listId, sub, itemId, ...rest] = parts;
    const method = req.method ?? "GET";
    const allow = (methods) => {
      if (!methods.split(", ").includes(method)) throw new HttpError(405, "method_not_allowed", void 0, {}, { allow: methods });
    };
    const key = clientKey(req);
    if (listId === void 0) {
      allow("POST");
      limit(createLimiter, globalCreateLimiter, key, 1);
      limit(opsLimiter, globalOpsLimiter, key, 1);
      const body = valid(parseCreateBody(await readJson(req, SHARED_LIST_LIMITS.maxBodyBytes)));
      if (body.items.length > 1) limit(opsLimiter, globalOpsLimiter, key, body.items.length - 1);
      if (countSharedLists(db2) >= limits.maxLists) throw new HttpError(503, "capacity", "no room for new shared lists right now", {}, { "retry-after": "3600" });
      const created = createSharedList(db2, body.items, now());
      send(res, 201, created, { location: `/api/lists/${created.id}` });
      return;
    }
    if (!isSharedListId(listId) || rest.length) throw new HttpError(404, "not_found");
    if (sub === void 0) {
      allow("GET");
      const sinceParam = url.searchParams.get("since");
      if (sinceParam !== null && !/^\d{1,15}$/.test(sinceParam)) throw new HttpError(400, "invalid_request", "since must be a version number");
      const list = getSharedList(db2, listId, now(), sinceParam === null ? void 0 : Number(sinceParam));
      if (!list) throw new HttpError(404, "not_found");
      send(res, 200, list);
      return;
    }
    if (sub === "ops" && itemId === void 0) {
      allow("POST");
      limit(opsLimiter, globalOpsLimiter, key, 1);
      const { ops } = valid(parseOpsBody(await readJson(req, SHARED_LIST_LIMITS.maxBodyBytes)));
      send(res, 200, applyOps(key, listId, ops));
      return;
    }
    if (sub === "items" && itemId === void 0) {
      allow("POST");
      limit(opsLimiter, globalOpsLimiter, key, 1);
      const item = valid(parseSharedItem(await readJson(req, SHARED_LIST_LIMITS.maxBodyBytes)));
      const result = applyOps(key, listId, [{ op: "add", item }]);
      if (result.rejected.length) throw new HttpError(409, "list_full", `a list can have at most ${SHARED_LIST_LIMITS.maxItems} items`);
      send(res, 200, result);
      return;
    }
    if (sub === "items" && isSharedItemId(itemId)) {
      allow("PATCH, DELETE");
      limit(opsLimiter, globalOpsLimiter, key, 1);
      const op = method === "PATCH" ? { op: "update", id: itemId, set: valid(parseSharedPatch(await readJson(req, SHARED_LIST_LIMITS.maxBodyBytes))) } : { op: "remove", id: itemId };
      send(res, 200, applyOps(key, listId, [op]));
      return;
    }
    throw new HttpError(404, "not_found");
  }
  let indexCache = null;
  const cachedWeeklyIndex = () => {
    const at = now();
    const moment = indexMoment(at).getTime();
    if (!indexCache || indexCache.moment !== moment || at.getTime() > indexCache.until) {
      indexCache = { moment, until: at.getTime() + 10 * 6e4, data: weeklyIndex(db2, at) };
    }
    return indexCache.data;
  };
  const handler2 = ((req, res) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("cache-control", "no-store");
    let url;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      res.writeHead(400);
      res.end('{"error":"Bad request"}');
      return;
    }
    if (url.pathname === "/api/lists" || url.pathname.startsWith("/api/lists/")) {
      res.setHeader("x-robots-tag", "noindex, nofollow");
      lists(req, res, url).catch((err) => {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        if (err instanceof HttpError) {
          send(res, err.status, { error: err.code, ...err.detail ? { detail: err.detail } : {}, ...err.extra }, err.headers);
        } else if (isBusy(err)) {
          send(res, 503, { error: "busy" }, { "retry-after": "5" });
        } else {
          console.error(`Shared list request failed (${req.method}):`, err instanceof Error ? err.message : "unknown error");
          send(res, 500, { error: "server_error" });
        }
      });
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end('{"error":"Method not allowed"}');
      return;
    }
    try {
      let data;
      if (url.pathname === "/api/health") {
        const counts = db2.prepare(`SELECT COUNT(*) AS observations,MAX(observed_at) AS lastImport FROM price_observations`).get();
        data = { status: "ok", database: "sqlite", release: options.release ?? "local", ...counts };
      } else if (url.pathname === "/api/catalog") data = catalog(db2);
      else if (url.pathname === "/api/index") data = cachedWeeklyIndex();
      else if (url.pathname.startsWith("/api/history/")) data = history(db2, decodeURIComponent(url.pathname.slice("/api/history/".length)));
      else {
        res.writeHead(404);
        res.end('{"error":"Not found"}');
        return;
      }
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error("API request failed", err);
      res.writeHead(500);
      res.end('{"error":"Database request failed"}');
    }
  });
  handler2.maintenance = () => {
    const expiredLists = deleteExpiredSharedLists(db2, now());
    for (const limiter of [createLimiter, globalCreateLimiter, opsLimiter, globalOpsLimiter]) limiter.prune();
    return { expiredLists };
  };
  return handler2;
}

// ingest/src/server.ts
if (!process.env.DATABASE_PATH) throw new Error("DATABASE_PATH is required");
var db = openDatabase(process.env.DATABASE_PATH);
db.exec("PRAGMA busy_timeout=1500");
var handler = createApiHandler(db, { release: process.env.RELEASE_SHA ?? "local" });
var maintenance = () => {
  try {
    const { expiredLists } = handler.maintenance();
    if (expiredLists) console.log(`Deleted ${expiredLists} shared lists unused for 180 days`);
  } catch (err) {
    console.error("Shared-list cleanup failed:", err instanceof Error ? err.message : "unknown error");
  }
};
maintenance();
var timer = setInterval(maintenance, 6 * 36e5);
timer.unref();
var server = createServer(handler);
server.listen(Number(process.env.PORT ?? 3007), "127.0.0.1");
process.on("SIGTERM", () => server.close(() => {
  clearInterval(timer);
  db.close();
  process.exit(0);
}));
