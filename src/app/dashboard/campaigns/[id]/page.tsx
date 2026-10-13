import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { CampaignIntakeRequest } from "@/lib/types";
import { CampaignForm } from "../CampaignForm";

export const metadata = { title: "Edit campaign request" };

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  // Editable only while still 'submitted' — RLS enforces the same rule, this
  // scoping just turns a rejected write into a normal "not found".
  const { data } = brand
    ? await supabase
        .from("campaign_intake_requests")
        .select("*")
        .eq("id", id)
        .eq("brand_id", brand.id)
        .eq("status", "submitted")
        .maybeSingle()
    : { data: null };

  if (!data) {
    // Not an editable request. Send older links somewhere useful rather than
    // a 404: a request past 'submitted' → its read-only page; a campaign id
    // (the campaign.status_changed notification linked here before 13 Oct)
    // → that campaign under Campaigns live.
    if (brand) {
      const [{ data: request }, { data: campaign }] = await Promise.all([
        supabase.from("campaign_intake_requests").select("id").eq("id", id).eq("brand_id", brand.id).maybeSingle(),
        supabase.from("campaigns").select("id").eq("id", id).eq("brand_id", brand.id).maybeSingle(),
      ]);
      if (request) redirect(`/dashboard/campaigns/requests/${id}`);
      if (campaign) redirect(`/dashboard/campaigns/live/${id}`);
    }
    notFound();
  }

  return (
    <div>
      <PageHeader title="Edit campaign request" />
      <Link
        href={`/dashboard/campaigns/requests/${id}`}
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to request
      </Link>
      <CampaignForm intake={data as CampaignIntakeRequest} />
    </div>
  );
}
