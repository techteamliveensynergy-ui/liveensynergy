import Link from "next/link";
import { SAMPLE_EVENTS } from "@/lib/sample-events";
import { EventCard } from "../EventCard";

export function EventsPreview() {
  const events = SAMPLE_EVENTS.slice(0, 3);
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <p className="font-serif text-[var(--color-ink-soft)]">
            On stage this season
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
            Featured sponsored events
          </h2>
        </div>
        <Link href="/events" className="btn btn-ghost">
          See all events →
        </Link>
      </div>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
