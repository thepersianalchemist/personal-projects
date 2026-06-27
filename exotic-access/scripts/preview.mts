/**
 * Standalone, no-database preview of the ExoticAccess marketplace.
 * Renders the same UI as app/page.tsx + the vehicle detail panel, using the
 * seed inventory run through the real pricing engine (lib/pricing.ts).
 *
 * Run:  node --experimental-strip-types scripts/preview.mts > preview.html
 * (No Postgres / Prisma needed — this is purely for "show me what it looks like".)
 */
import { quote, type PricingRule } from "../lib/pricing.ts";

type Cat = PricingRule["scopeCategory"];

interface Item {
  make: string;
  model: string;
  trim?: string;
  year: number;
  category: NonNullable<Cat>;
  market: string;
  house: string;
  elite: boolean;
  rating: number;
  ratingCount: number;
  base: number;
  deposit: number;
  deliveryFee: number;
  hp: number;
  zeroSixty: number;
  image: string;
  deliveryDeal?: boolean;
  deliveryDiscountPct?: number;
  houseMultiplier: number;
  rules: PricingRule[];
}

const weekendPremium: PricingRule = { id: "w", type: "DAY_OF_WEEK", priority: 1, active: true, adjustment: 1.15 };
const deliveryRule: PricingRule = { id: "d", type: "DELIVERY_DEAL", priority: 5, active: true, adjustment: 0.75 };

const items: Item[] = [
  { make: "Lamborghini", model: "Huracán", trim: "EVO Spyder", year: 2023, category: "CONVERTIBLE", market: "MIA", house: "Velocity Collection", elite: true, rating: 4.9, ratingCount: 214, base: 2400, deposit: 5000, deliveryFee: 250, hp: 631, zeroSixty: 3.1, houseMultiplier: 1.05, rules: [weekendPremium], image: "https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=1200" },
  { make: "Ferrari", model: "SF90 Stradale", year: 2023, category: "SUPERCAR", market: "MIA", house: "Velocity Collection", elite: true, rating: 4.9, ratingCount: 214, base: 4200, deposit: 10000, deliveryFee: 350, hp: 986, zeroSixty: 2.5, houseMultiplier: 1.05, rules: [weekendPremium], image: "https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=1200" },
  { make: "Rolls-Royce", model: "Cullinan", trim: "Black Badge", year: 2023, category: "LUXURY_SUV", market: "LAX", house: "Sunset Prestige", elite: true, rating: 4.8, ratingCount: 131, base: 2100, deposit: 7500, deliveryFee: 200, hp: 591, zeroSixty: 4.9, houseMultiplier: 1.0, rules: [], image: "https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=1200" },
  { make: "McLaren", model: "GT", year: 2022, category: "GRAND_TOURER", market: "LAX", house: "Sunset Prestige", elite: true, rating: 4.8, ratingCount: 131, base: 1800, deposit: 6000, deliveryFee: 200, hp: 612, zeroSixty: 3.1, houseMultiplier: 1.0, rules: [], image: "https://images.unsplash.com/photo-1621135802920-133df287f89c?w=1200" },
  { make: "Porsche", model: "Taycan", trim: "Turbo S", year: 2024, category: "ELECTRIC", market: "LAX", house: "Sunset Prestige", elite: true, rating: 4.8, ratingCount: 131, base: 900, deposit: 2500, deliveryFee: 0, hp: 750, zeroSixty: 2.6, houseMultiplier: 1.0, rules: [deliveryRule], deliveryDeal: true, deliveryDiscountPct: 0.25, image: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=1200" },
  { make: "Lamborghini", model: "Urus", trim: "Performante", year: 2024, category: "LUXURY_SUV", market: "LAS", house: "Strip Exotics", elite: false, rating: 4.4, ratingCount: 58, base: 1500, deposit: 3500, deliveryFee: 150, hp: 657, zeroSixty: 3.3, houseMultiplier: 0.98, rules: [], image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200" },
  { make: "Bugatti", model: "Chiron", year: 2021, category: "HYPERCAR", market: "LAS", house: "Strip Exotics", elite: false, rating: 4.4, ratingCount: 58, base: 25000, deposit: 100000, deliveryFee: 0, hp: 1479, zeroSixty: 2.4, houseMultiplier: 0.98, rules: [], image: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=1200" },
];

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Elite-first ranking, then price — same as app/page.tsx orderBy.
items.sort((a, b) => Number(b.elite) - Number(a.elite) || a.base - b.base);

const now = new Date();
const start = new Date(now.getTime() + 7 * 86400000);
const end = new Date(start.getTime() + 3 * 86400000);

const cards = items
  .map((it) => {
    const q = quote({
      baseDailyRate: it.base, houseMultiplier: it.houseMultiplier, serviceFeePct: 0.15,
      deliveryFee: it.deliveryFee, securityDeposit: it.deposit, vehicleId: it.model,
      category: it.category, pickupMarketId: it.market, startDate: start, endDate: end,
      deliveryDeal: it.deliveryDeal, deliveryDiscountPct: it.deliveryDiscountPct, rules: it.rules, now,
    });
    const ruleNote = q.appliedRules.length ? ` · rules: ${q.appliedRules.map((r) => r.type).join(", ")}` : "";
    return `
    <a class="card">
      <div class="photo" style="background-image:url('${it.image}')"></div>
      <div class="body">
        <div class="make">${it.make} · ${it.market}</div>
        <div class="model">${it.model} ${it.trim ?? ""} ${it.year}</div>
        <div class="badges">
          ${it.elite ? '<span class="badge elite">★ Elite House</span>' : ""}
          ${it.deliveryDeal ? '<span class="badge deal">One-way deal</span>' : ""}
          <span class="badge">${it.category.replaceAll("_", " ")}</span>
          <span class="badge">★ ${it.rating.toFixed(1)} (${it.ratingCount})</span>
        </div>
        <div class="price"><b>${money(q.dailyRate)}</b> <span class="muted">/ day</span></div>
        <div class="quoteline">3-day total <b>${money(q.total)}</b> all-in${ruleNote}</div>
      </div>
    </a>`;
  })
  .join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ExoticAccess — preview</title>
<style>
:root{--bg:#0a0a0b;--panel:#151518;--line:#26262b;--text:#f5f5f7;--muted:#9a9aa3;--accent:#d4af37;--accent-2:#c8102e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
.nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0;border-bottom:1px solid var(--line)}
.brand{font-weight:700;letter-spacing:.5px;font-size:20px}.brand span{color:var(--accent)}
.hero{padding:48px 0 8px}.hero h1{font-size:38px;margin:0 0 8px}.hero p{color:var(--muted);margin:0}
.tag{display:inline-block;margin:14px 0 0;font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:4px 10px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:24px 0 60px}
@media(max-width:820px){.grid{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:block}
.card:hover{border-color:var(--accent)}
.card .photo{aspect-ratio:16/10;background:#1f1f24 center/cover}
.card .body{padding:14px 16px 18px}
.make{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.model{font-size:18px;font-weight:650;margin:2px 0 8px}
.price{font-size:16px}.price b{color:var(--accent)}.muted{color:var(--muted)}
.quoteline{font-size:12px;color:var(--muted);margin-top:8px}.quoteline b{color:var(--text)}
.badges{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.badge{font-size:11px;padding:3px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.badge.elite{border-color:var(--accent);color:var(--accent)}.badge.deal{border-color:var(--accent-2);color:#ff6b81}
</style></head>
<body><div class="wrap">
<nav class="nav"><div class="brand">EXOTIC<span>ACCESS</span></div><div class="muted" style="font-size:14px">Vetted houses · Instant quotes</div></nav>
<section class="hero"><h1>Drive the extraordinary.</h1><p>Supercars and luxury vehicles from vetted rental houses — instant, all-in pricing.</p>
<span class="tag">Static preview · prices computed live by lib/pricing.ts · Elite houses ranked first</span></section>
<section class="grid">${cards}</section>
</div></body></html>`;

process.stdout.write(html);
