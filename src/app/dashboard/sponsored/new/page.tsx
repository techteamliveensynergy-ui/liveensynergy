import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { Campaign, EventListing } from "@/lib/types";
import { SponsoredEventForm, type ListingOption } from "./SponsoredEventForm";

export const metadata = { title: "New sponsored event" };

export default async function NewSponsoredEventPage() {
  // Artists and organisers may now initiate too (27 Jul standup). A brand picks
  // any available listing and one of its own campaigns; an artist picks one of
  // their own listings and one of the brands' open campaign briefs, which is
  // what identifies the brand on the other side.
  const { profile } = await requireRole(["brand", "artist", "event"]);
  const supabase = await createClient();
  const isBrand = profile.role === "brand";

  const { data: brand } = isBrand
    ? await supabase
        .from("brands")
        .select("id, logo_url")
        .eq("profile_id", profile.id)
        .maybeSingle<{ id: string; logo_url: string | null }>()
    : { data: null };

  const [{ data: listingRows }, { data: campaignRows }] = await Promise.all([
    isBrand
      ? supabase
          .from("event_listings")
          .select(
            "id, name, event_date, start_time, timezone, venue_name, city, country, ticket_price_gbp, capacity, image_url, owner_profile_id",
          )
          .eq("status", "available")
          .order("name")
      : // Own listings only, at any status — an artist proposing a sponsorship
        // is often doing it for an event they haven't published yet.
        supabase
          .from("event_listings")
          .select(
            "id, name, event_date, start_time, timezone, venue_name, city, country, ticket_price_gbp, capacity, image_url, owner_profile_id",
          )
          .eq("owner_profile_id", profile.id)
          .order("name"),
    isBrand
      ? brand
        ? supabase
            .from("campaigns")
            .select("id, reference, description, budget_gbp")
            .eq("brand_id", brand.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Campaign[] })
      : supabase
          .from("open_campaigns")
          .select("id, reference, description, budget_gbp, brand_name, brand_id")
          .order("created_at", { ascending: false }),
  ]);

  type ListingRow = Pick<
    EventListing,
    | "id"
    | "name"
    | "event_date"
    | "start_time"
    | "timezone"
    | "venue_name"
    | "city"
    | "country"
    | "ticket_price_gbp"
    | "capacity"
    | "image_url"
    | "owner_profile_id"
  >;

  const rows = (listingRows ?? []) as ListingRow[];

  // The artist's display name comes off their own profile, not the listing —
  // resolved here so the form can prefill it when a listing is chosen.
  const ownerIds = [...new Set(rows.map((r) => r.owner_profile_id))];
  const artistNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    // Read through the public views, not `artists` / `event_organisers`: those
    // are owner-only under RLS, so a brand querying them for someone else's
    // profile gets zero rows back and the artist name silently never autofills.
    const [{ data: artists }, { data: organisers }] = await Promise.all([
      supabase
        .from("public_artist_profiles")
        .select("profile_id, artist_name, stage_name")
        .in("profile_id", ownerIds),
      supabase
        .from("public_organiser_profiles")
        .select("profile_id, event_name")
        .in("profile_id", ownerIds),
    ]);
    for (const a of (artists ?? []) as {
      profile_id: string;
      artist_name: string;
      stage_name: string | null;
    }[]) {
      artistNames.set(a.profile_id, a.stage_name || a.artist_name);
    }
    for (const o of (organisers ?? []) as {
      profile_id: string;
      event_name: string;
    }[]) {
      if (!artistNames.has(o.profile_id)) {
        artistNames.set(o.profile_id, o.event_name);
      }
    }
  }

  const listings: ListingOption[] = rows.map((l) => ({
    id: l.id,
    name: l.name,
    eventDate: l.event_date,
    startTime: l.start_time,
    timezone: l.timezone,
    venue: l.venue_name,
    location: [l.city, l.country].filter(Boolean).join(", ") || null,
    ticketPrice: l.ticket_price_gbp,
    capacity: l.capacity,
    imageUrl: l.image_url,
    artistName: artistNames.get(l.owner_profile_id) ?? null,
  }));

  // A brand sees its own campaign references; an artist sees whose brief it is,
  // because that's what tells them which brand they're proposing to.
  const campaigns = (
    (campaignRows ?? []) as (Pick<
      Campaign,
      "id" | "reference" | "description" | "budget_gbp"
    > & { brand_name?: string })[]
  ).map((c) => ({
    id: c.id,
    label: isBrand
      ? `${c.reference} — ${c.description.slice(0, 40)}`
      : `${c.brand_name} — ${c.description.slice(0, 40)}`,
    budget: c.budget_gbp,
  }));

  return (
    <div>
      <PageHeader
        title="Create a sponsored event"
        subtitle={
          isBrand
            ? undefined
            : "Propose a sponsorship against a brand's open brief. They'll be notified and the deal is confirmed once they agree."
        }
      />
      <Link
        href="/dashboard/sponsored"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to sponsored events
      </Link>
      <SponsoredEventForm
        mode={isBrand ? "brand" : "artist"}
        listings={listings}
        campaigns={campaigns}
        brandLogoUrl={brand?.logo_url ?? null}
      />
    </div>
  );
}
