import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { Campaign } from "@/lib/types";
import { CampaignForm } from "../CampaignForm";

export const metadata = { title: "Edit campaign" };

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

  const { data } = brand
    ? await supabase
        .from("campaigns")
        .select("*")
        .eq("id", id)
        .eq("brand_id", brand.id)
        .maybeSingle()
    : { data: null };

  if (!data) notFound();

  return (
    <div>
      <PageHeader title="Edit campaign" />
      <Link
        href="/dashboard/campaigns"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to campaigns
      </Link>
      <CampaignForm campaign={data as Campaign} />
    </div>
  );
}
