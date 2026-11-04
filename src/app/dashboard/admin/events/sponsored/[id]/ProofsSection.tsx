import type { SponsoredEventProof } from "@/lib/types";
import { reviewEventProof } from "../../../marketplace-actions";

const LABELS: Record<string, string> = {
  social_mention: "Social media mention",
  onsite_branding: "Onsite branding",
};

export function ProofsSection({
  eventId,
  proofs,
}: {
  eventId: string;
  proofs: SponsoredEventProof[];
}) {
  if (proofs.length === 0) return null;

  return (
    <div className="card p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
        Proof of terms
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Evidence either side uploaded for a contractual term — social mentions,
        onsite branding.
      </p>
      <div className="mt-4 space-y-2">
        {proofs.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[var(--color-ink)]">
                  {LABELS[p.proof_type] ?? p.proof_type}
                </span>
                <span className="rounded-full bg-[var(--color-mist)] px-2 py-0.5 text-[11px] font-semibold capitalize text-[var(--color-ink-soft)]">
                  {p.status}
                </span>
              </div>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--color-brand-dark)] underline"
              >
                View upload ↗
              </a>
              {p.description && (
                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  {p.description}
                </p>
              )}
            </div>
            {p.status === "submitted" && (
              <div className="flex items-center gap-2">
                <form action={reviewEventProof}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="event_id" value={eventId} />
                  <input type="hidden" name="op" value="approve" />
                  <button type="submit" className="btn btn-ghost text-sm">
                    Approve
                  </button>
                </form>
                <form action={reviewEventProof}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="event_id" value={eventId} />
                  <input type="hidden" name="op" value="reject" />
                  <button
                    type="submit"
                    className="btn btn-ghost text-sm text-[var(--color-accent)]"
                  >
                    Reject
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
