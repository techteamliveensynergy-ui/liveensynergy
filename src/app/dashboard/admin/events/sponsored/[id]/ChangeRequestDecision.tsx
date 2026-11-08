"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { resolveEventChangeRequest, type ChangeDecisionState } from "../../../marketplace-actions";

function DecisionButtons() {
  const { pending, data } = useFormStatus();
  const choosing = pending ? String(data?.get("op") ?? "") : "";
  return (
    <>
      <button type="submit" name="op" value="approve" className="btn btn-ghost text-sm" disabled={pending}>
        {choosing === "approve" ? "Approving…" : "Approve"}
      </button>
      <button
        type="submit"
        name="op"
        value="decline"
        className="btn btn-ghost text-sm text-[var(--color-accent)]"
        disabled={pending}
      >
        {choosing === "decline" ? "Declining…" : "Decline"}
      </button>
    </>
  );
}

/**
 * Approve / Decline with the outcome on screen (QA 9 Nov: Decline looked like
 * it did nothing). The result — or the reason it couldn't be done — shows
 * under the buttons, and the list refreshes on success.
 */
export function ChangeRequestDecision({ requestId, eventId }: { requestId: string; eventId: string }) {
  const [state, formAction] = useActionState<ChangeDecisionState, FormData>(resolveEventChangeRequest, {});
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="id" value={requestId} />
      <input type="hidden" name="event_id" value={eventId} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="admin_response"
          placeholder="Reply to the requester (optional)"
          maxLength={1000}
          className="input flex-1 py-1.5 text-sm"
        />
        <DecisionButtons />
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
