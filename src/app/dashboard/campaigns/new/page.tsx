import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { PageHeader } from "@/components/dashboard/ui";
import { CampaignForm } from "../CampaignForm";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  await requireRole(["brand"]);
  return (
    <div>
      <PageHeader title="Create a campaign" />
      <Link
        href="/dashboard/campaigns"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to campaigns
      </Link>
      <CampaignForm />
    </div>
  );
}
