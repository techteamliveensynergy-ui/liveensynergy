"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FileDrop } from "@/components/ui/FileDrop";
import type { SponsoredEvent, TicketSalesReport } from "@/lib/types";
import { submitTicketSalesReport, type SponsoredState } from "../actions";

function money(value: number | null | undefined) {
  return value != null ? `£${Number(value).toLocaleString("en-GB")}` : "—";
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost text-sm" disabled={pending}>
      {pending ? "Submitting…" : "Submit report"}
    </button>
  );
}

export function ArtistPaymentSection({
  eventId,
  event,
  reports,
}: {
  eventId: string;
  event: Pick<
    SponsoredEvent,
    | "artist_fee_gbp"
    | "artist_upfront_gbp"
    | "artist_upfront_paid_at"
    | "artist_remainder_gbp"
    | "artist_remainder_released_at"
  >;
  reports: TicketSalesReport[];
}) {
  const [state, formAction] = useActionState<SponsoredState, FormData>(
    submitTicketSalesReport,
    {},
  );

  if (event.artist_fee_gbp == null) return null;

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold">Your payment</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
          <dt className="text-xs text-[var(--color-ink-soft)]">Upfront</dt>
          <dd className="mt-0.5 text-sm font-semibold">
            {money(event.artist_upfront_gbp)}
            {event.artist_upfront_paid_at ? " · paid" : " · pending"}
          </dd>
        </div>
        <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
          <dt className="text-xs text-[var(--color-ink-soft)]">Remainder</dt>
          <dd className="mt-0.5 text-sm font-semibold">
            {money(event.artist_remainder_gbp)}
            {event.artist_remainder_released_at
              ? " · released"
              : " · after your sales report is reviewed"}
          </dd>
        </div>
      </dl>

      {!event.artist_remainder_released_at && (
        <>
          <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
            Submit a ticket sales report to unlock the remainder.
          </p>
          {state.error && (
            <p className="mt-2 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
              {state.error}
            </p>
          )}
          <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={eventId} />
            <label className="text-sm">
              <span className="field-label">Tickets sold</span>
              <input name="tickets_sold" type="number" min={0} className="input mt-1" />
            </label>
            <label className="text-sm">
              <span className="field-label">Gross revenue (GBP)</span>
              <input
                name="gross_revenue_gbp"
                type="number"
                min={0}
                step="0.01"
                className="input mt-1"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="field-label">Notes</span>
              <textarea name="notes" className="textarea mt-1" />
            </label>
            <div className="sm:col-span-2">
              <FileDrop name="file" label="Attach evidence (optional)" />
            </div>
            <div className="sm:col-span-2">
              <Submit />
            </div>
          </form>
        </>
      )}

      {reports.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-black/10 pt-4 text-sm text-[var(--color-ink-soft)]">
          {reports.map((r) => (
            <p key={r.id}>
              {r.tickets_sold != null ? `${r.tickets_sold} tickets` : "Report"}
              {r.status === "reviewed" ? " · reviewed" : " · submitted"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
