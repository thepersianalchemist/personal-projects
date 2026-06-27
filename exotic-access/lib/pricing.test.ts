import { describe, it, expect } from "vitest";
import { quote, rentalDays, type PricingRule } from "./pricing";

const baseInput = {
  baseDailyRate: 1000,
  houseMultiplier: 1.0,
  serviceFeePct: 0.15,
  deliveryFee: 0,
  securityDeposit: 5000,
  vehicleId: "v1",
  category: "SUPERCAR" as const,
  pickupMarketId: "m1",
  rules: [] as PricingRule[],
  now: new Date("2026-01-01T00:00:00Z"),
};

describe("rentalDays", () => {
  it("rounds up partial days and floors at 1", () => {
    expect(rentalDays(new Date("2026-01-01"), new Date("2026-01-04"))).toBe(3);
    expect(rentalDays(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T06:00:00Z"))).toBe(1);
  });
});

describe("quote", () => {
  it("applies base * days + service fee with no rules", () => {
    const q = quote({
      ...baseInput,
      startDate: new Date("2026-02-02T00:00:00Z"), // Monday
      endDate: new Date("2026-02-05T00:00:00Z"), // Thursday -> 3 days, no weekend
    });
    expect(q.days).toBe(3);
    expect(q.dailyRate).toBe(1000);
    expect(q.rentalSubtotal).toBe(3000);
    expect(q.serviceFee).toBe(450);
    expect(q.total).toBe(3450);
    expect(q.housePayoutAmount).toBe(3000);
  });

  it("applies the house multiplier", () => {
    const q = quote({
      ...baseInput,
      houseMultiplier: 1.05,
      startDate: new Date("2026-02-02T00:00:00Z"),
      endDate: new Date("2026-02-04T00:00:00Z"),
    });
    expect(q.dailyRate).toBe(1050);
  });

  it("stacks one rule per type and picks highest priority", () => {
    const rules: PricingRule[] = [
      { id: "w", type: "DAY_OF_WEEK", priority: 1, active: true, adjustment: 1.2 },
      { id: "lo", type: "LENGTH_OF_RENTAL", priority: 1, active: true, adjustment: 0.9, minDays: 3 },
      { id: "hi", type: "LENGTH_OF_RENTAL", priority: 5, active: true, adjustment: 0.8, minDays: 3 },
    ];
    const q = quote({
      ...baseInput,
      rules,
      startDate: new Date("2026-02-06T00:00:00Z"), // Friday (weekend rule fires)
      endDate: new Date("2026-02-09T00:00:00Z"), // 3 days
    });
    // 1000 * 1.2 (weekend) * 0.8 (higher-priority length rule) = 960
    expect(q.dailyRate).toBe(960);
    expect(q.appliedRules.map((r) => r.type).sort()).toEqual(["DAY_OF_WEEK", "LENGTH_OF_RENTAL"]);
  });

  it("applies a delivery-deal discount", () => {
    const q = quote({
      ...baseInput,
      deliveryDeal: true,
      deliveryDiscountPct: 0.25,
      startDate: new Date("2026-02-02T00:00:00Z"),
      endDate: new Date("2026-02-03T00:00:00Z"),
    });
    expect(q.dailyRate).toBe(750);
  });

  it("respects EVENT rule market scoping", () => {
    const rules: PricingRule[] = [
      {
        id: "f1",
        type: "EVENT",
        priority: 10,
        active: true,
        adjustment: 1.6,
        marketId: "m1",
        startDate: new Date("2026-11-19"),
        endDate: new Date("2026-11-23"),
      },
    ];
    const inWindow = quote({
      ...baseInput,
      rules,
      startDate: new Date("2026-11-20T00:00:00Z"),
      endDate: new Date("2026-11-22T00:00:00Z"),
    });
    expect(inWindow.dailyRate).toBe(1600);

    const wrongMarket = quote({
      ...baseInput,
      rules,
      pickupMarketId: "OTHER",
      startDate: new Date("2026-11-20T00:00:00Z"),
      endDate: new Date("2026-11-22T00:00:00Z"),
    });
    expect(wrongMarket.dailyRate).toBe(1000);
  });
});
