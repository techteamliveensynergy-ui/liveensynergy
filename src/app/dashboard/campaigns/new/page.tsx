import Link from "next/link";
import { requireRole, profileCompleteness } from "@/lib/profile";
import { PageHeader } from "@/components/dashboard/ui";
import { ProfileCompleteness } from "@/components/dashboard/ProfileCompleteness";
import { CampaignForm } from "../CampaignForm";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const { profile } = await requireRole(["brand"]);
  const completeness = await profileCompleteness(profile);
  const blocked = completeness.blocking.length > 0;

  return (
    <div>
      <PageHeader title="Create a campaign" />
      <Link
        href="/dashboard/campaigns"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to campaigns
      </Link>

      {/* Our team contacts the sponsor within 48 hours of a match — that needs
          a reachable brand profile before a campaign can be submitted. */}
      {blocked ? (
        <ProfileCompleteness completeness={completeness} />
      ) : (
        <>
          <ProfileCompleteness completeness={completeness} className="mb-5" />
          <CampaignForm />
        </>
      )}
    </div>
  );
}
