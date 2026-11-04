import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatEventDateTime } from "@/lib/event-time";
import { eventImage } from "@/lib/event-images";
import { getPublicLiveEvents } from "@/lib/public-event";

export const metadata = { title: "Events" };

/**
 * The public events page: only live research campaigns, through
 * public_live_events().
 *
 * It used to also list every artist's "available" sponsorship listing for
 * brands to browse. That's gone (2 Nov standup): brands enquire through the
 * team, and 0106 closes the listings' anonymous read as well, so nothing here
 * can bring them back by accident.
 */
export default async function EventsPage() {
  const supabase = await createClient();
  // Live research campaigns (#48): paid, agreed events. Sponsorship listings
  // are NOT shown here any more — brands enquire through the team (0106).
  const live = await getPublicLiveEvents(supabase);

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      {live.length > 0 && (
        <section className="mb-16">
          <span className="chip">Live now</span>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
            Take part, get a ticket discount
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--color-ink-soft)]">
            Answer a short survey for one of these events and get a discount code for your ticket.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((e) => {
              const image = eventImage(e.banner_url, e.category);
              const when = formatEventDateTime({ date: e.event_date, time: e.start_time, timeZone: e.timezone });
              return (
                <Link
                  key={e.id}
                  href={`/events/${e.id}`}
                  className="les-lift block rounded-3xl border border-[var(--color-les-line)] bg-[var(--color-les-panel)] p-3 hover:border-[var(--color-les-lime)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.src} alt={image.alt} className="h-40 w-full rounded-2xl object-cover" />
                  <div className="space-y-2 p-3">
                    {(e.brand_name || e.artist_name) && (
                      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                        {e.brand_logo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.brand_logo_url} alt="" className="h-6 w-6 rounded object-contain" />
                        )}
                        <span className="truncate">
                          {[e.brand_name, e.artist_name].filter(Boolean).join(" × ")}
                        </span>
                      </p>
                    )}
                    <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{e.name}</h2>
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      {[when ?? "Date to be confirmed", e.venue].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-sm font-semibold text-[var(--color-brand-dark)]">
                      {e.is_open ? "See the offer →" : "Opening soon →"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {live.length === 0 && (
        <>
          <span className="chip">Live now</span>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
            Events
          </h1>
          <div className="mt-8 rounded-3xl border border-[var(--color-les-line)] p-10 text-center text-[var(--color-ink-soft)]">
            No events are open for sign-up right now — check back soon.
          </div>
        </>
      )}

      {/* Events open for brand partnership are not listed publicly: brands
          enquire through the team, who match them (2 Nov standup). */}
      <div className="mt-14 rounded-3xl bg-[var(--color-mist)] p-10 text-center">
        <h2 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          A brand looking to partner with live events?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-ink-soft)]">
          Tell the team what you&apos;re looking for and we&apos;ll match you with the right artists and events.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href="/contact?subject=Brand%20partnership%20enquiry" className="btn btn-primary">
            Enquire through the team
          </Link>
          <Link href="/brands" className="btn btn-ghost">
            How it works for brands
          </Link>
        </div>
      </div>
    </div>
  );
}
