# ExoticAccess

**An exotic & luxury car rental marketplace — the SkyAccess model, applied to cars.**

ExoticAccess takes the proven mechanics of [SkyAccess](https://skyaccess) (a
private-jet charter marketplace) and re-points every concept at exotic car
rentals. It is a **marketplace, not a rental company**: ExoticAccess never owns
a car. Independent rental houses list their fleets, renters search and book, and
ExoticAccess earns a service fee on each booking and remits the balance to the
house.

---

## The business model (translated from SkyAccess)

| SkyAccess (charter jets) | ExoticAccess (exotic cars) |
| --- | --- |
| Marketplace connecting flyers to charter operators | Marketplace connecting renters to rental houses |
| **Operators** list aircraft & empty legs | **Rental houses** list vehicles & availability |
| **Aircraft** (a specific tail number) | **Vehicle** (a specific car, by VIN) |
| **Empty legs** — discounted repositioning flights | **Delivery deals** — discounted one-way repositioning rentals |
| **"Choice"** verified-operator tier | **"Elite"** verified-house tier |
| Safety ratings (ARGUS / Wyvern / IS-BAO) gate Choice | Insurance tier + vehicle inspection gate Elite |
| Per-operator `priceMultiplier` + pricing rules | Per-house `priceMultiplier` + pricing rules |
| Booking → Payment → **Operator payout** | Booking → Payment → **House payout** |
| **Brokers** book on behalf of clients | **Concierges** book on behalf of clients |
| Reviews, referrals, coupons | Reviews, referrals, coupons |
| Platform take rate on each booking | Platform service fee on each booking |

### Why these map cleanly

Both businesses are **high-trust, high-ticket, supply-constrained rental
marketplaces** with the same core tension: the platform doesn't own the asset,
so it must (a) **vet supply quality**, (b) **make pricing trustworthy and
all-in**, and (c) **move money safely** between two parties who don't know each
other. Every SkyAccess feature exists to solve one of those three problems, and
each solution transfers directly:

1. **Supply quality → the Elite tier.** SkyAccess gates its "Choice" badge on
   third-party safety audits. Cars don't have ARGUS ratings, but they have the
   exact analog: **commercial insurance on file** and **inspection status**. A
   house becomes `ELITE` only when it is approved, adequately insured
   (`InsuranceTier.PREMIUM`), has inspected vehicles, responds fast, is
   well-reviewed, and has confirmed its pricing. Elite houses get a ranking
   boost and the badge — the single strongest conversion lever on the platform.

2. **Trustworthy pricing → the dynamic pricing engine.** See below.

3. **Safe money movement → Booking/Payment/Payout.** Renter is charged an
   all-in total plus a refundable deposit hold; the house's payout is scheduled
   for `payoutTermsDays` after the rental ends and held if there's a dispute.

### Revenue

ExoticAccess charges an **additive service fee** (default 15%, per-house
configurable via `serviceFeePct`) on top of the house's quoted rental price, so
the house is always made whole on the price it set — identical to SkyAccess's
operator-facing economics. Secondary revenue mirrors the parent model:
delivery-deal placement, Elite subscription/placement, and concierge fees.

---

## The dynamic pricing engine

The single most differentiated piece of SkyAccess, ported in `lib/pricing.ts`.
A quote is built in deterministic layers:

```
base            = vehicle.baseDailyRate
× house          = base × house.priceMultiplier        (market-fit nudge)
× rules          = one PricingRule per type, by priority:
                     SEASONAL · EVENT · DAY_OF_WEEK ·
                     LENGTH_OF_RENTAL · LEAD_TIME · DELIVERY_DEAL
= dailyRate
total           = dailyRate × days + deliveryFee + serviceFee  (+ deposit hold)
```

Like SkyAccess, only **one rule per type** applies (highest `priority` wins), so
adjustments can't stack uncontrollably. Example rules in the seed:

- **EVENT:** Las Vegas F1 GP weekend → +60% in the LAS market.
- **DAY_OF_WEEK:** weekend premium → +15%.
- **LENGTH_OF_RENTAL:** 7+ days → −10%.
- **DELIVERY_DEAL:** one-way reposition → −25%.

The engine is a pure function (no DB access), unit-tested in
`lib/pricing.test.ts`, and used identically by the listing page and the booking
API so the displayed price and the charged price can never drift.

---

## Architecture

- **Next.js 14 (App Router)** — marketplace UI + API routes.
- **Prisma + PostgreSQL** — data model in `prisma/schema.prisma`.
- **Pricing engine** — `lib/pricing.ts` (+ `lib/pricing.test.ts`).

```
app/
  page.tsx                  Home / search results (Elite-first ranking)
  vehicles/[id]/page.tsx    Vehicle detail + live sample quote
  vehicles/[id]/booking-panel.tsx   Client booking widget
  api/search/route.ts       GET  /api/search  (filter by market/category/price/deals)
  api/bookings/route.ts     POST /api/bookings (runs engine, writes booking+payment+payout)
lib/
  pricing.ts                Dynamic pricing engine
  db.ts                     Prisma client singleton
prisma/
  schema.prisma             Translated data model
  seed.ts                   Sample houses, vehicles, listings, pricing rules
docs/
  MAPPING.md                Full SkyAccess→ExoticAccess entity & feature map
```

---

## See it instantly (no database)

Open **`app.html`** in any browser — a self-contained, interactive preview of the
marketplace. Browse the grid, filter by market/category/deals, open a car, change
the rental dates and watch the quote recompute, and book for a confirmation. The
prices are produced by the **real** engine: `lib/pricing.ts` is bundled to the
browser with esbuild, so the preview can't drift from the app. Regenerate with:

```bash
npm install   # or just: npx esbuild
npm run build:app   # -> writes app.html
```

## Running the full app

```bash
cd exotic-access
cp .env.example .env          # point DATABASE_URL at a Postgres instance
npm install
npm run db:push               # create the schema
npm run db:seed               # load sample inventory across MIA / LAS / LAX
npm run dev                   # http://localhost:3000
npm test                      # pricing-engine unit tests
```

Try `GET /api/search?market=LAX&deal=1` for one-way delivery deals, or open a
vehicle and request a booking to exercise the full quote→booking→payout flow.

---

## Status & roadmap

This is a **core-marketplace-MVP scaffold**: houses, vehicles, listings,
Elite-tier ranking, the dynamic pricing engine, delivery deals, and the
booking→payment→payout flow. The next SkyAccess features to port, in order of
leverage:

1. **Concierge** quote dispatch (SkyAccess Broker/quote flow).
2. **Embeddable booking widget** for house websites (SkyAccess WidgetConfiguration).
3. **AI inbox** + support (SkyAccess InboxTicket / SupportConversation).
4. **CRM + lifecycle** (HubSpot sync, onboarding, performance emails).
5. **Referrals & coupons.**
