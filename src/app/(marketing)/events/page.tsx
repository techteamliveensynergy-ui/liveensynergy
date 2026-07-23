import Link from "next/link";
import { EventCard } from "@/components/EventCard";
import { SAMPLE_EVENTS } from "@/lib/sample-events";

export const metadata = { title: "Events available for sponsorship" };

export default function EventsPage() {
  const events = SAMPLE_EVENTS;

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <span className="chip">Available for sponsorship</span>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
        Events looking for sponsors
      </h1>
      <p className="mt-3 max-w-2xl text-[var(--color-ink-soft)]">
        Browse upcoming events open for sponsorship. Filtering by artist,
        location and category is on the roadmap.
      </p>

      {/* Filter placeholder — wired to real queries once listings are live */}
      <div className="mt-8 flex flex-wrap gap-2">
        {["All", "Music", "Comedy", "Visual Artists", "Sports"].map((f, i) => (
          <button
            key={f}
            className={`chip ${i === 0 ? "ring-2 ring-[var(--color-brand)]/30" : ""}`}
            type="button"
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      <div className="mt-14 rounded-3xl bg-[var(--color-mist)] p-10 text-center">
        <h2 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          Want your event listed here?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-ink-soft)]">
          Create an artist or event profile and mark your events available for
          sponsorship.
        </p>
        <Link href="/auth/sign-up?role=artist" className="btn btn-primary mt-4">
          Get started
        </Link>
      </div>
    </div>
  );
}
