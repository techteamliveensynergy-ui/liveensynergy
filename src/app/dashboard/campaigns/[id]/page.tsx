import Link from "next/link";
import { notFound } from "next/navigation";
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

  if (!data) notFound();

  return (
    <div>
      <PageHeader title="Edit campaign request" />
      <Link
        href="/dashboard/campaigns"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to campaigns
      </Link>
      <CampaignForm intake={data as CampaignIntakeRequest} />
    </div>
  );
}
