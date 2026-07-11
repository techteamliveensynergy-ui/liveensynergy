import type { SampleEvent } from "@/lib/sample-events";

const GRADIENTS: Record<string, string> = {
  Music: "from-[var(--color-brand)] to-[var(--color-accent)]",
  Comedy: "from-[var(--color-gold)] to-[var(--color-accent)]",
  "Visual Artists": "from-[var(--color-accent)] to-[var(--color-brand)]",
  default: "from-[var(--color-brand)] to-[var(--color-ink)]",
};

export function EventCard({ event }: { event: SampleEvent }) {
  const gradient = GRADIENTS[event.category] ?? GRADIENTS.default;
  const dateLabel = new Date(event.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <article className="card overflow-hidden">
      <div className={`h-36 bg-gradient-to-br ${gradient}`} />
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="chip">{event.category}</span>
          <span className="text-xs text-[var(--color-ink-soft)]">
            {dateLabel}
          </span>
        </div>
        <div>
          <h3 className="text-lg font-semibold">{event.name}</h3>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {event.artist} · {event.city}, {event.country}
          </p>
        </div>
        <div className="rounded-xl bg-[var(--color-mist)] px-3 py-2 text-sm">
          <span className="font-semibold text-[var(--color-brand-dark)]">
            Reward:
          </span>{" "}
          {event.rewardRule}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-ink-soft)]">
            Ticket £{event.ticketPriceGbp}
          </span>
          <span className="font-semibold">{event.budgetRange}</span>
        </div>
      </div>
    </article>
  );
}
