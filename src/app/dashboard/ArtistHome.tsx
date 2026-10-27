import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { profileCompleteness } from "@/lib/profile";
import { MetricTile, StatusBadge } from "@/components/dashboard/ui";
import { ProfileCompleteness } from "@/components/dashboard/ProfileCompleteness";
import type { EventListing, Profile, SponsoredEvent } from "@/lib/types";
import { formatEventDateTime } from "@/lib/event-time";
import { ukDayKey } from "@/lib/format";

import { ProfileLinks } from "@/components/dashboard/ProfileLinks";
export async function ArtistHome({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const isEvent = profile.role === "event";
  const completeness = await profileCompleteness(profile);

  const [{ data: listingData }, { data: sponsoredData }, { count: briefCount }] =
    await Promise.all([
      supabase
        .from("event_listings")
        .select("*")
        .eq("owner_profile_id", profile.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("sponsored_events")
        .select("*")
        .eq("artist_profile_id", profile.id)
        .order("created_at", { ascending: false }),
      // Approved order forms linked to this artist's events (view scoped
      // to the artist — see campaign-briefs/page.tsx).
      supabase.from("campaign_order_briefs").select("id", { count: "exact", head: true }),
    ]);

  const listings = (listingData ?? []) as EventListing[];
  const sponsored = (sponsoredData ?? []) as SponsoredEvent[];
  // Cards corrected (General Notes, 13 Oct): the old "sponsor offers" and
  // "brand enquiries" described the direct brand↔artist marketplace (the
  // enquiry count was every conversation, open or not). Now: events agreed,
  // proposals waiting on the artist, discount codes still to confirm, and
  // what's coming up.
  const today = ukDayKey(new Date());
  const upcoming = listings
    .filter((l) => l.event_date && l.event_date >= today && l.status !== "closed")
    .sort((a, b) => (a.event_date! < b.event_date! ? -1 : a.event_date! > b.event_date! ? 1 : 0));
  const live = sponsored.filter((s) => s.status === "confirmed");
  const awaitingYou = sponsored.filter((s) => s.status === "in_progress" && !s.artist_agreed);
  const codesToConfirm = live.filter((s) => !s.reward_codes_confirmed_at);

  let checkedInCount = 0;
  const sponsoredIds = sponsored.map((s) => s.id);
  if (sponsoredIds.length > 0) {
    const { count } = await supabase
      .from("participations")
      .select("id", { count: "exact", head: true })
      .in("sponsored_event_id", sponsoredIds)
      .not("attendance_verified_at", "is", null);
    checkedInCount = count ?? 0;
  }

  return (
    <div>
      <div className="mb-8">
        <p className="font-serif text-[var(--color-ink-soft)]">
          {isEvent ? "Event organiser" : "Artist"} workspace
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
          Welcome back, {profile.full_name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          {listings.length === 0
            ? "List your first event to open it up for sponsorship."
            : awaitingYou.length > 0
              ? `${awaitingYou.length} sponsored event${awaitingYou.length === 1 ? " is" : "s are"} waiting for you to agree the terms.`
              : codesToConfirm.length > 0
                ? `Confirm the discount codes for ${codesToConfirm.length} sponsored event${codesToConfirm.length === 1 ? "" : "s"}.`
                : upcoming.length > 0
                  ? `Your next event is ${upcoming[0].name}.`
                  : "List your next event so our team can match it with a sponsor."}
        </p>
        <ProfileLinks role={profile.role} profileId={profile.id} />
      </div>

      <ProfileCompleteness completeness={completeness} className="mb-6" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Upcoming events" value={upcoming.length} hint="from today" tint="bg-[var(--color-lavender)]" />
        <MetricTile
          label="Waiting on you"
          value={awaitingYou.length + codesToConfirm.length}
          hint="terms to agree + discount codes to confirm"
          tint="bg-[var(--color-gold)]"
        />
        <MetricTile label="Sponsored events" value={live.length} hint="agreed with a brand" tint="bg-[var(--color-sage)]" />
        <MetricTile label="Attendees checked in" value={checkedInCount} hint="across your sponsored events" tint="bg-[var(--color-pink)]" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Upcoming events
            </h2>
            <Link
              href="/dashboard/events"
              className="text-sm font-semibold text-[var(--color-brand-dark)]"
            >
              See all →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="rounded-xl bg-[var(--color-mist)] p-6 text-center text-sm text-[var(--color-ink-soft)]">
              No upcoming events.{" "}
              <Link
                href="/dashboard/events/new"
                className="font-semibold text-[var(--color-brand-dark)]"
              >
                Create one →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.slice(0, 4).map((l) => (
                <Link
                  key={l.id}
                  href={`/dashboard/events/${l.id}/view`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--color-mist)] p-4 transition hover:bg-white hover:shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">{l.name}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      {formatEventDateTime({ date: l.event_date, time: l.start_time, timeZone: l.timezone }, { weekday: true })}
                      {l.venue_name || l.city ? ` · ${[l.venue_name, l.city].filter(Boolean).join(", ")}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                  <span className="text-sm font-semibold text-[var(--color-brand-dark)]">
                    View →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card bg-[var(--color-gold)]/40 p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Waiting on you
          </h2>
          {awaitingYou.length === 0 && codesToConfirm.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink)]/80">
              Nothing right now — we&apos;ll let you know when a sponsor&apos;s campaign needs you.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {awaitingYou.map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/sponsored/${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white p-3.5 text-sm transition hover:shadow-sm"
                >
                  <span className="min-w-0 truncate">
                    Agree the terms for <strong>{s.name}</strong>
                  </span>
                  <span className="shrink-0 font-semibold text-[var(--color-brand-dark)]">Review →</span>
                </Link>
              ))}
              {codesToConfirm.map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/sponsored/${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white p-3.5 text-sm transition hover:shadow-sm"
                >
                  <span className="min-w-0 truncate">
                    Confirm discount codes for <strong>{s.name}</strong>
                  </span>
                  <span className="shrink-0 font-semibold text-[var(--color-brand-dark)]">Open →</span>
                </Link>
              ))}
            </div>
          )}
          {(briefCount ?? 0) > 0 && (
            <div className="mt-5 flex items-center justify-between rounded-xl bg-white p-3.5 text-sm">
              <span className="text-[var(--color-ink-soft)]">Campaign briefs</span>
              <Link href="/dashboard/campaign-briefs" className="font-semibold text-[var(--color-brand-dark)]">
                {briefCount} to read →
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/events/new" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">List an event</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Create an event and mark it available for sponsorship.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link href="/dashboard/campaign-briefs" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">Campaign briefs</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            What each sponsor&apos;s campaign at your event involves.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link href="/dashboard/profile" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">Polish your profile</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Add your bio, photos, videos and socials.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
      </div>
    </div>
  );
}
