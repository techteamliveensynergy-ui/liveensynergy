import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { Campaign, EventListing } from "@/lib/types";
import { SponsoredEventForm, type ListingOption } from "./SponsoredEventForm";

export const metadata = { title: "New sponsored event" };

export default async function NewSponsoredEventPage() {
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, logo_url")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string; logo_url: string | null }>();

  const [{ data: listingRows }, { data: campaignRows }] = await Promise.all([
    supabase
      .from("event_listings")
      .select(
        "id, name, event_date, venue_name, city, country, ticket_price_gbp, capacity, image_url, owner_profile_id",
      )
      .eq("status", "available")
      .order("name"),
    brand
      ? supabase
          .from("campaigns")
          .select("id, reference, description, budget_gbp")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Campaign[] }),
  ]);

  type ListingRow = Pick<
    EventListing,
    | "id"
    | "name"
    | "event_date"
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
    const [{ data: artists }, { data: organisers }] = await Promise.all([
      supabase
        .from("artists")
        .select("profile_id, artist_name, stage_name")
        .in("profile_id", ownerIds),
      supabase
        .from("event_organisers")
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
    venue: l.venue_name,
    location: [l.city, l.country].filter(Boolean).join(", ") || null,
    ticketPrice: l.ticket_price_gbp,
    capacity: l.capacity,
    imageUrl: l.image_url,
    artistName: artistNames.get(l.owner_profile_id) ?? null,
  }));

  const campaigns = (
    (campaignRows ?? []) as Pick<
      Campaign,
      "id" | "reference" | "description" | "budget_gbp"
    >[]
  ).map((c) => ({
    id: c.id,
    label: `${c.reference} — ${c.description.slice(0, 40)}`,
    budget: c.budget_gbp,
  }));

  return (
    <div>
      <PageHeader title="Create a sponsored event" />
      <Link
        href="/dashboard/sponsored"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to sponsored events
      </Link>
      <SponsoredEventForm
        listings={listings}
        campaigns={campaigns}
        brandLogoUrl={brand?.logo_url ?? null}
      />
    </div>
  );
}
