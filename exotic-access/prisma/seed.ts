/**
 * Seed sample inventory for ExoticAccess.
 * Run with: npm run db:seed  (after `npm run db:push`)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // --- Markets -------------------------------------------------------------
  const markets = await Promise.all(
    [
      { code: "MIA", name: "Miami", state: "FL" },
      { code: "LAS", name: "Las Vegas", state: "NV" },
      { code: "LAX", name: "Los Angeles", state: "CA" },
    ].map((m) => prisma.market.upsert({ where: { code: m.code }, update: {}, create: m }))
  );
  const [MIA, LAS, LAX] = markets;

  // --- Vehicle models ------------------------------------------------------
  const models = {
    huracan: await modelUpsert("Lamborghini", "Huracan", "EVO Spyder", 2023, "CONVERTIBLE", 631, 3.1),
    sf90: await modelUpsert("Ferrari", "SF90 Stradale", null, 2023, "SUPERCAR", 986, 2.5),
    urus: await modelUpsert("Lamborghini", "Urus", "Performante", 2024, "LUXURY_SUV", 657, 3.3),
    cullinan: await modelUpsert("Rolls-Royce", "Cullinan", "Black Badge", 2023, "LUXURY_SUV", 591, 4.9),
    gt: await modelUpsert("McLaren", "GT", null, 2022, "GRAND_TOURER", 612, 3.1),
    chiron: await modelUpsert("Bugatti", "Chiron", null, 2021, "HYPERCAR", 1479, 2.4),
    taycan: await modelUpsert("Porsche", "Taycan", "Turbo S", 2024, "ELECTRIC", 750, 2.6),
  };

  // --- Houses --------------------------------------------------------------
  const eliteHouse = await prisma.rentalHouse.create({
    data: {
      companyName: "Velocity Collection",
      slug: "velocity-collection",
      status: "APPROVED",
      tier: "ELITE",
      city: "Miami",
      state: "FL",
      homeMarketId: MIA.id,
      insuranceTier: "PREMIUM",
      insuranceVerifiedAt: new Date(),
      vehiclesInspected: true,
      avgResponseMinutes: 7,
      ratingAvg: 4.9,
      ratingCount: 214,
      priceMultiplier: 1.05,
      pricingConfirmed: true,
      serviceFeePct: 0.15,
      instantBook: true,
      payoutTermsDays: 2,
      approvedAt: new Date(),
      referralCode: "VELOCITY",
    },
  });

  const standardHouse = await prisma.rentalHouse.create({
    data: {
      companyName: "Strip Exotics",
      slug: "strip-exotics",
      status: "APPROVED",
      tier: "STANDARD",
      city: "Las Vegas",
      state: "NV",
      homeMarketId: LAS.id,
      insuranceTier: "COMMERCIAL",
      vehiclesInspected: true,
      avgResponseMinutes: 35,
      ratingAvg: 4.4,
      ratingCount: 58,
      priceMultiplier: 0.98,
      pricingConfirmed: true,
      serviceFeePct: 0.15,
      instantBook: false,
      payoutTermsDays: 3,
      approvedAt: new Date(),
    },
  });

  const laHouse = await prisma.rentalHouse.create({
    data: {
      companyName: "Sunset Prestige",
      slug: "sunset-prestige",
      status: "APPROVED",
      tier: "ELITE",
      city: "Los Angeles",
      state: "CA",
      homeMarketId: LAX.id,
      insuranceTier: "PREMIUM",
      insuranceVerifiedAt: new Date(),
      vehiclesInspected: true,
      avgResponseMinutes: 12,
      ratingAvg: 4.8,
      ratingCount: 131,
      priceMultiplier: 1.0,
      pricingConfirmed: true,
      serviceFeePct: 0.15,
      instantBook: true,
      payoutTermsDays: 2,
      approvedAt: new Date(),
    },
  });

  // --- Pricing rules (dynamic engine) -------------------------------------
  // Vegas F1 weekend event surge.
  await prisma.pricingRule.create({
    data: {
      houseId: standardHouse.id,
      type: "EVENT",
      name: "F1 Las Vegas GP weekend",
      adjustment: 1.6,
      priority: 10,
      marketId: LAS.id,
      startDate: new Date("2026-11-19"),
      endDate: new Date("2026-11-23"),
    },
  });
  // Weekend premium, house-wide.
  await prisma.pricingRule.create({
    data: { houseId: eliteHouse.id, type: "DAY_OF_WEEK", name: "Weekend premium", adjustment: 1.15, priority: 1 },
  });
  // 7+ day discount.
  await prisma.pricingRule.create({
    data: { houseId: eliteHouse.id, type: "LENGTH_OF_RENTAL", name: "Weekly discount", adjustment: 0.9, minDays: 7, priority: 1 },
  });
  // Delivery-deal discount for one-way repositioning.
  await prisma.pricingRule.create({
    data: { houseId: laHouse.id, type: "DELIVERY_DEAL", name: "One-way reposition", adjustment: 0.75, priority: 5 },
  });

  // --- Vehicles + listings -------------------------------------------------
  const now = Date.now();
  const win = (days: number) => new Date(now + days * 86400000);

  await makeVehicleWithListing(eliteHouse.id, models.huracan.id, MIA.id, {
    nickname: "Rosso Huracán",
    color: "Rosso Mars",
    baseDailyRate: 2400,
    securityDeposit: 5000,
    deliveryFee: 250,
    image: "https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=1200",
  }, { availableFrom: win(0), availableTo: win(120) });

  await makeVehicleWithListing(eliteHouse.id, models.sf90.id, MIA.id, {
    nickname: "SF90",
    color: "Giallo Modena",
    baseDailyRate: 4200,
    securityDeposit: 10000,
    deliveryFee: 350,
    image: "https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=1200",
  }, { availableFrom: win(0), availableTo: win(90) });

  await makeVehicleWithListing(standardHouse.id, models.urus.id, LAS.id, {
    nickname: "Urus Perf",
    color: "Verde Mantis",
    baseDailyRate: 1500,
    securityDeposit: 3500,
    deliveryFee: 150,
    image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200",
  }, { availableFrom: win(0), availableTo: win(150) });

  await makeVehicleWithListing(standardHouse.id, models.chiron.id, LAS.id, {
    nickname: "Chiron",
    color: "Blu Carbon",
    baseDailyRate: 25000,
    securityDeposit: 100000,
    deliveryFee: 0,
    minRenterAge: 30,
    image: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=1200",
  }, { availableFrom: win(0), availableTo: win(60) });

  await makeVehicleWithListing(laHouse.id, models.cullinan.id, LAX.id, {
    nickname: "Cullinan BB",
    color: "Black Badge",
    baseDailyRate: 2100,
    securityDeposit: 7500,
    deliveryFee: 200,
    image: "https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=1200",
  }, { availableFrom: win(0), availableTo: win(100) });

  // A one-way "delivery deal": LA -> Vegas reposition, discounted.
  await makeVehicleWithListing(laHouse.id, models.taycan.id, LAX.id, {
    nickname: "Taycan TS",
    color: "Frozen Blue",
    baseDailyRate: 900,
    securityDeposit: 2500,
    deliveryFee: 0,
    image: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=1200",
  }, { availableFrom: win(0), availableTo: win(30), deliveryDeal: true, deliveryDiscountPct: 0.25, dropoffMarketId: LAS.id });

  await makeVehicleWithListing(laHouse.id, models.gt.id, LAX.id, {
    nickname: "McLaren GT",
    color: "Storm Grey",
    baseDailyRate: 1800,
    securityDeposit: 6000,
    deliveryFee: 200,
    image: "https://images.unsplash.com/photo-1621135802920-133df287f89c?w=1200",
  }, { availableFrom: win(0), availableTo: win(80) });

  const counts = {
    markets: await prisma.market.count(),
    houses: await prisma.rentalHouse.count(),
    vehicles: await prisma.vehicle.count(),
    listings: await prisma.listing.count(),
    rules: await prisma.pricingRule.count(),
  };
  console.log("Seeded:", counts);
}

async function modelUpsert(
  make: string,
  model: string,
  trim: string | null,
  year: number,
  category: string,
  horsepower: number,
  zeroToSixty: number
) {
  return prisma.vehicleModel.upsert({
    where: { make_model_trim_year: { make, model, trim: trim ?? "", year } },
    update: {},
    create: { make, model, trim: trim ?? "", year, category: category as any, horsepower, zeroToSixty },
  });
}

async function makeVehicleWithListing(
  houseId: string,
  modelId: string,
  marketId: string,
  v: {
    nickname: string;
    color: string;
    baseDailyRate: number;
    securityDeposit: number;
    deliveryFee: number;
    minRenterAge?: number;
    image: string;
  },
  l: {
    availableFrom: Date;
    availableTo: Date;
    deliveryDeal?: boolean;
    deliveryDiscountPct?: number;
    dropoffMarketId?: string;
  }
) {
  const vehicle = await prisma.vehicle.create({
    data: {
      houseId,
      modelId,
      homeMarketId: marketId,
      nickname: v.nickname,
      color: v.color,
      baseDailyRate: v.baseDailyRate,
      securityDeposit: v.securityDeposit,
      deliveryFee: v.deliveryFee,
      minRenterAge: v.minRenterAge ?? 25,
      inspected: true,
      inspectedAt: new Date(),
      images: { create: [{ url: v.image, isHero: true, position: 0 }] },
    },
  });

  await prisma.listing.create({
    data: {
      houseId,
      vehicleId: vehicle.id,
      status: "PUBLISHED",
      availableFrom: l.availableFrom,
      availableTo: l.availableTo,
      pickupMarketId: marketId,
      dropoffMarketId: l.dropoffMarketId,
      deliveryDeal: l.deliveryDeal ?? false,
      deliveryDiscountPct: l.deliveryDiscountPct ?? 0,
      // Snapshot rate = base * house multiplier (rules apply at quote time).
      dailyRate: v.baseDailyRate,
      publishedAt: new Date(),
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
