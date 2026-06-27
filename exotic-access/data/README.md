# Scraped supply

Marketplace supply sourced by searching the live web for exotic/luxury car
rental companies across the major US metros.

## Files

- `raw/*.json` — one file per region, the direct output of the research agents.
  Each entry is a real company with its homepage **URL**, city/market, and the
  exotic models it advertises (with daily rates where they were visible).
- `inventory.json` — normalized **per-vehicle** listings (the shape the
  interactive `app.html` consumes). Generated.
- `scraped-supply.json` — the same data grouped **by house** (for the DB seed
  and human review), plus a `meta` summary. Generated.

Regenerate the two generated files from `raw/` with: `npm run normalize`.

## Coverage

~111 rental houses across 22 US markets: LAX, SAN, SFO, LAS, PHX, DEN, HOU,
DFW, AUS, SAT, MIA, MCO, ATL, BNA, NYC, BOS, DCA, PHL, CHI, CLT, SEA, DTW.

## Provenance & honesty

- **URLs and company names come from live web search results** — none were
  invented. Generic agencies (Hertz/Enterprise) and pure aggregators (Turo)
  were excluded in favor of dedicated exotic houses.
- **`verified`**: this build environment's egress proxy blocked `WebFetch`/
  CONNECT to the rental domains (HTTP 403 policy denial), so the homepages
  could not be independently fetched. `verified=true` is set only where a
  company's name + URL + fleet were corroborated across multiple independent
  searches; otherwise `false`. Re-run from an environment that can fetch these
  domains to confirm and flip the flags.
- **`rateSource`**: `"scraped"` where a real daily rate appeared in search
  results; `"estimated"` where it was filled from a category baseline ×
  market-demand multiplier (so every listing is bookable). ~74 scraped, ~400
  estimated at last run.
