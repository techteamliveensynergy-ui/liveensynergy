"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SponsoredEventChangeRequest } from "@/lib/types";
import { requestEventChange, type SponsoredState } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost text-sm" disabled={pending}>
      {pending ? "Sending…" : "Request change"}
    </button>
  );
}

export function ChangeRequestSection({
  eventId,
  requests,
  withinCutoff,
}: {
  eventId: string;
  requests: SponsoredEventChangeRequest[];
  /** True once the event is inside the 2-day window — self-service is closed. */
  withinCutoff: boolean;
}) {
  const [state, formAction] = useActionState<SponsoredState, FormData>(
    requestEventChange,
    {},
  );

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold">Request a change</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Ask to change the event or artist on this sponsorship — available up
        to 2 days before the event date. Closer than that, use Contact
        Live·En·Synergy above instead.
      </p>

      {state.error && (
        <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}

      {withinCutoff ? (
        <p className="mt-3 rounded-lg bg-[var(--color-mist)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
          This event is within 2 days — use Contact Live·En·Synergy above.
        </p>
      ) : (
        <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={eventId} />
          <label className="flex-1 text-sm">
            <span className="field-label">What would you like to change?</span>
            <textarea name="summary" className="textarea mt-1" required />
          </label>
          <Submit />
        </form>
      )}

      {requests.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-black/10 pt-4">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>{r.summary}</span>
                <span className="rounded-full bg-[var(--color-mist)] px-2 py-0.5 text-[11px] font-semibold capitalize text-[var(--color-ink-soft)]">
                  {r.status}
                </span>
              </div>
              {r.admin_response && (
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                  {r.admin_response}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
