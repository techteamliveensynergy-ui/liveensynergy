import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { Campaign, CampaignPackage } from "@/lib/types";
import { CampaignAdminForm } from "../CampaignAdminForm";

export const metadata = { title: "Edit campaign · Admin" };

export default async function EditCampaignAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: campaignRow }, { data: packageRows }, { data: brandRows }] =
    await Promise.all([
      supabase.from("campaigns").select("*").eq("id", id).maybeSingle(),
      supabase.from("campaign_packages").select("*").order("sort_order"),
      supabase.from("brands").select("id, brand_name").order("brand_name"),
    ]);
  if (!campaignRow) notFound();

  return (
    <div>
      <PageHeader title="Edit campaign" />
      <Link
        href="/dashboard/admin/campaigns"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to campaigns
      </Link>
      <CampaignAdminForm
        packages={(packageRows ?? []) as CampaignPackage[]}
        brands={brandRows ?? []}
        campaign={campaignRow as Campaign}
      />
    </div>
  );
}
