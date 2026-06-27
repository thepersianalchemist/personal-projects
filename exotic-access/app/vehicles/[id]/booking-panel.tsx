"use client";

import { useState } from "react";

interface SampleQuote {
  days: number;
  dailyRate: number;
  rentalSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  securityDeposit: number;
  appliedRules: string[];
}

export function BookingPanel({
  listingId,
  sample,
  moneyFmt,
}: {
  listingId: string;
  base: number;
  sample: SampleQuote;
  moneyFmt: (n: number) => string;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function book(formData: FormData) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          startDate: formData.get("startDate"),
          endDate: formData.get("endDate"),
          renterEmail: formData.get("email"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking failed");
      setStatus(
        `Booking ${data.booking.status.toLowerCase()} — ${data.booking.days} days, total ${moneyFmt(
          data.booking.total
        )}.`
      );
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="quote">
      <h3>{moneyFmt(sample.dailyRate)}<span style={{ color: "var(--muted)", fontWeight: 400 }}> / day</span></h3>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
        Sample {sample.days}-day quote
        {sample.appliedRules.length > 0 && ` · rules: ${sample.appliedRules.join(", ")}`}
      </div>

      <div className="row"><span>{moneyFmt(sample.dailyRate)} × {sample.days} days</span><span>{moneyFmt(sample.rentalSubtotal)}</span></div>
      {sample.deliveryFee > 0 && <div className="row"><span>Delivery</span><span>{moneyFmt(sample.deliveryFee)}</span></div>}
      <div className="row"><span>Service fee</span><span>{moneyFmt(sample.serviceFee)}</span></div>
      <div className="row total"><span>Total</span><b>{moneyFmt(sample.total)}</b></div>
      {sample.securityDeposit > 0 && (
        <div className="row" style={{ fontSize: 12 }}><span>Refundable deposit hold</span><span>{moneyFmt(sample.securityDeposit)}</span></div>
      )}

      <form
        action={book}
        onSubmit={() => setBusy(true)}
      >
        <label>Pick-up</label>
        <input type="date" name="startDate" required />
        <label>Return</label>
        <input type="date" name="endDate" required />
        <label>Email</label>
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          required
          style={{ width: "100%", padding: 10, background: "#0f0f12", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8 }}
        />
        <button className="btn" disabled={busy}>{busy ? "Requesting…" : "Request to book"}</button>
      </form>

      {status && <div style={{ marginTop: 12, fontSize: 13, color: "var(--accent)" }}>{status}</div>}
    </aside>
  );
}
