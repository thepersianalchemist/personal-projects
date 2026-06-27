/**
 * Normalizes the scraped raw supply (data/raw/*.json) into loadable marketplace
 * data. Reads every regional batch, dedupes, fills gaps deterministically, and
 * writes:
 *   - data/inventory.json       flat per-vehicle listings (browser shape for app.html)
 *   - data/scraped-supply.json  houses grouped (DB seed + human review)
 *
 * Every record keeps its source `url`, `verified` flag (false where the egress
 * proxy blocked homepage fetch), and per-rate `rateSource` ("scraped" | "estimated").
 *
 * Run: npm run normalize  (node scripts/normalize-supply.mjs)
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawDir = join(root, "data", "raw");

// deterministic string hash -> [0,1) so builds are reproducible (no Math.random)
function rand(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
const pick = (seed, arr) => arr[Math.floor(rand(seed) * arr.length)];
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'");
const slugify = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const MARKET_NAME = {
  LAX: "Los Angeles", SAN: "San Diego", SFO: "San Francisco", LAS: "Las Vegas", PHX: "Phoenix / Scottsdale",
  DEN: "Denver", HOU: "Houston", DFW: "Dallas", AUS: "Austin", SAT: "San Antonio", MIA: "Miami",
  MCO: "Orlando", ATL: "Atlanta", BNA: "Nashville", NYC: "New York City", BOS: "Boston", DCA: "Washington DC",
  PHL: "Philadelphia", CHI: "Chicago", CLT: "Charlotte", SEA: "Seattle", DTW: "Detroit",
};
// market demand multiplier applied to estimated rates
const MARKET_MULT = { LAX: 1.15, NYC: 1.2, MIA: 1.12, LAS: 1.1, SFO: 1.1, MCO: 1.05, ATL: 1.0, BNA: 1.0, SAN: 1.05 };

// category baseline daily rate (USD) when a scraped rate is missing
const CAT_BASE = { HYPERCAR: 9000, SUPERCAR: 1200, CONVERTIBLE: 1300, GRAND_TOURER: 950, LUXURY_SUV: 900, LUXURY_SEDAN: 800, CLASSIC: 700, ELECTRIC: 650 };
const CAT_DEPOSIT = { HYPERCAR: 50000, SUPERCAR: 7500, CONVERTIBLE: 7500, GRAND_TOURER: 5000, LUXURY_SUV: 5000, LUXURY_SEDAN: 3500, CLASSIC: 5000, ELECTRIC: 2500 };

// representative specs per model keyword; fallback by category
const MODEL_SPECS = [
  [/chiron/i, { hp: 1479, zeroSixty: 2.4, seats: 2 }],
  [/aventador|svj/i, { hp: 769, zeroSixty: 2.8, seats: 2 }],
  [/huracan|gallardo/i, { hp: 631, zeroSixty: 3.1, seats: 2 }],
  [/urus/i, { hp: 657, zeroSixty: 3.3, seats: 5 }],
  [/sf90/i, { hp: 986, zeroSixty: 2.5, seats: 2 }],
  [/f8|488|458|812|roma|portofino|california|f12/i, { hp: 710, zeroSixty: 2.9, seats: 2 }],
  [/720s|765|570|artura|12c/i, { hp: 710, zeroSixty: 2.8, seats: 2 }],
  [/cullinan|bentayga|spectre/i, { hp: 563, zeroSixty: 4.9, seats: 5 }],
  [/ghost|phantom|wraith|dawn|flying spur/i, { hp: 563, zeroSixty: 4.4, seats: 4 }],
  [/continental|bentley/i, { hp: 626, zeroSixty: 3.5, seats: 4 }],
  [/g63|g-wagon|g-wag|g 63/i, { hp: 577, zeroSixty: 4.5, seats: 5 }],
  [/911|carrera|turbo/i, { hp: 640, zeroSixty: 2.7, seats: 4 }],
  [/r8/i, { hp: 602, zeroSixty: 3.2, seats: 2 }],
  [/corvette|c8/i, { hp: 495, zeroSixty: 2.9, seats: 2 }],
  [/db11|vantage|aston/i, { hp: 528, zeroSixty: 3.6, seats: 2 }],
  [/model s|taycan|tesla|electric/i, { hp: 750, zeroSixty: 2.6, seats: 4 }],
];
const CAT_SPEC = { HYPERCAR: { hp: 1100, zeroSixty: 2.5, seats: 2 }, SUPERCAR: { hp: 650, zeroSixty: 3.0, seats: 2 }, CONVERTIBLE: { hp: 620, zeroSixty: 3.2, seats: 2 }, GRAND_TOURER: { hp: 560, zeroSixty: 3.6, seats: 4 }, LUXURY_SUV: { hp: 560, zeroSixty: 4.5, seats: 5 }, LUXURY_SEDAN: { hp: 500, zeroSixty: 4.4, seats: 5 }, CLASSIC: { hp: 300, zeroSixty: 7.0, seats: 4 }, ELECTRIC: { hp: 700, zeroSixty: 3.0, seats: 4 } };
const specFor = (model, cat) => (MODEL_SPECS.find(([re]) => re.test(model)) || [null, CAT_SPEC[cat]])[1];

// representative photos by make (won't load in this sandbox; fine in the real app)
const MAKE_IMG = {
  Lamborghini: "https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=1200",
  Ferrari: "https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=1200",
  McLaren: "https://images.unsplash.com/photo-1621135802920-133df287f89c?w=1200",
  "Rolls-Royce": "https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=1200",
  Bentley: "https://images.unsplash.com/photo-1622194993799-bd6f3a52ddc1?w=1200",
  Bugatti: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=1200",
  Porsche: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=1200",
  "Aston Martin": "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=1200",
  default: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200",
};

// --- load + merge ----------------------------------------------------------
const files = readdirSync(rawDir).filter((f) => f.endsWith(".json"));
const rawHouses = files.flatMap((f) => JSON.parse(readFileSync(join(rawDir, f), "utf8")));

// dedupe by slug+market (same chain in two cities stays as two market locations)
const seen = new Map();
for (const h of rawHouses) {
  const name = decode(h.house);
  const key = slugify(name) + "@" + h.market;
  if (!seen.has(key)) seen.set(key, { ...h, house: name });
}
const houses = [...seen.values()];

const inventory = [];
const supply = [];
let vehSeq = 0, scrapedRates = 0, estimatedRates = 0, deals = 0;
const marketsUsed = new Set();

const allMarkets = [...new Set(houses.map((h) => h.market))];

for (const h of houses) {
  marketsUsed.add(h.market);
  const hslug = slugify(h.house) + "-" + h.market.toLowerCase();
  // deterministic tier / quality
  const elite = rand("tier" + hslug) < 0.4;
  const rating = +(4.2 + rand("rate" + hslug) * 0.75).toFixed(2);
  const ratingCount = 20 + Math.floor(rand("rc" + hslug) * 280);
  const insuranceTier = elite ? "PREMIUM" : pick("ins" + hslug, ["COMMERCIAL", "COMMERCIAL", "PREMIUM"]);
  const houseMultiplier = +(0.95 + rand("mult" + hslug) * 0.15).toFixed(3);
  const instantBook = elite && rand("ib" + hslug) < 0.7;
  const mm = MARKET_MULT[h.market] ?? 1.0;

  const houseVehicles = [];
  for (const v of h.vehicles) {
    vehSeq++;
    const cat = v.category;
    const base = v.dailyRate != null
      ? (scrapedRates++, v.dailyRate)
      : (estimatedRates++, Math.round((CAT_BASE[cat] ?? 1000) * mm / 50) * 50);
    const rateSource = v.dailyRate != null ? "scraped" : "estimated";
    const spec = specFor(v.model, cat);
    const id = `${h.market.toLowerCase()}-${vehSeq}`;
    // ~12% of vehicles are one-way delivery deals to a nearby market
    const isDeal = rand("deal" + id) < 0.12;
    const dropoff = isDeal ? pick("drop" + id, allMarkets.filter((m) => m !== h.market)) : null;
    const year = 2021 + Math.floor(rand("yr" + id) * 4);

    const item = {
      id, make: v.make, model: v.model, trim: "", year, category: cat,
      market: h.market, marketName: MARKET_NAME[h.market] ?? h.market, city: h.city,
      house: h.house, houseUrl: h.url, houseSlug: hslug,
      elite, verified: !!h.verified, instantBook, rating, ratingCount,
      base, rateSource, deposit: CAT_DEPOSIT[cat] ?? 5000,
      deliveryFee: cat === "HYPERCAR" ? 0 : pick("df" + id, [0, 150, 200, 250]),
      includedMiles: cat === "HYPERCAR" ? 50 : 100, minDays: 1, minAge: cat === "HYPERCAR" ? 30 : 25,
      hp: spec.hp, zeroSixty: spec.zeroSixty, seats: spec.seats,
      houseMultiplier, serviceFeePct: 0.15,
      deliveryDeal: isDeal, deliveryDiscountPct: isDeal ? 0.25 : 0, dropoff,
      image: MAKE_IMG[v.make] ?? MAKE_IMG.default,
      rules: [{ id: "w", type: "DAY_OF_WEEK", priority: 1, active: true, adjustment: 1.1 }].concat(
        elite ? [{ id: "wk", type: "LENGTH_OF_RENTAL", priority: 1, active: true, adjustment: 0.9, minDays: 7 }] : []
      ),
    };
    if (isDeal) deals++;
    inventory.push(item);
    houseVehicles.push({ make: v.make, model: v.model, category: cat, dailyRate: base, rateSource });
  }

  supply.push({
    slug: hslug, name: h.house, url: h.url, city: h.city, market: h.market,
    marketName: MARKET_NAME[h.market] ?? h.market, tier: elite ? "ELITE" : "STANDARD",
    verified: !!h.verified, rating, ratingCount, insuranceTier, instantBook,
    priceMultiplier: houseMultiplier, serviceFeePct: 0.15, vehicles: houseVehicles,
  });
}

// rank: elite first, then rating — same as the marketplace
inventory.sort((a, b) => Number(b.elite) - Number(a.elite) || b.rating - a.rating);

const meta = {
  generatedFrom: files, sourcedVia: "live web search (WebSearch); homepage WebFetch blocked by egress policy",
  houses: supply.length, vehicles: inventory.length, markets: marketsUsed.size,
  rates: { scraped: scrapedRates, estimated: estimatedRates }, deliveryDeals: deals,
  verifiedHouses: supply.filter((s) => s.verified).length,
};

writeFileSync(join(root, "data", "inventory.json"), JSON.stringify(inventory));
writeFileSync(join(root, "data", "scraped-supply.json"), JSON.stringify({ meta, markets: [...marketsUsed].map((m) => ({ code: m, name: MARKET_NAME[m] ?? m })), houses: supply }, null, 2));
console.log("Normalized:", JSON.stringify(meta, null, 2));
