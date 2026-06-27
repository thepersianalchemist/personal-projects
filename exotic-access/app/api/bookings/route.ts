import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { quote, rentalDays, type PricingRule } from "@/lib/pricing";

// POST /api/bookings  { listingId, startDate, endDate, renterEmail }
//
// Runs the pricing engine, then writes Booking + Payment (auth/deposit hold) +
// scheduled HousePayout in one transaction — the SkyAccess booking→payment→
// payout flow. Instant-book houses confirm immediately; others stay REQUESTED.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { listingId, startDate, endDate, renterEmail } = body ?? {};
  if (!listingId || !startDate || !endDate || !renterEmail) {
    return NextResponse.json({ error: "listingId, startDate, endDate, renterEmail required" }, { status: 400 });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { vehicle: { include: { model: true } }, house: { include: { pricingRules: true } } },
  });
  if (!listing || listing.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Listing not available" }, { status: 404 });
  }

  // Window & minimum-stay checks
  if (start < listing.availableFrom || end > listing.availableTo) {
    return NextResponse.json({ error: "Dates outside the listing's availability window" }, { status: 409 });
  }
  const days = rentalDays(start, end);
  if (days < listing.vehicle.minRentalDays) {
    return NextResponse.json({ error: `Minimum rental is ${listing.vehicle.minRentalDays} day(s)` }, { status: 409 });
  }

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
    baseDailyRate: Number(listing.vehicle.baseDailyRate),
    houseMultiplier: Number(listing.house.priceMultiplier),
    serviceFeePct: Number(listing.house.serviceFeePct),
    deliveryFee: Number(listing.vehicle.deliveryFee),
    securityDeposit: Number(listing.vehicle.securityDeposit),
    vehicleId: listing.vehicleId,
    category: listing.vehicle.model.category as any,
    pickupMarketId: listing.pickupMarketId,
    startDate: start,
    endDate: end,
    deliveryDeal: listing.deliveryDeal,
    deliveryDiscountPct: Number(listing.deliveryDiscountPct),
    rules,
    now: new Date(),
  });

  // Upsert a lightweight renter record by email.
  const renter = await prisma.user.upsert({
    where: { email: renterEmail },
    update: {},
    create: { email: renterEmail, role: "RENTER" },
  });

  const confirmed = listing.house.instantBook;
  const payoutDelayDays = listing.house.payoutTermsDays;

  const booking = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.create({
      data: {
        status: confirmed ? "CONFIRMED" : "REQUESTED",
        listingId: listing.id,
        vehicleId: listing.vehicleId,
        houseId: listing.houseId,
        renterId: renter.id,
        startDate: start,
        endDate: end,
        days: q.days,
        dailyRate: q.dailyRate,
        rentalSubtotal: q.rentalSubtotal,
        deliveryFee: q.deliveryFee,
        serviceFee: q.serviceFee,
        securityDeposit: q.securityDeposit,
        total: q.total,
        housePayoutAmount: q.housePayoutAmount,
      },
    });

    await tx.payment.create({
      data: {
        bookingId: b.id,
        status: confirmed ? "AUTHORIZED" : "PENDING",
        amount: q.total,
        depositHold: q.securityDeposit,
      },
    });

    if (confirmed) {
      const scheduledFor = new Date(end.getTime() + payoutDelayDays * 86400000);
      await tx.housePayout.create({
        data: {
          houseId: listing.houseId,
          bookingId: b.id,
          status: "SCHEDULED",
          amount: q.housePayoutAmount,
          scheduledFor,
        },
      });
    }

    return b;
  });

  return NextResponse.json({
    booking: {
      id: booking.id,
      status: booking.status,
      days: q.days,
      dailyRate: q.dailyRate,
      rentalSubtotal: q.rentalSubtotal,
      serviceFee: q.serviceFee,
      total: q.total,
      housePayoutAmount: q.housePayoutAmount,
      appliedRules: q.appliedRules,
    },
  });
}
