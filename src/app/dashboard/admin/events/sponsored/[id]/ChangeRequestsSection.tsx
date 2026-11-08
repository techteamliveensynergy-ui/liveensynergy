import type { SponsoredEventChangeRequest } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { ChangeRequestDecision } from "./ChangeRequestDecision";

export function ChangeRequestsSection({
  eventId,
  requests,
}: {
  eventId: string;
  requests: SponsoredEventChangeRequest[];
}) {
  if (requests.length === 0) return null;

  return (
    <div id="change-requests" className="card scroll-mt-6 p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
        Change requests
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Requests to change this event, blocked automatically inside 2 days of
        the event date. The requester is told your decision and your reply.
      </p>
      <div className="mt-4 space-y-2">
        {requests.map((r) => (
          <div key={r.id} className="rounded-xl border border-black/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                  r.status === "declined"
                    ? "bg-[var(--color-pink)] text-[var(--color-accent)]"
                    : r.status === "approved"
                      ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]"
                      : "bg-[var(--color-gold)]/50 text-[var(--color-ink)]"
                }`}
              >
                {r.status}
              </span>
              <span className="text-xs text-[var(--color-ink-soft)]">
                {r.resolved_at ? `Decided ${formatDateTime(r.resolved_at)}` : `Asked ${formatDateTime(r.created_at)}`}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--color-ink)]">{r.summary}</p>
            {r.status === "pending" ? (
              <ChangeRequestDecision requestId={r.id} eventId={eventId} />
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
