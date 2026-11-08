import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { formatDateTime } from "@/lib/format";
import { waitlistSize, type EventCapacity } from "@/lib/event-safety";
import type { SponsoredEventCancellationRequest } from "@/lib/types";
import { adminCancelEvent, setRegistrationCap } from "./safety-actions";
import { DeclineCancellationForm } from "./DeclineCancellationForm";

export interface PaidInvoice {
  id: string;
  reference: string | null;
  amount_gbp: number | null;
  refunded_gbp: number | null;
}

/**
 * Cancel a partnership (0114): requests from the brand/artist, the Cancel
 * button, and — once cancelled — what happened and the invoices to refund.
 */
export function CancellationPanel({
  event,
  requests,
  paidInvoices,
  requesterNames,
  flash,
}: {
  event: {
    id: string;
    reference: string;
    name: string;
    status: string;
    cancelled_at?: string | null;
    cancel_reason?: string | null;
  };
  requests: SponsoredEventCancellationRequest[];
  paidInvoices: PaidInvoice[];
  requesterNames: Record<string, string>;
  flash: { error?: string; cancelled?: boolean; told?: string; holders?: string; declined?: boolean };
}) {
  const pending = requests.filter((r) => r.status === "pending");
  const active = event.status === "in_progress" || event.status === "confirmed";
  const owed = paidInvoices.filter((i) => Number(i.refunded_gbp ?? 0) < Number(i.amount_gbp ?? 0));

  return (
    <div id="cancellation" className="card scroll-mt-6 p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Cancellation</h2>

      {flash.error && (
        <p role="alert" className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {flash.error}
        </p>
      )}
      {flash.declined && (
        <p className="mt-3 rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">
          Request declined — the requester has been told.
        </p>
      )}

      {event.cancelled_at ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-[var(--color-ink)]">
            <strong className="text-[var(--color-accent)]">Cancelled {formatDateTime(event.cancelled_at)}.</strong>{" "}
            {event.cancel_reason}
            {flash.cancelled && flash.told != null && (
              <>
                {" "}
                {flash.told} registered / waitlisted {flash.told === "1" ? "person was" : "people were"} told
                {flash.holders && flash.holders !== "0" ? ` (${flash.holders} already held a code)` : ""}, plus the
                brand and the artist.
              </>
            )}
          </p>
          <p className="text-[var(--color-ink-soft)]">
            Registrations, surveys and code issuing have stopped. The campaign is free to be matched with another
            artist from the campaign&apos;s page — or close it there if the brand is being refunded instead.
          </p>
          {owed.length > 0 ? (
            <div className="rounded-lg border border-black/10 p-3">
              <p className="font-semibold">Paid invoices — decide on a refund or credit note:</p>
              <ul className="mt-1 space-y-1">
                {owed.map((i) => (
                  <li key={i.id}>
                    <Link href={`/dashboard/admin/invoices/${i.id}#refund`} className="font-semibold text-[var(--color-brand-dark)] hover:underline">
                      {i.reference ?? "Invoice"} →
                    </Link>{" "}
                    £{Number(i.amount_gbp ?? 0).toLocaleString("en-GB")} paid
                    {Number(i.refunded_gbp ?? 0) > 0 ? `, £${Number(i.refunded_gbp).toLocaleString("en-GB")} refunded so far` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[var(--color-ink-soft)]">No paid invoice is waiting on a refund.</p>
          )}
        </div>
      ) : (
        <>
          {pending.map((r) => (
            <div key={r.id} className="mt-3 rounded-lg bg-[var(--color-gold)]/40 p-3 text-sm">
              <p>
                <strong>
                  {(r.requested_by && requesterNames[r.requested_by]) || "A party"} ({r.requester_role ?? "party"})
                </strong>{" "}
                asked to cancel on {formatDateTime(r.created_at)}: &ldquo;{r.reason}&rdquo;
              </p>
              <DeclineCancellationForm eventId={event.id} requestId={r.id} />
            </div>
          ))}

          {active ? (
            <form action={adminCancelEvent} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={event.id} />
              <p className="text-sm text-[var(--color-ink-soft)]">
                Cancel when the event can&apos;t go ahead or a party has pulled out. Before payment, this simply frees
                the campaign to be matched with another artist.
              </p>
              <label className="block text-sm">
                <span className="field-label">Reason (the brand, artist and audience see this)</span>
                <textarea name="reason" className="textarea mt-1" required minLength={10} maxLength={2000} />
              </label>
              <label className="block text-sm">
                <span className="field-label">Internal note (audit log only, optional)</span>
                <input name="note" className="input mt-1" maxLength={1000} />
              </label>
              <ConfirmSubmitButton
                label="Cancel this partnership"
                className="btn btn-ghost text-sm text-[var(--color-accent)]"
                title={`Cancel ${event.reference} — ${event.name}?`}
                points={[
                  "Registrations, the event's surveys and discount-code issuing stop at once; the public page comes down.",
                  "Codes not yet given out are withheld. People already holding a code keep it and are told it may no longer work.",
                  "The brand, the artist, everyone registered and everyone on the waitlist is notified with your reason.",
                  "Any pending cancellation request is marked accepted, and it's recorded in the audit log.",
                  "Paid invoices are listed next so you can issue a refund or credit note — no money moves automatically.",
                ]}
                warnings={["This can't be undone. To run the event again, match the campaign afresh."]}
                confirmLabel="Yes, cancel it"
                danger
                pendingLabel="Cancelling…"
              />
            </form>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
              Only a partnership that is still being agreed or is confirmed can be cancelled.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Registration limit and the waitlist behind it (0114). */
export function CapacityPanel({
  eventId,
  cap,
  capacity,
  waitlist,
  flash,
  disabled,
}: {
  eventId: string;
  cap: number | null;
  capacity: EventCapacity | null;
  waitlist: { id: string; name: string; created_at: string }[];
  flash: { saved?: boolean; error?: string };
  disabled: boolean;
}) {
  return (
    <div id="capacity" className="card scroll-mt-6 p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Registration limit &amp; waitlist</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Optional. Once the limit is reached, the next 10% (at least one) join a waitlist and can still answer the
        survey. A place that frees up — a withdrawal, a rejection or a raised limit — goes to the longest-waiting
        person automatically, and they&apos;re emailed.
      </p>
      {flash.error && (
        <p role="alert" className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">{flash.error}</p>
      )}
      {flash.saved && (
        <p className="mt-3 rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">Limit saved.</p>
      )}
      <form action={setRegistrationCap} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={eventId} />
        <label className="text-sm">
          <span className="field-label">Most registrations</span>
          <input
            name="registration_cap"
            type="number"
            min={1}
            step={1}
            defaultValue={cap ?? ""}
            placeholder="No limit"
            className="input mt-1 w-[10rem]"
            disabled={disabled}
          />
        </label>
        <button type="submit" className="btn btn-ghost text-sm" disabled={disabled}>Save limit</button>
        {cap ? (
          <span className="text-xs text-[var(--color-ink-soft)]">Waitlist: {waitlistSize(cap)} place{waitlistSize(cap) === 1 ? "" : "s"}</span>
        ) : null}
      </form>
      {capacity && (
        <p className="mt-3 text-sm">
          <strong>{capacity.registered}</strong> registered{capacity.cap ? ` of ${capacity.cap}` : ""}
          {capacity.cap ? (
            <>
              {" "}· <strong>{capacity.waitlisted}</strong> waiting of {capacity.waitlist_size}
              {capacity.is_full && capacity.waitlist_full ? " · full, no more sign-ups" : capacity.is_full ? " · full, waitlist open" : ""}
            </>
          ) : null}
        </p>
      )}
      {waitlist.length > 0 && (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm">
          {waitlist.map((w) => (
            <li key={w.id}>
              {w.name} <span className="text-xs text-[var(--color-ink-soft)]">since {formatDateTime(w.created_at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
