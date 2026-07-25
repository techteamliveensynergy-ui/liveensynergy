import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { profileCompleteness } from "@/lib/profile";
import { MetricTile, StatusBadge } from "@/components/dashboard/ui";
import { ProfileCompleteness } from "@/components/dashboard/ProfileCompleteness";
import type { EventListing, Profile, SponsoredEvent } from "@/lib/types";

export async function ArtistHome({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const isEvent = profile.role === "event";
  const completeness = await profileCompleteness(profile);

  const [{ data: listingData }, { data: sponsoredData }, { count: enquiryCount }] =
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
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("partner_profile_id", profile.id),
    ]);

  const listings = (listingData ?? []) as EventListing[];
  const sponsored = (sponsoredData ?? []) as SponsoredEvent[];
  const published = listings.filter((l) => l.status === "available").length;
  const confirmed = sponsored.filter((s) => s.status === "confirmed").length;
  const pendingOffers = sponsored.filter((s) => !s.artist_agreed).length;

  let verifiedCount = 0;
  const sponsoredIds = sponsored.map((s) => s.id);
  if (sponsoredIds.length > 0) {
    const { count } = await supabase
      .from("participations")
      .select("id", { count: "exact", head: true })
      .in("sponsored_event_id", sponsoredIds)
      .in("status", ["attendance_verified", "reward_released"]);
    verifiedCount = count ?? 0;
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
            : pendingOffers > 0
              ? `You have ${pendingOffers} sponsorship proposal${pendingOffers === 1 ? "" : "s"} awaiting your response.`
              : "Your events are live — keep an eye on your offers inbox."}
        </p>
      </div>

      <ProfileCompleteness completeness={completeness} className="mb-6" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Published events" value={published} tint="bg-[var(--color-lavender)]" />
        <MetricTile label="Sponsor offers pending" value={pendingOffers} tint="bg-[var(--color-gold)]" />
        <MetricTile label="Confirmed sponsorships" value={confirmed} tint="bg-[var(--color-sage)]" />
        <MetricTile label="Verified attendees" value={verifiedCount} tint="bg-[var(--color-pink)]" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              My events
            </h2>
            <Link
              href="/dashboard/events"
              className="text-sm font-semibold text-[var(--color-brand-dark)]"
            >
              See all →
            </Link>
          </div>
          {listings.length === 0 ? (
            <div className="rounded-xl bg-[var(--color-mist)] p-6 text-center text-sm text-[var(--color-ink-soft)]">
              No events yet.{" "}
              <Link
                href="/dashboard/events/new"
                className="font-semibold text-[var(--color-brand-dark)]"
              >
                Create one →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {listings.slice(0, 4).map((l) => (
                <Link
                  key={l.id}
                  href={`/dashboard/events/${l.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--color-mist)] p-4 transition hover:bg-white hover:shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">{l.name}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      Ref {l.reference}
                      {l.city ? ` · ${l.city}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                  <span className="text-sm font-semibold text-[var(--color-brand-dark)]">
                    Manage →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card bg-[var(--color-gold)]/40 p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Tip · sponsor value
          </h2>
          <p className="mt-2 text-sm text-[var(--color-ink)]/80">
            The more specific your sponsor value details — social posts, onsite
            branding, merch — the sharper the offers our team sends your way.
          </p>
          <Link
            href="/dashboard/profile"
            className="mt-4 inline-block text-sm font-semibold text-[var(--color-brand-dark)]"
          >
            Update your profile →
          </Link>
          {(enquiryCount ?? 0) > 0 && (
            <div className="mt-5 flex items-center justify-between rounded-xl bg-white p-3.5 text-sm">
              <span className="text-[var(--color-ink-soft)]">
                Brand enquiries waiting
              </span>
              <Link
                href="/dashboard/offers"
                className="font-semibold text-[var(--color-brand-dark)]"
              >
                {enquiryCount} open →
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
        <Link href="/dashboard/offers" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">Review sponsor offers</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            See which brands want to partner with you.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link href="/dashboard/profile" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">Polish your profile</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Add your bio, socials and sponsor value details.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
      </div>
    </div>
  );
}
