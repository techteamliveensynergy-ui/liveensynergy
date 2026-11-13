import { EventBanner } from "@/components/EventBanner";
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
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; open?: string }>;
}) {
  const { q: rawQ, category: rawCategory, open: rawOpen } = await searchParams;
  const supabase = await createClient();
  // Live research campaigns (#48): paid, agreed events. Sponsorship listings
  // are NOT shown here any more — brands enquire through the team (0106).
  const all = await getPublicLiveEvents(supabase);

  // Search (QA 9 Nov: the list had none). Matches the event, artist, brand,
  // venue and category; filters by category and "open now". A plain GET form,
  // so results are linkable and work without JavaScript.
  const q = (rawQ ?? "").trim().slice(0, 100);
  const category = (rawCategory ?? "").trim();
  const openOnly = rawOpen === "1";
  const categories = [...new Set(all.map((e) => e.category).filter((c): c is string => Boolean(c)))].sort();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const live = all.filter((e) => {
    if (category && e.category !== category) return false;
    if (openOnly && !e.is_open) return false;
    if (terms.length === 0) return true;
    const hay = [e.name, e.artist_name, e.brand_name, e.venue, e.category].filter(Boolean).join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const filtering = Boolean(q || category || openOnly);

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      {all.length > 0 && (
        <form method="get" role="search" className="mb-10 flex flex-wrap items-end gap-3" data-testid="events-search">
          <label className="min-w-[14rem] flex-1 text-sm">
            <span className="field-label">Search events</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Event, artist, brand or venue"
              className="input mt-1"
              maxLength={100}
            />
          </label>
          {categories.length > 1 && (
            <label className="text-sm">
              <span className="field-label">Category</span>
              <select name="category" defaultValue={category} className="select mt-1 w-auto">
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="inline-flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="open" value="1" defaultChecked={openOnly} /> Open for sign-up now
          </label>
          <button type="submit" className="btn btn-primary">
            Search
          </button>
          {filtering && (
            <Link href="/events" className="btn btn-ghost">
              Clear
            </Link>
          )}
        </form>
      )}

      {all.length > 0 && filtering && live.length === 0 && (
        <div className="mb-16 rounded-3xl border border-[var(--color-les-line)] p-10 text-center text-[var(--color-ink-soft)]">
          No events match{q ? ` “${q}”` : ""}. <Link href="/events" className="font-semibold text-[var(--color-brand)]">Show all events</Link>
        </div>
      )}

      {live.length > 0 && (
        <section className="mb-16">
          <span className="chip">Live now</span>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
            Take part, get a ticket discount
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--color-ink-soft)]">
            Answer a short survey for one of these events and get a discount code for your ticket.
          </p>
          {filtering && (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {live.length} of {all.length} event{all.length === 1 ? "" : "s"}
            </p>
          )}
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
                  <EventBanner src={image.src} alt={image.alt} className="h-40 w-full rounded-2xl" />
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

      {all.length === 0 && (
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
