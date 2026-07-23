import type { SampleEvent } from "@/lib/sample-events";

const WELL_TINTS: Record<string, string> = {
  Music: "bg-[var(--color-lavender)] text-[var(--color-purple-deep)]",
  Comedy: "bg-[var(--color-pink)] text-[var(--color-accent)]",
  "Visual Artists": "bg-[var(--color-sage)] text-[var(--color-olive-deep)]",
  default: "bg-[var(--color-mint)] text-[var(--color-ink-soft)]",
};

const CHIP_TINTS: Record<string, string> = {
  Music: "bg-[var(--color-purple)] text-white",
  Comedy: "bg-[var(--color-gold)] text-[var(--color-ink)]",
  "Visual Artists": "bg-[var(--color-olive)] text-white",
  default: "bg-[var(--color-ink)] text-white",
};

export function EventCard({ event }: { event: SampleEvent }) {
  const well = WELL_TINTS[event.category] ?? WELL_TINTS.default;
  const chip = CHIP_TINTS[event.category] ?? CHIP_TINTS.default;
  const dateLabel = new Date(event.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <article className="rounded-3xl border border-black/10 bg-[#f2f0f6] p-3 shadow-sm transition hover:shadow-md">
      <div
        className={`grid h-36 place-items-center rounded-2xl font-serif text-sm ${well}`}
      >
        event image
      </div>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${chip}`}
          >
            {event.category}
          </span>
          <span className="text-xs text-[var(--color-ink-soft)]">
            {dateLabel}
          </span>
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            {event.name}
          </h3>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {event.artist} · {event.city}, {event.country}
          </p>
        </div>
        <div className="rounded-xl bg-white px-3 py-2 text-sm">
          <span className="font-semibold text-[var(--color-brand-dark)]">
            Reward:
          </span>{" "}
          {event.rewardRule}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-ink-soft)]">
            Ticket £{event.ticketPriceGbp}
          </span>
          <span className="font-semibold text-[var(--color-ink)]">
            {event.budgetRange}
          </span>
        </div>
      </div>
    </article>
  );
}
