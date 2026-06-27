# SkyAccess → ExoticAccess: full entity & feature mapping

Reference for porting the rest of the SkyAccess surface. The MVP scaffold
implements the **bold** rows; the others are documented translations for the
roadmap.

## Core entities

| SkyAccess model | ExoticAccess model | Notes |
| --- | --- | --- |
| **Operator** | **RentalHouse** | The supplier. `tier` ELITE replaces Choice. |
| **Aircraft** | **Vehicle** | Specific unit; VIN replaces tail number. |
| **AircraftModel** | **VehicleModel** | Shared make/model/trim/year catalog. |
| **Airport** | **Market** | Metro delivery hub (MIA/LAS/LAX). Simplified. |
| **Flight** | **Listing** | The bookable availability window. |
| Flight (empty leg) | Listing (`deliveryDeal=true`) | One-way repositioning discount. |
| **Booking** | **Booking** | |
| **Payment** | **Payment** | Adds `depositHold` for the security deposit. |
| **OperatorPayout** | **HousePayout** | Scheduled `payoutTermsDays` after rental end. |
| **Review** | **Review** | Adds cleanliness/accuracy/communication sub-scores. |
| **User** | **User** | Roles: RENTER / HOUSE_ADMIN / CONCIERGE / ADMIN. |
| Broker | Concierge | `UserRole.CONCIERGE`; quote-dispatch flow is roadmap. |

## Trust / quality (the verified tier)

| SkyAccess | ExoticAccess |
| --- | --- |
| Choice operator (derived) | `HouseTier.ELITE` |
| ARGUS / Wyvern / IS-BAO ratings | `InsuranceTier` + `vehiclesInspected` |
| `certificateUrl`, FAA registration | Insurance docs, inspection records (roadmap) |
| `avgResponse`, ratings, `pricingConfirmed` | Same fields drive the Elite gate |

## Pricing

| SkyAccess | ExoticAccess |
| --- | --- |
| `Operator.priceMultiplier` (+ auto/target) | `RentalHouse.priceMultiplier` |
| `AircraftPricingRule` (+ scopes) | `PricingRule` (+ category/vehicle scope) |
| `PricingRuleExclusivityGroup` | One-rule-per-type selection in `lib/pricing.ts` |
| `FlightPricing` snapshot | `Listing.dailyRate` snapshot |
| Reconnaissance / market-fit jobs | `priceMultiplierAuto` hook (roadmap) |

## Demand & growth (roadmap)

| SkyAccess | ExoticAccess |
| --- | --- |
| SavedSearch / alerts | Saved searches + price/availability alerts |
| Referral / Coupon | Same — house & renter referral codes exist on the model |
| WidgetConfiguration | Embeddable booking widget for house sites |
| InboxTicket / SupportConversation | AI inbox & support |
| HubSpotWriteLog / lifecycle emails | CRM sync + onboarding/performance emails |
| CharterRequest / TripQuoteRequest | Concierge multi-house quote requests |

## Deliberately dropped (aviation-only)

FAA/NTSB registration, ForeFlight/Leon/FL3XX/Avinode integrations, empty-leg
feed scrapers, tail-watch, passenger manifests, airport pairing — none have a
car-rental analog and are removed rather than re-skinned.
