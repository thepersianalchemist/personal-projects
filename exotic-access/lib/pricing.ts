/**
 * ExoticAccess dynamic pricing engine.
 *
 * Adapted from SkyAccess's AircraftPricingRule + per-operator priceMultiplier
 * model. The quote for a rental is built in deterministic layers:
 *
 *   1. base       = vehicle.baseDailyRate
 *   2. house      = base * house.priceMultiplier   (market-fit nudge)
 *   3. rules      = apply each matching PricingRule's multiplicative adjustment
 *                   (seasonal, event surge, weekend, length-of-rental, lead-time,
 *                    delivery-deal). One rule wins per type, by priority.
 *   4. perDay     = rounded daily rate after all adjustments
 *   5. totals     = perDay*days + deliveryFee + serviceFee, plus deposit hold
 *
 * Pure functions, no DB access — callers pass the rows in. This makes the
 * engine trivially unit-testable and identical on server and in jobs.
 */

export type VehicleCategory =
  | "SUPERCAR"
  | "LUXURY_SEDAN"
  | "LUXURY_SUV"
  | "CONVERTIBLE"
  | "GRAND_TOURER"
  | "HYPERCAR"
  | "CLASSIC"
  | "ELECTRIC";

export type PricingRuleType =
  | "SEASONAL"
  | "EVENT"
  | "LENGTH_OF_RENTAL"
  | "DAY_OF_WEEK"
  | "LEAD_TIME"
  | "DELIVERY_DEAL";

export interface PricingRule {
  id: string;
  type: PricingRuleType;
  priority: number;
  active: boolean;
  adjustment: number; // 1.40 == +40%, 0.85 == -15%
  scopeCategory?: VehicleCategory | null;
  scopeVehicleId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  marketId?: string | null;
  minDays?: number | null;
}

export interface QuoteInput {
  baseDailyRate: number;
  houseMultiplier: number;
  serviceFeePct: number;
  deliveryFee?: number;
  securityDeposit?: number;
  includedMilesPerDay?: number;
  vehicleId: string;
  category: VehicleCategory;
  pickupMarketId: string;
  startDate: Date;
  endDate: Date;
  /** Treat as a one-way repositioning "delivery deal" (empty-leg analog). */
  deliveryDeal?: boolean;
  deliveryDiscountPct?: number;
  rules: PricingRule[];
  /** Reference "now" for lead-time rules; defaults caller-supplied for testability. */
  now: Date;
}

export interface AppliedRule {
  type: PricingRuleType;
  ruleId: string;
  adjustment: number;
}

export interface Quote {
  days: number;
  baseDailyRate: number;
  houseMultiplier: number;
  dailyRate: number; // final per-day, after multiplier + rules
  appliedRules: AppliedRule[];
  rentalSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number; // what the renter is charged (excludes deposit hold)
  securityDeposit: number;
  housePayoutAmount: number; // remitted to the house
  currency: "USD";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function rentalDays(start: Date, end: Date): number {
  const raw = Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY);
  return Math.max(1, raw);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function overlapsWindow(start: Date, end: Date, rStart?: Date | null, rEnd?: Date | null): boolean {
  if (rStart && end < rStart) return false;
  if (rEnd && start > rEnd) return false;
  return true;
}

function ruleMatchesScope(rule: PricingRule, input: QuoteInput): boolean {
  if (rule.scopeVehicleId && rule.scopeVehicleId !== input.vehicleId) return false;
  if (rule.scopeCategory && rule.scopeCategory !== input.category) return false;
  if (rule.type === "EVENT" && rule.marketId && rule.marketId !== input.pickupMarketId) return false;
  return true;
}

function ruleApplies(rule: PricingRule, input: QuoteInput, days: number): boolean {
  if (!rule.active) return false;
  if (!ruleMatchesScope(rule, input)) return false;

  switch (rule.type) {
    case "SEASONAL":
    case "EVENT":
      return overlapsWindow(input.startDate, input.endDate, rule.startDate, rule.endDate);
    case "LENGTH_OF_RENTAL":
      return rule.minDays != null && days >= rule.minDays;
    case "DAY_OF_WEEK": {
      // Weekend premium: applies if the window includes a Fri/Sat/Sun.
      for (let t = input.startDate.getTime(); t < input.endDate.getTime(); t += MS_PER_DAY) {
        const dow = new Date(t).getUTCDay();
        if (dow === 0 || dow === 5 || dow === 6) return true;
      }
      return false;
    }
    case "LEAD_TIME": {
      // startDate/endDate on the rule are reused as a lead-time band in days,
      // encoded via minDays (e.g. minDays=2 => "<= 2 days out" last-minute).
      if (rule.minDays == null) return false;
      const leadDays = Math.ceil((input.startDate.getTime() - input.now.getTime()) / MS_PER_DAY);
      return leadDays <= rule.minDays;
    }
    case "DELIVERY_DEAL":
      return !!input.deliveryDeal;
    default:
      return false;
  }
}

/**
 * Pick at most one rule per type — the highest-priority applicable one —
 * mirroring SkyAccess's exclusivity-group behavior so adjustments don't stack
 * uncontrollably within a category.
 */
function selectRules(input: QuoteInput, days: number): AppliedRule[] {
  const byType = new Map<PricingRuleType, PricingRule>();
  for (const rule of input.rules) {
    if (!ruleApplies(rule, input, days)) continue;
    const current = byType.get(rule.type);
    if (!current || rule.priority > current.priority) byType.set(rule.type, rule);
  }
  return [...byType.values()].map((r) => ({
    type: r.type,
    ruleId: r.id,
    adjustment: r.adjustment,
  }));
}

export function quote(input: QuoteInput): Quote {
  const days = rentalDays(input.startDate, input.endDate);

  // Layer 1 + 2: base * house multiplier
  let perDay = input.baseDailyRate * input.houseMultiplier;

  // Layer 3: pricing rules
  const appliedRules = selectRules(input, days);
  for (const r of appliedRules) perDay *= r.adjustment;

  // Explicit delivery-deal discount on top of (or instead of) a DELIVERY_DEAL rule
  if (input.deliveryDeal && input.deliveryDiscountPct) {
    perDay *= 1 - input.deliveryDiscountPct;
  }

  const dailyRate = round2(perDay);
  const rentalSubtotal = round2(dailyRate * days);
  const deliveryFee = round2(input.deliveryFee ?? 0);
  const serviceFee = round2(rentalSubtotal * input.serviceFeePct);
  const total = round2(rentalSubtotal + deliveryFee + serviceFee);
  const securityDeposit = round2(input.securityDeposit ?? 0);

  // House receives the rental subtotal + delivery fee, less ExoticAccess's
  // service fee is charged on top to the renter (so the house nets subtotal +
  // delivery). This matches SkyAccess: the platform fee is additive, the
  // operator is made whole on their quoted price.
  const housePayoutAmount = round2(rentalSubtotal + deliveryFee);

  return {
    days,
    baseDailyRate: round2(input.baseDailyRate),
    houseMultiplier: input.houseMultiplier,
    dailyRate,
    appliedRules,
    rentalSubtotal,
    deliveryFee,
    serviceFee,
    total,
    securityDeposit,
    housePayoutAmount,
    currency: "USD",
  };
}
