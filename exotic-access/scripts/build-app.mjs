/**
 * Builds a self-contained, interactive, no-server preview of the ExoticAccess
 * marketplace into `app.html`. The pricing math is the REAL engine: lib/pricing.ts
 * is bundled to browser JS with esbuild, so the preview can never drift from the
 * app. Open the resulting app.html in any browser — browse, filter, pick dates,
 * watch the quote recompute, and "book" for a confirmation. No DB, no install.
 *
 * Run:  npm run build:app   (or: node scripts/build-app.mjs)
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// 1) Bundle the real pricing engine for the browser, then strip the ESM export
//    footer so the functions remain as plain in-scope declarations.
const result = await build({
  entryPoints: [join(root, "lib/pricing.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const engine = result.outputFiles[0].text.replace(/export\s*\{[^}]*\}\s*;?/g, "");

// 2) Inventory — prefer the scraped/normalized supply (data/inventory.json);
//    fall back to the small inline seed if it hasn't been generated yet.
let INVENTORY;
try {
  INVENTORY = JSON.parse(readFileSync(join(root, "data", "inventory.json"), "utf8"));
  console.log("Loaded scraped inventory: " + INVENTORY.length + " vehicles");
} catch {
  INVENTORY = INLINE_SEED;
  console.log("Using inline seed (run normalize-supply first for full supply)");
}

const INLINE_SEED = [
  { id: "huracan", make: "Lamborghini", model: "Huracán", trim: "EVO Spyder", year: 2023, category: "CONVERTIBLE", market: "MIA", marketName: "Miami", house: "Velocity Collection", elite: true, instantBook: true, rating: 4.9, ratingCount: 214, base: 2400, deposit: 5000, deliveryFee: 250, includedMiles: 100, minDays: 1, minAge: 25, hp: 631, zeroSixty: 3.1, seats: 2, houseMultiplier: 1.05, serviceFeePct: 0.15, rules: [{ id: "w", type: "DAY_OF_WEEK", priority: 1, active: true, adjustment: 1.15 }, { id: "wk", type: "LENGTH_OF_RENTAL", priority: 1, active: true, adjustment: 0.9, minDays: 7 }], image: "https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=1200" },
  { id: "sf90", make: "Ferrari", model: "SF90 Stradale", trim: "", year: 2023, category: "SUPERCAR", market: "MIA", marketName: "Miami", house: "Velocity Collection", elite: true, instantBook: true, rating: 4.9, ratingCount: 214, base: 4200, deposit: 10000, deliveryFee: 350, includedMiles: 100, minDays: 1, minAge: 25, hp: 986, zeroSixty: 2.5, seats: 2, houseMultiplier: 1.05, serviceFeePct: 0.15, rules: [{ id: "w", type: "DAY_OF_WEEK", priority: 1, active: true, adjustment: 1.15 }, { id: "wk", type: "LENGTH_OF_RENTAL", priority: 1, active: true, adjustment: 0.9, minDays: 7 }], image: "https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=1200" },
  { id: "cullinan", make: "Rolls-Royce", model: "Cullinan", trim: "Black Badge", year: 2023, category: "LUXURY_SUV", market: "LAX", marketName: "Los Angeles", house: "Sunset Prestige", elite: true, instantBook: true, rating: 4.8, ratingCount: 131, base: 2100, deposit: 7500, deliveryFee: 200, includedMiles: 100, minDays: 1, minAge: 25, hp: 591, zeroSixty: 4.9, seats: 5, houseMultiplier: 1.0, serviceFeePct: 0.15, rules: [], image: "https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=1200" },
  { id: "gt", make: "McLaren", model: "GT", trim: "", year: 2022, category: "GRAND_TOURER", market: "LAX", marketName: "Los Angeles", house: "Sunset Prestige", elite: true, instantBook: true, rating: 4.8, ratingCount: 131, base: 1800, deposit: 6000, deliveryFee: 200, includedMiles: 100, minDays: 1, minAge: 25, hp: 612, zeroSixty: 3.1, seats: 2, houseMultiplier: 1.0, serviceFeePct: 0.15, rules: [], image: "https://images.unsplash.com/photo-1621135802920-133df287f89c?w=1200" },
  { id: "taycan", make: "Porsche", model: "Taycan", trim: "Turbo S", year: 2024, category: "ELECTRIC", market: "LAX", marketName: "Los Angeles", house: "Sunset Prestige", elite: true, instantBook: true, rating: 4.8, ratingCount: 131, base: 900, deposit: 2500, deliveryFee: 0, includedMiles: 150, minDays: 1, minAge: 25, hp: 750, zeroSixty: 2.6, seats: 4, houseMultiplier: 1.0, serviceFeePct: 0.15, deliveryDeal: true, deliveryDiscountPct: 0.25, dropoff: "LAS", rules: [{ id: "d", type: "DELIVERY_DEAL", priority: 5, active: true, adjustment: 1.0 }], image: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=1200" },
  { id: "urus", make: "Lamborghini", model: "Urus", trim: "Performante", year: 2024, category: "LUXURY_SUV", market: "LAS", marketName: "Las Vegas", house: "Strip Exotics", elite: false, instantBook: false, rating: 4.4, ratingCount: 58, base: 1500, deposit: 3500, deliveryFee: 150, includedMiles: 100, minDays: 1, minAge: 25, hp: 657, zeroSixty: 3.3, seats: 5, houseMultiplier: 0.98, serviceFeePct: 0.15, rules: [{ id: "f1", type: "EVENT", priority: 10, active: true, adjustment: 1.6, marketId: "LAS", startDate: "2026-11-19", endDate: "2026-11-23" }], image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200" },
  { id: "chiron", make: "Bugatti", model: "Chiron", trim: "", year: 2021, category: "HYPERCAR", market: "LAS", marketName: "Las Vegas", house: "Strip Exotics", elite: false, instantBook: false, rating: 4.4, ratingCount: 58, base: 25000, deposit: 100000, deliveryFee: 0, includedMiles: 50, minDays: 1, minAge: 30, hp: 1479, zeroSixty: 2.4, seats: 2, houseMultiplier: 0.98, serviceFeePct: 0.15, rules: [{ id: "f1", type: "EVENT", priority: 10, active: true, adjustment: 1.6, marketId: "LAS", startDate: "2026-11-19", endDate: "2026-11-23" }], image: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=1200" },
];

// 3) Assemble the client script (plain-text file -> placeholders replaced).
const clientSrc = readFileSync(join(here, "app-client.js"), "utf8")
  .replace("/*__ENGINE__*/", engine)
  .replace("/*__INVENTORY__*/ []", JSON.stringify(INVENTORY));

const css = `
:root{--bg:#0a0a0b;--panel:#151518;--line:#26262b;--text:#f5f5f7;--muted:#9a9aa3;--accent:#d4af37;--accent-2:#c8102e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
.nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0;border-bottom:1px solid var(--line)}
.brand{font-weight:700;letter-spacing:.5px;font-size:20px;cursor:pointer}.brand span{color:var(--accent)}
.hero{padding:40px 0 8px}.hero h1{font-size:36px;margin:0 0 8px}.hero p{color:var(--muted);margin:0}
.filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:18px 0 0}
.filters select,.filters input[type=number]{background:#0f0f12;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px}
.chk{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:24px 0 60px}
@media(max-width:820px){.grid{grid-template-columns:1fr}.detail{grid-template-columns:1fr!important}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;cursor:pointer;transition:transform .12s,border-color .12s}
.card:hover{transform:translateY(-2px);border-color:var(--accent)}
.card .photo,.detail .photo{aspect-ratio:16/10;background:#1f1f24 center/cover}
.detail .photo{border-radius:14px}
.card .body{padding:14px 16px 18px}
.make{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.model{font-size:18px;font-weight:650;margin:2px 0 8px}
.price{font-size:16px}.price b{color:var(--accent)}.muted{color:var(--muted)}
.quoteline{font-size:12px;color:var(--muted);margin-top:8px}.quoteline b{color:var(--text)}
.badges{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.badge{font-size:11px;padding:3px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.badge.elite{border-color:var(--accent);color:var(--accent)}.badge.deal{border-color:var(--accent-2);color:#ff6b81}.badge.ver{border-color:#244a30;color:#8fd19e}
.src{color:#8fd19e;font-size:12px}.count{color:var(--muted);font-size:13px;padding:14px 0 0}
.detail{display:grid;grid-template-columns:1.4fr 1fr;gap:28px;padding:24px 0 60px}
.back{display:inline-block;margin:18px 0 0;color:var(--muted);cursor:pointer;font-size:14px}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:16px 0}
.spec{border-bottom:1px solid var(--line);padding:8px 0}.spec .k{color:var(--muted);font-size:13px}.spec .v{font-size:16px}
.quote{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;position:sticky;top:20px}
.quote h3{margin:0 0 4px;font-size:26px}.quote h3 small{font-size:14px;color:var(--muted);font-weight:400}
.row{display:flex;justify-content:space-between;padding:6px 0;color:var(--muted);font-size:14px}
.row.total{color:var(--text);font-weight:700;border-top:1px solid var(--line);margin-top:8px;padding-top:12px}.row b{color:var(--accent)}
label{display:block;font-size:13px;color:var(--muted);margin:12px 0 4px}
input[type=date],input[type=email]{width:100%;padding:10px;background:#0f0f12;color:var(--text);border:1px solid var(--line);border-radius:8px}
.btn{display:block;width:100%;text-align:center;margin-top:16px;padding:12px;background:var(--accent);color:#111;border:none;border-radius:10px;font-weight:700;cursor:pointer}
.btn:disabled{opacity:.5}
.ok{margin-top:14px;padding:14px;border:1px solid var(--accent);border-radius:10px;background:#1a1708}
.ok h4{margin:0 0 8px;color:var(--accent)}
.rulechip{font-size:11px;color:#8fd19e;border:1px solid #244a30;border-radius:999px;padding:2px 8px;margin:0 4px 4px 0;display:inline-block}`;

const head =
  '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  "<title>ExoticAccess — interactive preview</title><style>" + css + "</style></head>";

const bodyTop =
  '<body><div class="wrap">' +
  '<nav class="nav"><div class="brand" onclick="go(\'home\')">EXOTIC<span>ACCESS</span></div>' +
  '<div class="muted" style="font-size:14px">Vetted houses · Instant quotes</div></nav>' +
  '<div id="view"></div></div>';

const out = head + bodyTop + '<script type="module">\n' + clientSrc + "\n</script></body></html>";

writeFileSync(join(root, "app.html"), out);
console.log("Wrote app.html (" + (out.length / 1024).toFixed(1) + " kB)");
