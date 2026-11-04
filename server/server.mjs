// ingest/src/server.ts
import { createServer } from "node:http";

// ingest/src/database.ts
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// packages/core/src/units.ts
var NUM = String.raw`(\d+(?:[.,]\d+)?)`;
var UNIT = String.raw`([a-z]+)`;
var MULTI = new RegExp(String.raw`(\d+)\s*(?:[a-z]+\s*)?[x×]\s*` + NUM + String.raw`\s*` + UNIT + String.raw`\b`, "gi");
var SINGLE = new RegExp(NUM + String.raw`\s*` + UNIT + String.raw`\b`, "gi");

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

// packages/core/src/freshness.ts
var DAY_MS = 24 * 60 * 60 * 1e3;

// ingest/src/database.ts
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

// ingest/src/server.ts
if (!process.env.DATABASE_PATH) throw new Error("DATABASE_PATH is required");
var db = openDatabase(process.env.DATABASE_PATH);
var server = createServer((req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end('{"error":"Method not allowed"}');
    return;
  }
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let data;
    if (url.pathname === "/api/health") {
      const counts = db.prepare(`SELECT COUNT(*) AS observations,MAX(observed_at) AS lastImport FROM price_observations`).get();
      data = { status: "ok", database: "sqlite", release: process.env.RELEASE_SHA ?? "local", ...counts };
    } else if (url.pathname === "/api/catalog") data = catalog(db);
    else if (url.pathname.startsWith("/api/history/")) data = history(db, decodeURIComponent(url.pathname.slice("/api/history/".length)));
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
server.listen(Number(process.env.PORT ?? 3007), "127.0.0.1");
process.on("SIGTERM", () => server.close(() => {
  db.close();
  process.exit(0);
}));
