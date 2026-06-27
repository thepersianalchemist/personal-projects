import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function HomePage() {
  // Listings ranked the SkyAccess way: Elite houses first, then by price.
  const listings = await prisma.listing.findMany({
    where: { status: "PUBLISHED" },
    include: {
      vehicle: { include: { model: true, images: true } },
      house: true,
      pickupMarket: true,
      dropoffMarket: true,
    },
    orderBy: [{ house: { tier: "desc" } }, { dailyRate: "asc" }],
    take: 24,
  });

  return (
    <main className="wrap">
      <section className="hero">
        <h1>Drive the extraordinary.</h1>
        <p>Supercars and luxury vehicles from vetted rental houses — instant, all-in pricing.</p>
      </section>

      <section className="grid">
        {listings.map((l) => {
          const v = l.vehicle;
          const hero = v.images.find((i) => i.isHero) ?? v.images[0];
          return (
            <a key={l.id} href={`/vehicles/${l.id}`} className="card">
              <div
                className="photo"
                style={hero ? { backgroundImage: `url(${hero.url})` } : undefined}
              />
              <div className="body">
                <div className="make">
                  {v.model.make} · {l.pickupMarket.code}
                </div>
                <div className="model">
                  {v.model.model} {v.model.trim ?? ""} {v.model.year}
                </div>
                <div className="badges">
                  {l.house.tier === "ELITE" && <span className="badge elite">★ Elite House</span>}
                  {l.deliveryDeal && <span className="badge deal">One-way deal</span>}
                  <span className="badge">{v.model.category.replaceAll("_", " ")}</span>
                </div>
                <div className="price">
                  <b>{money(Number(l.dailyRate))}</b> <span style={{ color: "var(--muted)" }}>/ day</span>
                </div>
              </div>
            </a>
          );
        })}
        {listings.length === 0 && (
          <p style={{ color: "var(--muted)" }}>
            No listings yet. Run <code>npm run db:seed</code> to load sample inventory.
          </p>
        )}
      </section>
    </main>
  );
}
