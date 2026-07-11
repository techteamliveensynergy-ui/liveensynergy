import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { EventListing } from "@/lib/types";
import { ListingForm } from "../ListingForm";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireRole(["artist", "event"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_listings")
    .select("*")
    .eq("id", id)
    .eq("owner_profile_id", profile.id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <div>
      <PageHeader title="Edit event" />
      <Link
        href="/dashboard/events"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to my events
      </Link>
      <ListingForm listing={data as EventListing} />
    </div>
  );
}
