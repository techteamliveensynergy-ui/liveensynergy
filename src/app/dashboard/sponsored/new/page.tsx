import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { Campaign, EventListing } from "@/lib/types";
import { SponsoredEventForm } from "./SponsoredEventForm";

export const metadata = { title: "New sponsored event" };

export default async function NewSponsoredEventPage() {
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const [{ data: listingRows }, { data: campaignRows }] = await Promise.all([
    supabase
      .from("event_listings")
      .select("id, name")
      .eq("status", "available")
      .order("name"),
    brand
      ? supabase
          .from("campaigns")
          .select("id, reference, description")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Campaign[] }),
  ]);

  const listings = ((listingRows ?? []) as Pick<EventListing, "id" | "name">[]).map(
    (l) => ({ id: l.id, name: l.name }),
  );
  const campaigns = (
    (campaignRows ?? []) as Pick<Campaign, "id" | "reference" | "description">[]
  ).map((c) => ({
    id: c.id,
    label: `${c.reference} — ${c.description.slice(0, 40)}`,
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
      <SponsoredEventForm listings={listings} campaigns={campaigns} />
    </div>
  );
}
