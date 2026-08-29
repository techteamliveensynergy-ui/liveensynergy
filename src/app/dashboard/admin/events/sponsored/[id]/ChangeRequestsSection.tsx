import type { SponsoredEventChangeRequest } from "@/lib/types";
import { resolveEventChangeRequest } from "../../../marketplace-actions";

export function ChangeRequestsSection({
  eventId,
  requests,
}: {
  eventId: string;
  requests: SponsoredEventChangeRequest[];
}) {
  if (requests.length === 0) return null;

  return (
    <div className="card p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
        Change requests
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Requests to change this event, blocked automatically inside 2 days of
        the event date.
      </p>
      <div className="mt-4 space-y-2">
        {requests.map((r) => (
          <div key={r.id} className="rounded-xl border border-black/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-[var(--color-mist)] px-2 py-0.5 text-[11px] font-semibold capitalize text-[var(--color-ink-soft)]">
                {r.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--color-ink)]">{r.summary}</p>
            {r.status === "pending" ? (
              <form
                action={resolveEventChangeRequest}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="event_id" value={eventId} />
                <input
                  type="text"
                  name="admin_response"
                  placeholder="Response (optional)"
                  className="input flex-1 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  name="op"
                  value="approve"
                  className="btn btn-ghost text-sm"
                >
                  Approve
                </button>
                <button
                  type="submit"
                  name="op"
                  value="decline"
                  className="btn btn-ghost text-sm text-[var(--color-accent)]"
                >
                  Decline
                </button>
              </form>
            ) : (
              r.admin_response && (
                <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                  Response: {r.admin_response}
                </p>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
