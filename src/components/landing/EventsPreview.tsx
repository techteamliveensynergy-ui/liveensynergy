import Link from "next/link";
import { SAMPLE_EVENTS } from "@/lib/sample-events";
import { EventCard } from "../EventCard";

export function EventsPreview() {
  const events = SAMPLE_EVENTS.slice(0, 3);
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <span className="chip">Available for sponsorship</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            Upcoming events looking for sponsors
          </h2>
        </div>
        <Link href="/events" className="btn btn-ghost">
          Browse all events
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
