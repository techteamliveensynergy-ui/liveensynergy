import Link from "next/link";
import { requireRole, profileCompleteness } from "@/lib/profile";
import { PageHeader } from "@/components/dashboard/ui";
import { ProfileCompleteness } from "@/components/dashboard/ProfileCompleteness";
import { CampaignForm, type RequestPackage } from "../CampaignForm";
import { createClient } from "@/lib/supabase/server";
import { loadDraft } from "@/lib/drafts";

export const metadata = { title: "New campaign" };

/** Active packages a brand can ask for on the request form (Testing notes 7 Nov). */
async function requestPackages(supabase: Awaited<ReturnType<typeof createClient>>): Promise<RequestPackage[]> {
  const { data } = await supabase
    .from("campaign_packages")
    .select("id, name, description, participant_count, price_gbp, is_custom_price, min_price_gbp")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []) as RequestPackage[];
}


export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { profile } = await requireRole(["brand"]);
  const { draft: draftId } = await searchParams;
  // Continuing a saved draft (#79); RLS keeps it to its owner.
  const supabase = await createClient();
  const [draft, packages] = await Promise.all([
    draftId ? loadDraft(supabase, profile.id, "campaign_request", draftId) : Promise.resolve(null),
    requestPackages(supabase),
  ]);
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
          <CampaignForm draft={draft} packages={packages} />
        </>
      )}
    </div>
  );
}
