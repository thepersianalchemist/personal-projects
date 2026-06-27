/**
 * Loads the scraped + normalized supply (data/scraped-supply.json) into the
 * database: Markets, RentalHouses (with their source URL + tier), VehicleModels,
 * Vehicles, and a published Listing per vehicle. Run AFTER `npm run db:push`:
 *
 *   npm run normalize        # regenerate data/scraped-supply.json from data/raw
 *   npm run db:seed:scraped  # load it
 *
 * Idempotent on Market/VehicleModel (upsert); houses are matched by slug.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const prisma = new PrismaClient();
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

type Supply = {
  meta: Record<string, unknown>;
  markets: { code: string; name: string }[];
  houses: {
    slug: string; name: string; url: string; city: string; market: string; marketName: string;
    tier: "ELITE" | "STANDARD"; verified: boolean; rating: number; ratingCount: number;
    insuranceTier: string; instantBook: boolean; priceMultiplier: number; serviceFeePct: number;
    vehicles: { make: string; model: string; category: string; dailyRate: number; rateSource: string }[];
  }[];
};

const CAT_DEPOSIT: Record<string, number> = { HYPERCAR: 50000, SUPERCAR: 7500, CONVERTIBLE: 7500, GRAND_TOURER: 5000, LUXURY_SUV: 5000, LUXURY_SEDAN: 3500, CLASSIC: 5000, ELECTRIC: 2500 };

async function main() {
  const data: Supply = JSON.parse(readFileSync(join(root, "data", "scraped-supply.json"), "utf8"));

  // Markets
  const marketByCode = new Map<string, string>();
  for (const m of data.markets) {
    const row = await prisma.market.upsert({ where: { code: m.code }, update: { name: m.name }, create: { code: m.code, name: m.name } });
    marketByCode.set(m.code, row.id);
  }

  const now = Date.now();
  let houses = 0, vehicles = 0, listings = 0;

  for (const h of data.houses) {
    const marketId = marketByCode.get(h.market)!;
    const house = await prisma.rentalHouse.upsert({
      where: { slug: h.slug },
      update: {},
      create: {
        companyName: h.name, slug: h.slug, status: "APPROVED", tier: h.tier,
        website: h.url, city: h.city, country: "US", homeMarketId: marketId,
        insuranceTier: h.insuranceTier as any, insuranceVerifiedAt: h.tier === "ELITE" ? new Date() : null,
        vehiclesInspected: h.tier === "ELITE", ratingAvg: h.rating, ratingCount: h.ratingCount,
        priceMultiplier: h.priceMultiplier, pricingConfirmed: true, serviceFeePct: h.serviceFeePct,
        instantBook: h.instantBook, approvedAt: new Date(),
        // capture provenance: scraped source + verification state
        fleetNotes: `Sourced via web search from ${h.url}; verified=${h.verified}`,
      },
    });
    houses++;

    // weekend premium house-wide; elite houses get a 7+ day discount
    await prisma.pricingRule.create({ data: { houseId: house.id, type: "DAY_OF_WEEK", name: "Weekend premium", adjustment: 1.1, priority: 1 } });
    if (h.tier === "ELITE") await prisma.pricingRule.create({ data: { houseId: house.id, type: "LENGTH_OF_RENTAL", name: "Weekly discount", adjustment: 0.9, minDays: 7, priority: 1 } });

    let vi = 0;
    for (const v of h.vehicles) {
      vi++;
      const year = 2021 + (vi % 4);
      const model = await prisma.vehicleModel.upsert({
        where: { make_model_trim_year: { make: v.make, model: v.model, trim: "", year } },
        update: {},
        create: { make: v.make, model: v.model, trim: "", year, category: v.category as any },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          houseId: house.id, modelId: model.id, homeMarketId: marketId,
          baseDailyRate: v.dailyRate, securityDeposit: CAT_DEPOSIT[v.category] ?? 5000,
          deliveryFee: v.category === "HYPERCAR" ? 0 : 200, inspected: h.tier === "ELITE", inspectedAt: new Date(),
          nickname: `${v.rateSource} rate`,
        },
      });
      vehicles++;
      await prisma.listing.create({
        data: {
          houseId: house.id, vehicleId: vehicle.id, status: "PUBLISHED",
          availableFrom: new Date(now), availableTo: new Date(now + 120 * 86400000),
          pickupMarketId: marketId, dailyRate: v.dailyRate, publishedAt: new Date(),
        },
      });
      listings++;
    }
  }

  console.log("Loaded scraped supply:", { houses, vehicles, listings, markets: data.markets.length });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
