// Browser app for the interactive ExoticAccess preview.
// build-app.mjs injects the bundled pricing engine at __ENGINE__ and the
// inventory JSON at __INVENTORY__. This file is plain text to Node (never
// evaluated server-side), so its template literals reach the browser intact.

/*__ENGINE__*/

const INVENTORY = /*__INVENTORY__*/ [];

const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const parseRules = (rs) => rs.map((r) => ({ ...r, startDate: r.startDate ? new Date(r.startDate) : null, endDate: r.endDate ? new Date(r.endDate) : null }));

function computeQuote(it, start, end) {
  return quote({
    baseDailyRate: it.base, houseMultiplier: it.houseMultiplier, serviceFeePct: it.serviceFeePct,
    deliveryFee: it.deliveryFee, securityDeposit: it.deposit, vehicleId: it.id,
    category: it.category, pickupMarketId: it.market, startDate: start, endDate: end,
    deliveryDeal: it.deliveryDeal, deliveryDiscountPct: it.deliveryDiscountPct,
    rules: parseRules(it.rules), now: new Date(),
  });
}
const plus = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

let state = { view: "home", id: null, limit: 60, sort: "curated", filters: { market: "", category: "", deal: false, max: "" } };
function go(view, id) { state.view = view; if (id !== undefined) state.id = id; if (view === "detail") { state.dates = null; state.booked = false; } if (view === "home" || view === "houses") state.limit = 60; window.scrollTo(0, 0); render(); }
window.go = go;
window.more = () => { state.limit += 60; render(); };

function applyFilters(list) {
  const f = state.filters;
  const r = list.filter((it) =>
    (!f.market || it.market === f.market) &&
    (!f.category || it.category === f.category) &&
    (!f.deal || it.deliveryDeal) &&
    (!f.max || it.base <= Number(f.max)));
  const sorters = {
    curated: (a, b) => Number(b.elite) - Number(a.elite) || b.rating - a.rating,
    "price-asc": (a, b) => a.base - b.base,
    "price-desc": (a, b) => b.base - a.base,
    rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
  };
  return r.sort(sorters[state.sort] || sorters.curated);
}

function homeView() {
  const start = new Date(plus(7)), end = new Date(plus(10));
  const cats = [...new Set(INVENTORY.map((i) => i.category))].sort();
  const markets = [...new Set(INVENTORY.map((i) => i.market))].sort();
  const filtered = applyFilters(INVENTORY);
  const CAP = state.limit;
  const shown = filtered.slice(0, CAP);
  const cards = shown.map((it) => {
    const q = computeQuote(it, start, end);
    const rn = q.appliedRules.length ? ` · rules: ${q.appliedRules.map((r) => r.type).join(", ")}` : "";
    return `<div class="card" onclick="go('detail','${it.id}')">
      <div class="photo" style="background-image:url('${it.image}')"></div>
      <div class="body">
        <div class="make">${it.make} · ${it.market}</div>
        <div class="model">${it.model} ${it.trim} ${it.year}</div>
        <div class="badges">
          ${it.elite ? '<span class="badge elite">★ Elite House</span>' : ""}
          ${it.deliveryDeal ? '<span class="badge deal">One-way deal</span>' : ""}
          <span class="badge">${it.category.replaceAll("_", " ")}</span>
          <span class="badge">★ ${it.rating.toFixed(1)} (${it.ratingCount})</span>
        </div>
        <div class="price"><b>${money(q.dailyRate)}</b> <span class="muted">/ day</span>${it.rateSource === "scraped" ? '<span class="src"> · live rate</span>' : ""}</div>
        <div class="quoteline">${it.house} · ${it.marketName}${rn ? " · " + rn.replace(" · rules:", "rules:") : ""}</div>
      </div></div>`;
  }).join("");
  return `<section class="hero"><h1>Drive the extraordinary.</h1>
    <p>Supercars &amp; luxury vehicles from ${new Set(INVENTORY.map((i) => i.house)).size} vetted rental houses across ${markets.length} US markets — instant, all-in pricing.</p>
    <div class="count">${filtered.length} cars${filtered.length > shown.length ? ` · showing ${shown.length}` : ""}</div>
    <div class="filters">
      <select onchange="state.filters.market=this.value;state.limit=60;render()"><option value="">All markets</option>${markets.map((m) => `<option ${state.filters.market === m ? "selected" : ""}>${m}</option>`).join("")}</select>
      <select onchange="state.filters.category=this.value;state.limit=60;render()"><option value="">All categories</option>${cats.map((c) => `<option value="${c}" ${state.filters.category === c ? "selected" : ""}>${c.replaceAll("_", " ")}</option>`).join("")}</select>
      <input type="number" placeholder="Max $/day" value="${state.filters.max}" oninput="state.filters.max=this.value;render()" style="width:120px">
      <select class="sort" onchange="state.sort=this.value;render()">
        ${[["curated", "Curated"], ["price-asc", "Price ↑"], ["price-desc", "Price ↓"], ["rating", "Top rated"]].map(([v, l]) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      <label class="chk"><input type="checkbox" ${state.filters.deal ? "checked" : ""} onchange="state.filters.deal=this.checked;state.limit=60;render()"> One-way deals only</label>
    </div>
    <div class="grid">${cards || '<p class="muted">No cars match those filters.</p>'}</div>
    ${filtered.length > shown.length ? `<button class="morebtn" onclick="more()">Load more (${filtered.length - shown.length} more)</button>` : ""}</section>`;
}

function housesView() {
  // Derive the supplier directory from inventory: one entry per house.
  const byHouse = new Map();
  for (const it of INVENTORY) {
    if (state.filters.market && it.market !== state.filters.market) continue;
    let h = byHouse.get(it.houseSlug);
    if (!h) { h = { name: it.house, url: it.houseUrl, market: it.market, marketName: it.marketName, city: it.city, elite: it.elite, verified: it.verified, rating: it.rating, ratingCount: it.ratingCount, count: 0, min: Infinity }; byHouse.set(it.houseSlug, h); }
    h.count++; h.min = Math.min(h.min, it.base);
  }
  const houses = [...byHouse.values()];
  const markets = [...new Set(INVENTORY.map((i) => i.market))].sort();
  // group by market name, markets alphabetical, elite-first within market
  const groups = {};
  for (const h of houses) (groups[h.marketName] ||= []).push(h);
  const sections = Object.keys(groups).sort().map((mk) => {
    const rows = groups[mk].sort((a, b) => Number(b.elite) - Number(a.elite) || b.rating - a.rating).map((h) => `
      <div class="hrow">
        <div class="hn">${h.name} ${h.elite ? '<span class="badge elite">★ Elite</span>' : ""} ${h.verified ? '<span class="badge ver">✓</span>' : ""}</div>
        <div class="hm">${h.city} · ★ ${h.rating.toFixed(1)} (${h.ratingCount}) · ${h.count} cars · from ${money(h.min)}/day</div>
        ${h.url ? `<a class="srcurl" href="${h.url}" target="_blank" rel="noopener">${h.url.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗</a>` : '<span class="muted" style="font-size:13px">no URL</span>'}
      </div>`).join("");
    return `<div class="mkt">${mk} · ${groups[mk].length} houses</div><div class="hlist">${rows}</div>`;
  }).join("");
  return `<section class="hero"><h1>Rental houses.</h1>
    <p>${houses.length} vetted exotic-car rental houses sourced across ${markets.length} US markets. Each links to its source listing.</p>
    <div class="filters">
      <select onchange="state.filters.market=this.value;render()"><option value="">All markets</option>${markets.map((m) => `<option ${state.filters.market === m ? "selected" : ""}>${m}</option>`).join("")}</select>
    </div></section>${sections}`;
}

function detailView() {
  const it = INVENTORY.find((i) => i.id === state.id);
  const s = (state.dates && state.dates.start) || plus(7), e = (state.dates && state.dates.end) || plus(10);
  const q = computeQuote(it, new Date(s), new Date(e));
  const rules = q.appliedRules.map((r) => `<span class="rulechip">${r.type} ×${r.adjustment}</span>`).join("") || '<span class="muted" style="font-size:12px">base rate, no adjustments</span>';
  const booked = state.booked;
  return `<span class="back" onclick="go('home')">← All cars</span>
   <section class="detail">
    <div>
      <div class="photo" style="background-image:url('${it.image}')"></div>
      <h1 style="margin:14px 0 4px">${it.make} ${it.model} ${it.trim}</h1>
      <div class="muted">${it.year} · ${it.category.replaceAll("_", " ")} · ${it.marketName}</div>
      <div class="badges">
        ${it.elite ? '<span class="badge elite">★ Elite House</span>' : ""}
        <span class="badge">${it.house}</span>
        <span class="badge">★ ${it.rating.toFixed(1)} (${it.ratingCount})</span>
        ${it.instantBook ? '<span class="badge">⚡ Instant book</span>' : '<span class="badge">Request to book</span>'}
        ${it.deliveryDeal ? `<span class="badge deal">One-way → ${it.dropoff}</span>` : ""}
        <span class="badge ${it.verified ? "ver" : ""}">${it.verified ? "✓ corroborated" : "source unverified"}</span>
      </div>
      ${it.houseUrl ? `<div style="margin-top:8px;font-size:13px"><span class="muted">Sourced from </span><a href="${it.houseUrl}" target="_blank" rel="noopener" style="color:var(--accent)">${it.houseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗</a> <span class="muted">· rate ${it.rateSource}</span></div>` : ""}
      <div class="specs">
        <div class="spec"><div class="k">Horsepower</div><div class="v">${it.hp} hp</div></div>
        <div class="spec"><div class="k">0–60 mph</div><div class="v">${it.zeroSixty}s</div></div>
        <div class="spec"><div class="k">Seats</div><div class="v">${it.seats}</div></div>
        <div class="spec"><div class="k">Included miles/day</div><div class="v">${it.includedMiles}</div></div>
        <div class="spec"><div class="k">Security deposit</div><div class="v">${money(it.deposit)} hold</div></div>
        <div class="spec"><div class="k">Min age</div><div class="v">${it.minAge}</div></div>
      </div>
      <div style="font-size:13px;color:var(--muted)">Pricing engine breakdown for these dates:</div>
      <div style="margin-top:6px">${rules}</div>
    </div>
    <aside class="quote">
      <h3>${money2(q.dailyRate)}<small> / day</small></h3>
      <div class="muted" style="font-size:12px;margin-bottom:8px">${q.days}-day rental</div>
      <div class="row"><span>${money2(q.dailyRate)} × ${q.days} days</span><span>${money2(q.rentalSubtotal)}</span></div>
      ${q.deliveryFee > 0 ? `<div class="row"><span>Delivery</span><span>${money2(q.deliveryFee)}</span></div>` : ""}
      <div class="row"><span>Service fee (15%)</span><span>${money2(q.serviceFee)}</span></div>
      <div class="row total"><span>Total</span><b>${money2(q.total)}</b></div>
      <div class="row" style="font-size:12px"><span>Refundable deposit hold</span><span>${money2(q.securityDeposit)}</span></div>
      <div class="row" style="font-size:12px"><span>→ House payout</span><span>${money2(q.housePayoutAmount)}</span></div>
      <label>Pick-up</label><input type="date" value="${s}" onchange="setDate('start',this.value)">
      <label>Return</label><input type="date" value="${e}" onchange="setDate('end',this.value)">
      <label>Email</label><input type="email" placeholder="you@example.com" value="${state.email || ""}" oninput="state.email=this.value">
      <button class="btn" onclick="book()" ${booked ? "disabled" : ""}>${booked ? "Booked ✓" : (it.instantBook ? "Book instantly" : "Request to book")}</button>
      ${booked ? `<div class="ok"><h4>${it.instantBook ? "Booking confirmed" : "Request sent"}</h4>
        <div class="muted" style="font-size:13px">${it.make} ${it.model} · ${q.days} days · ${money2(q.total)} charged${it.instantBook ? ` · payout of ${money2(q.housePayoutAmount)} scheduled to ${it.house}` : ` · awaiting ${it.house} to accept`}.</div></div>` : ""}
    </aside>
   </section>`;
}
window.setDate = (k, v) => { state.dates = state.dates || { start: plus(7), end: plus(10) }; state.dates[k] = v; state.booked = false; render(); };
window.book = () => { if (!state.email) { alert("Enter an email"); return; } state.booked = true; render(); };

function render() {
  const view = state.view === "houses" ? housesView() : state.view === "detail" ? detailView() : homeView();
  document.getElementById("view").innerHTML = view;
}

// Inline on* handlers run in global scope, so expose the bits they reference.
window.state = state;
window.render = render;

render();
