"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { declineCancellationRequest, type DeclineState } from "./safety-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost text-sm" disabled={pending}>
      {pending ? "Declining…" : "Decline request"}
    </button>
  );
}

/** Decline a party's cancellation request, with the result shown right here. */
export function DeclineCancellationForm({ eventId, requestId }: { eventId: string; requestId: string }) {
  const [state, formAction] = useActionState<DeclineState, FormData>(declineCancellationRequest, {});
  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="request_id" value={requestId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1">
          <span className="field-label">Note to them (optional)</span>
          <input name="note" className="input mt-1" maxLength={1000} />
        </label>
        <Submit />
      </div>
      <div role="status" aria-live="polite">
        {state.error && (
          <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">{state.error}</p>
        )}
        {state.message && (
          <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">{state.message}</p>
        )}
      </div>
    </form>
  );
}
