import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ExoticAccess — Exotic & Luxury Car Rental Marketplace",
  description: "Book supercars and luxury vehicles from vetted rental houses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="wrap">
          <nav className="nav">
            <a href="/" className="brand">
              EXOTIC<span>ACCESS</span>
            </a>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>Vetted houses · Instant quotes</div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
