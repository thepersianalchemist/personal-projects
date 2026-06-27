import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/search?market=MIA&category=SUPERCAR&maxDaily=3000&deal=1
// Returns published listings, Elite houses ranked first (the SkyAccess way).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const market = sp.get("market")?.toUpperCase();
  const category = sp.get("category")?.toUpperCase();
  const maxDaily = sp.get("maxDaily");
  const dealsOnly = sp.get("deal") === "1";

  const listings = await prisma.listing.findMany({
    where: {
      status: "PUBLISHED",
      ...(dealsOnly ? { deliveryDeal: true } : {}),
      ...(maxDaily ? { dailyRate: { lte: Number(maxDaily) } } : {}),
      ...(market ? { pickupMarket: { code: market } } : {}),
      ...(category ? { vehicle: { model: { category: category as any } } } : {}),
    },
    include: {
      vehicle: { include: { model: true, images: { take: 1, orderBy: { position: "asc" } } } },
      house: { select: { companyName: true, tier: true, ratingAvg: true, ratingCount: true } },
      pickupMarket: { select: { code: true, name: true } },
    },
    orderBy: [{ house: { tier: "desc" } }, { dailyRate: "asc" }],
    take: 50,
  });

  return NextResponse.json({
    count: listings.length,
    results: listings.map((l) => ({
      id: l.id,
      make: l.vehicle.model.make,
      model: l.vehicle.model.model,
      trim: l.vehicle.model.trim,
      year: l.vehicle.model.year,
      category: l.vehicle.model.category,
      dailyRate: Number(l.dailyRate),
      market: l.pickupMarket.code,
      deliveryDeal: l.deliveryDeal,
      house: { name: l.house.companyName, tier: l.house.tier, rating: Number(l.house.ratingAvg) },
      image: l.vehicle.images[0]?.url ?? null,
    })),
  });
}
