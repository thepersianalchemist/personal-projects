import { prisma } from "@/lib/db";
import { quote, type PricingRule } from "@/lib/pricing";
import { notFound } from "next/navigation";
import { BookingPanel } from "./booking-panel";

export const dynamic = "force-dynamic";

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default async function VehiclePage({ params }: { params: { id: string } }) {
  const listing = await prisma.listing.findUnique({
    where: { id: params.id },
    include: {
      vehicle: { include: { model: true, images: true } },
      house: { include: { pricingRules: true } },
      pickupMarket: true,
      dropoffMarket: true,
    },
  });
  if (!listing) notFound();

  const v = listing.vehicle;
  const hero = v.images.find((i) => i.isHero) ?? v.images[0];

  // Sample quote for a 3-day rental starting in a week, computed with the
  // same engine the API uses, so the page shows a representative all-in price.
  const start = new Date(Date.now() + 7 * 86400000);
  const end = new Date(start.getTime() + 3 * 86400000);
  const rules: PricingRule[] = listing.house.pricingRules.map((r) => ({
    id: r.id,
    type: r.type as PricingRule["type"],
    priority: r.priority,
    active: r.active,
    adjustment: Number(r.adjustment),
    scopeCategory: r.scopeCategory as PricingRule["scopeCategory"],
    scopeVehicleId: r.scopeVehicleId,
    startDate: r.startDate,
    endDate: r.endDate,
    marketId: r.marketId,
    minDays: r.minDays,
  }));

  const q = quote({
    baseDailyRate: Number(v.baseDailyRate),
    houseMultiplier: Number(listing.house.priceMultiplier),
    serviceFeePct: Number(listing.house.serviceFeePct),
    deliveryFee: Number(v.deliveryFee),
    securityDeposit: Number(v.securityDeposit),
    vehicleId: v.id,
    category: v.model.category as PricingRule["scopeCategory"] as any,
    pickupMarketId: listing.pickupMarketId,
    startDate: start,
    endDate: end,
    deliveryDeal: listing.deliveryDeal,
    deliveryDiscountPct: Number(listing.deliveryDiscountPct),
    rules,
    now: new Date(),
  });

  return (
    <main className="wrap">
      <section className="detail">
        <div>
          <div className="photo" style={hero ? { backgroundImage: `url(${hero.url})` } : undefined} />
          <h1 style={{ marginBottom: 4 }}>
            {v.model.make} {v.model.model} {v.model.trim ?? ""}
          </h1>
          <div style={{ color: "var(--muted)" }}>
            {v.model.year} · {v.model.category.replaceAll("_", " ")} · {listing.pickupMarket.name}
          </div>
          <div className="badges">
            {listing.house.tier === "ELITE" && <span className="badge elite">★ Elite House</span>}
            <span className="badge">{listing.house.companyName}</span>
            <span className="badge">
              ★ {Number(listing.house.ratingAvg).toFixed(1)} ({listing.house.ratingCount})
            </span>
            {listing.deliveryDeal && <span className="badge deal">One-way delivery deal</span>}
          </div>

          <div className="specs">
            <div className="spec"><div className="k">Horsepower</div><div className="v">{v.model.horsepower ?? "—"} hp</div></div>
            <div className="spec"><div className="k">0–60 mph</div><div className="v">{v.model.zeroToSixty ? `${Number(v.model.zeroToSixty)}s` : "—"}</div></div>
            <div className="spec"><div className="k">Seats</div><div className="v">{v.model.seats}</div></div>
            <div className="spec"><div className="k">Included miles/day</div><div className="v">{v.includedMilesPerDay}</div></div>
            <div className="spec"><div className="k">Min rental</div><div className="v">{v.minRentalDays} day(s)</div></div>
            <div className="spec"><div className="k">Min age</div><div className="v">{v.minRenterAge}</div></div>
          </div>
        </div>

        <BookingPanel
          listingId={listing.id}
          base={Number(v.baseDailyRate)}
          sample={{
            days: q.days,
            dailyRate: q.dailyRate,
            rentalSubtotal: q.rentalSubtotal,
            deliveryFee: q.deliveryFee,
            serviceFee: q.serviceFee,
            total: q.total,
            securityDeposit: q.securityDeposit,
            appliedRules: q.appliedRules.map((r) => r.type),
          }}
          moneyFmt={(n: number) => money(n)}
        />
      </section>
    </main>
  );
}
