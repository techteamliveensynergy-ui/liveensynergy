import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { CampaignIntakeRequest, CampaignPackage } from "@/lib/types";
import { CampaignAdminForm } from "../CampaignAdminForm";

export const metadata = { title: "New campaign · Admin" };

export default async function NewCampaignAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ from_intake?: string }>;
}) {
  await requireRole(["admin"]);
  const { from_intake } = await searchParams;
  const supabase = await createClient();

  const [{ data: packageRows }, { data: brandRows }, intakeResult] =
    await Promise.all([
      supabase
        .from("campaign_packages")
        .select("*")
        .order("sort_order"),
      supabase.from("brands").select("id, brand_name").order("brand_name"),
      from_intake
        ? supabase
            .from("campaign_intake_requests")
            .select("*")
            .eq("id", from_intake)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  if (from_intake && !intakeResult.data) notFound();

  return (
    <div>
      <PageHeader title="Create a campaign" />
      <Link
        href="/dashboard/admin/campaigns"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to campaigns
      </Link>
      <CampaignAdminForm
        packages={(packageRows ?? []) as CampaignPackage[]}
        brands={brandRows ?? []}
        intake={
          intakeResult.data
            ? (intakeResult.data as CampaignIntakeRequest)
            : undefined
        }
      />
    </div>
  );
}
