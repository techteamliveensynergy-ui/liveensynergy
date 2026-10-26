import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { CampaignPackage } from "@/lib/types";
import { PackageForm } from "../PackageForm";

export const metadata = { title: "Edit package · Admin" };

export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin"]);
  const supabase = await createClient();
  // Admin RPC, so the margin comes back (0084, GitHub #43).
  const { data } = await supabase
    .rpc("admin_campaign_packages")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <div>
      <PageHeader title="Edit package" />
      <Link
        href="/dashboard/admin/packages"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to packages
      </Link>
      <PackageForm pkg={data as CampaignPackage} />
    </div>
  );
}
