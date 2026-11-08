"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SponsoredEventCancellationRequest } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { requestEventCancellation, type SponsoredState } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost text-sm text-[var(--color-accent)]" disabled={pending}>
      {pending ? "Sending…" : "Ask the team to cancel"}
    </button>
  );
}

/**
 * Cancelling a partnership is the team's call (0114): it stops registrations
 * and surveys, tells the audience and may mean a refund. Either party can ask,
 * with a reason; there is no delete or withdraw button any more.
 */
export function CancellationRequestSection({
  eventId,
  requests,
}: {
  eventId: string;
  requests: SponsoredEventCancellationRequest[];
}) {
  const [state, formAction] = useActionState<SponsoredState, FormData>(requestEventCancellation, {});
  const pending = requests.find((r) => r.status === "pending");
  const lastDeclined = requests.find((r) => r.status === "declined");

  return (
    <div id="cancellation" className="card scroll-mt-6 p-6">
      <h2 className="text-lg font-semibold">Cancel this partnership</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Only the Live·En·Synergy team can cancel a partnership — it stops registrations and surveys,
        tells everyone who signed up, and sorts out any refund. If the event can&apos;t go ahead, ask
        here and tell us why.
      </p>

      {pending ? (
        <p className="mt-3 rounded-lg bg-[var(--color-gold)]/40 px-3 py-2 text-sm text-[var(--color-ink)]">
          Your request from {formatDateTime(pending.created_at)} is with the team: &ldquo;{pending.reason}&rdquo;.
          Nothing changes until they decide — we&apos;ll notify you.
        </p>
      ) : (
        <>
          {lastDeclined && (
            <p className="mt-3 rounded-lg bg-[var(--color-mist)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
              The team didn&apos;t cancel it on {formatDateTime(lastDeclined.decided_at)}
              {lastDeclined.admin_note ? `: “${lastDeclined.admin_note}”` : "."}
            </p>
          )}
          {state.error && (
            <p role="alert" className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
              {state.error}
            </p>
          )}
          {state.message ? (
            <p className="mt-3 rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">
              {state.message}
            </p>
          ) : (
            <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={eventId} />
              <label className="min-w-[16rem] flex-1 text-sm">
                <span className="field-label">Why does it need to be cancelled?</span>
                <textarea name="reason" className="textarea mt-1" required minLength={10} maxLength={2000} />
              </label>
              <Submit />
            </form>
          )}
        </>
      )}
    </div>
  );
}
