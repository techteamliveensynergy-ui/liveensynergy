import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatEventDateTime } from "@/lib/event-time";
import { eventImage } from "@/lib/event-images";

/**
 * Real sponsored events currently open to the public, on the landing page
 * (asked for 29 Jul). Replaces the hardcoded sample cards that were there
 * before — the point of the section is to show the platform is actually being
 * used, which invented events don't do.
 *
 * Renders nothing when there's nothing live, rather than an empty shell.
 */
type Row = {
  id: string;
  name: string;
  event_date: string | null;
  start_time: string | null;
  timezone: string;
  location: string | null;
  venue_details: string | null;
  banner_url: string | null;
  reward_rules: string | null;
  event_listings: { category: string | null } | null;
};

export async function LiveSponsoredEvents() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // Confirmed events are readable without signing in (RLS policy
  // "sponsored_events: public read confirmed"), which is what lets this render
  // for an anonymous visitor.
  const { data } = await supabase
    .from("sponsored_events")
    .select(
      "id, name, event_date, start_time, timezone, location, venue_details, banner_url, reward_rules, event_listings(category)",
    )
    .eq("status", "confirmed")
    .or(`participation_deadline.is.null,participation_deadline.gte.${nowIso}`)
    .order("event_date", { ascending: true })
    .limit(3);

  const events = (data ?? []) as unknown as Row[];
  if (events.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <p className="font-serif text-[var(--color-ink-soft)]">
            Happening now
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
            Sponsored events you can join
          </h2>
          <p className="mt-3 text-[var(--color-ink-soft)]">
            Register, go along, and claim a sponsor-funded reward on your ticket.
          </p>
        </div>
        <Link href="/auth/sign-up" className="btn btn-primary">
          Join as an audience member
        </Link>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {events.map((e) => {
          const art = eventImage(e.banner_url, e.event_listings?.category);
          const when = formatEventDateTime({
            date: e.event_date,
            time: e.start_time,
            timeZone: e.timezone,
          });
          return (
            <article
              key={e.id}
              className="card flex flex-col overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={art.src}
                alt={art.alt}
                className="h-44 w-full object-cover"
              />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="chip">
                    {e.event_listings?.category ?? "Event"}
                  </span>
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {when ?? "Date TBC"}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold text-[var(--color-ink)]">
                  {e.name}
                </h3>
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {e.location ?? e.venue_details ?? ""}
                </p>
                {e.reward_rules && (
                  <p className="mt-3 line-clamp-3 rounded-xl bg-[var(--color-mist)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
                    <span className="font-semibold text-[var(--color-brand-dark)]">
                      Reward:
                    </span>{" "}
                    {e.reward_rules}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
