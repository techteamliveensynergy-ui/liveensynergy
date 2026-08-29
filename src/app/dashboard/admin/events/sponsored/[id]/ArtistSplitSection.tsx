import type { SponsoredEvent, TicketSalesReport } from "@/lib/types";
import { signedUrlFor } from "@/lib/storage";
import {
  setArtistPaymentSplit,
  markArtistUpfrontPaid,
  reviewTicketSalesReport,
  releaseArtistRemainder,
} from "../../../marketplace-actions";

function Money({ value }: { value: number | null | undefined }) {
  return <>{value != null ? `£${Number(value).toLocaleString("en-GB")}` : "—"}</>;
}

export async function ArtistSplitSection({
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
  const reportsWithLinks = await Promise.all(
    reports.map(async (r) => ({
      ...r,
      href: await signedUrlFor(r.report_file_path),
    })),
  );
  const hasReviewedReport = reports.some((r) => r.status === "reviewed");

  return (
    <div className="card p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
        Artist payment
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        What the platform owes the artist — separate from the audience reward
        pool above. The remainder releases only after a ticket sales report is
        reviewed (24 Aug standup).
      </p>

      <form
        action={setArtistPaymentSplit}
        className="mt-4 grid gap-3 sm:grid-cols-3"
      >
        <input type="hidden" name="event_id" value={eventId} />
        <label className="text-sm">
          <span className="field-label">Total fee (GBP)</span>
          <input
            name="artist_fee_gbp"
            type="number"
            min={0}
            step="0.01"
            className="input mt-1"
            defaultValue={event.artist_fee_gbp ?? ""}
          />
        </label>
        <label className="text-sm">
          <span className="field-label">Upfront (GBP)</span>
          <input
            name="artist_upfront_gbp"
            type="number"
            min={0}
            step="0.01"
            className="input mt-1"
            defaultValue={event.artist_upfront_gbp ?? ""}
          />
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn btn-ghost text-sm">
            Set split
          </button>
        </div>
      </form>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
          <dt className="text-xs text-[var(--color-ink-soft)]">Upfront</dt>
          <dd className="mt-0.5 font-medium text-[var(--color-ink)]">
            <Money value={event.artist_upfront_gbp} />
            {event.artist_upfront_paid_at ? " · paid" : ""}
          </dd>
        </div>
        <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
          <dt className="text-xs text-[var(--color-ink-soft)]">Remainder</dt>
          <dd className="mt-0.5 font-medium text-[var(--color-ink)]">
            <Money value={event.artist_remainder_gbp} />
            {event.artist_remainder_released_at ? " · released" : ""}
          </dd>
        </div>
        <div className="flex flex-col justify-center gap-2">
          {!event.artist_upfront_paid_at && event.artist_upfront_gbp != null && (
            <form action={markArtistUpfrontPaid}>
              <input type="hidden" name="event_id" value={eventId} />
              <button type="submit" className="btn btn-ghost text-sm">
                Mark upfront paid
              </button>
            </form>
          )}
          {!event.artist_remainder_released_at &&
            event.artist_remainder_gbp != null && (
              <form action={releaseArtistRemainder}>
                <input type="hidden" name="event_id" value={eventId} />
                <button
                  type="submit"
                  className="btn btn-ghost text-sm"
                  disabled={!hasReviewedReport}
                  title={
                    hasReviewedReport
                      ? undefined
                      : "Review a ticket sales report first"
                  }
                >
                  Release remainder
                </button>
              </form>
            )}
        </div>
      </dl>

      {reportsWithLinks.length > 0 && (
        <div className="mt-4 border-t border-black/10 pt-4">
          <p className="field-label">Ticket sales reports</p>
          <div className="mt-2 space-y-2">
            {reportsWithLinks.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm"
              >
                <span>
                  {r.tickets_sold != null ? `${r.tickets_sold} tickets` : "—"}
                  {r.gross_revenue_gbp != null
                    ? ` · £${Number(r.gross_revenue_gbp).toLocaleString("en-GB")}`
                    : ""}
                  {r.href && (
                    <>
                      {" · "}
                      <a
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-brand-dark)] underline"
                      >
                        Evidence ↗
                      </a>
                    </>
                  )}
                  {r.status === "reviewed" ? " · reviewed" : ""}
                </span>
                {r.status === "submitted" && (
                  <form action={reviewTicketSalesReport}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="event_id" value={eventId} />
                    <button type="submit" className="btn btn-ghost text-xs">
                      Mark reviewed
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
