import Link from "next/link";
import { requireRole, profileCompleteness } from "@/lib/profile";
import { PageHeader } from "@/components/dashboard/ui";
import { ProfileCompleteness } from "@/components/dashboard/ProfileCompleteness";
import { CampaignForm } from "../CampaignForm";
import { createClient } from "@/lib/supabase/server";
import { loadDraft } from "@/lib/drafts";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { profile } = await requireRole(["brand"]);
  const { draft: draftId } = await searchParams;
  // Continuing a saved draft (#79); RLS keeps it to its owner.
  const draft = draftId ? await loadDraft(await createClient(), profile.id, "campaign_request", draftId) : null;
  const completeness = await profileCompleteness(profile);
  const blocked = completeness.blocking.length > 0;

  return (
    <div>
      <PageHeader title="Request a campaign" />
      <Link
        href="/dashboard/campaigns"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Campaign requests
      </Link>

      {/* Our team contacts the sponsor within 48 hours of a match — that needs
          a reachable brand profile before a campaign can be submitted. */}
      {blocked ? (
        <ProfileCompleteness completeness={completeness} />
      ) : (
        <>
          <ProfileCompleteness completeness={completeness} className="mb-5" />
          <CampaignForm draft={draft} />
        </>
      )}
    </div>
  );
}
