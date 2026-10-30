import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatEventDateTime } from "@/lib/event-time";
import { eventImage } from "@/lib/event-images";
import { ukDayKey } from "@/lib/format";
import type { EventListing } from "@/lib/types";
import { getPublicLiveEvents } from "@/lib/public-event";

export const metadata = { title: "Events" };

/**
 * Real listings open for sponsorship — artists' and organisers' events marked
 * "available" (public read under RLS, 0002). This page used to show hard-coded
 * sample events that couldn't be opened (General Notes, 13 Oct: "unable to
 * open event listing"). Each card opens the event's page; signed out, that
 * goes through sign-in and back.
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const supabase = await createClient();
  const today = ukDayKey(new Date());
  // Live research campaigns (#48): paid, agreed events the audience can take
  // part in. Shown first; the sponsorship listings below are for brands.
  const live = await getPublicLiveEvents(supabase);
  const { data } = await supabase
    .from("event_listings")
    .select("id, name, event_date, start_time, timezone, venue_name, city, country, category, image_url")
    .eq("status", "available")
    // Upcoming, plus listings without a date yet.
    .or(`event_date.gte.${today},event_date.is.null`)
    .order("event_date", { ascending: true, nullsFirst: false });
  const all = (data ?? []) as Pick<
    EventListing,
    "id" | "name" | "event_date" | "start_time" | "timezone" | "venue_name" | "city" | "country" | "category" | "image_url"
  >[];
  const categories = [...new Set(all.map((l) => l.category).filter((c): c is string => !!c))].sort();
  const events = category ? all.filter((l) => l.category === category) : all;

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
                  className="block rounded-3xl border border-black/10 bg-white p-3 shadow-sm transition hover:shadow-md"
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

      <span className="chip">Available for partnership</span>
      {/* One h1 per page: the live list's heading takes it when there is one. */}
      {live.length > 0 ? (
        <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Events looking for partners
        </h2>
      ) : (
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Events looking for partners
        </h1>
      )}
      <p className="mt-3 max-w-2xl text-[var(--color-ink-soft)]">
        Upcoming events from artists and organisers on Live·En·Synergy, open for brand partnership.
      </p>

      {categories.length > 1 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {[null, ...categories].map((c) => {
            const active = (c ?? null) === (category ?? null);
            return (
              <Link
                key={c ?? "all"}
                href={c ? `/events?category=${encodeURIComponent(c)}` : "/events"}
                className={`chip ${active ? "ring-2 ring-[var(--color-brand)]/30" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {c ?? "All"}
              </Link>
            );
          })}
        </div>
      )}

      {events.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-black/10 p-10 text-center text-[var(--color-ink-soft)]">
          No events are open for partnership right now — check back soon.
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((l) => {
            const image = eventImage(l.image_url, l.category);
            const when = formatEventDateTime({ date: l.event_date, time: l.start_time, timeZone: l.timezone });
            return (
              <Link
                key={l.id}
                href={`/dashboard/events/${l.id}/view`}
                className="block rounded-3xl border border-black/10 bg-[#f2f0f6] p-3 shadow-sm transition hover:shadow-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.src} alt={image.alt} className="h-40 w-full rounded-2xl object-cover" />
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    {l.category && <span className="chip">{l.category}</span>}
                    <span className="text-xs text-[var(--color-ink-soft)]">{when ?? "Date to be confirmed"}</span>
                  </div>
                  <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{l.name}</h2>
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    {[l.venue_name, l.city, l.country].filter(Boolean).join(", ") || "Venue to be confirmed"}
                  </p>
                  <p className="text-sm font-semibold text-[var(--color-brand-dark)]">View event →</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-14 rounded-3xl bg-[var(--color-mist)] p-10 text-center">
        <h2 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          Want your event listed here?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-ink-soft)]">
          Create an artist or event profile and mark your events available for
          partnership.
        </p>
        <Link href="/auth/sign-up?role=artist" className="btn btn-primary mt-4">
          Get started
        </Link>
      </div>
    </div>
  );
}
