import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, MetricTile, PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { campaignTitle } from "@/lib/campaign-requests";
import type { LiveCampaignSurvey } from "@/components/campaigns/LiveCampaignPanel";

export const metadata = { title: "Reporting & analysis" };

const SURVEY_KIND: Record<string, string> = {
  pre_event: "Pre-event survey",
  post_event: "Post-event survey",
};

interface CampaignRow {
  id: string;
  reference: string;
  campaign_name: string | null;
  target_name: string | null;
  category: string | null;
  category_other: string | null;
}

interface ResultsSummary {
  counted: number;
  min_responses: number;
  last_response_at: string | null;
}

/**
 * The brand's Reporting & analysis module (13 Oct client notes: sidebar
 * modules). Every survey across the brand's campaigns in one list, with its
 * response count and a link to the results — the same totals-only view
 * brand_survey_results() (0060) gives on each campaign page, so nothing per
 * person and nothing below the anonymity floor.
 */
export default async function BrandReportsPage() {
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase.from("brands").select("id").eq("profile_id", profile.id).maybeSingle();
  const { data: campaignRows } = brand
    ? await supabase
        .from("campaigns")
        .select("id, reference, campaign_name, target_name, category, category_other")
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: false })
    : { data: [] };
  const campaigns = (campaignRows ?? []) as CampaignRow[];

  const rows = (
    await Promise.all(
      campaigns.map(async (c) => {
        const { data } = await supabase.rpc("campaign_party_surveys", { p_campaign_id: c.id });
        const surveys = (data ?? []) as LiveCampaignSurvey[];
        return Promise.all(
          surveys.map(async (s) => {
            const { data: r } = await supabase.rpc("brand_survey_results", { p_template_id: s.id });
            return { campaign: c, survey: s, results: (r ?? null) as ResultsSummary | null };
          }),
        );
      }),
    )
  ).flat();

  const totalResponses = rows.reduce((t, r) => t + (r.results?.counted ?? 0), 0);
  const open = rows.filter((r) => r.survey.status === "published").length;

  return (
    <div>
      <PageHeader
        title="Reporting & analysis"
        subtitle="Results from every survey on your campaigns — totals and charts only, never names or individual answers."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <MetricTile label="Surveys" value={rows.length} hint={`${open} open now`} />
        <MetricTile label="Responses" value={totalResponses} hint="Across all your campaigns" />
        <MetricTile label="Campaigns" value={campaigns.length} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="📈"
          title="No survey results yet"
          body="Once our team publishes a survey for one of your campaigns, its results appear here as responses come in."
          cta={{ href: "/dashboard/campaigns/live", label: "Go to Campaigns live" }}
        />
      ) : (
        <div className="card divide-y divide-black/10">
          {rows.map(({ campaign, survey, results }) => {
            const counted = results?.counted ?? 0;
            const enough = results ? counted >= results.min_responses : false;
            return (
              <div key={survey.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold">{survey.title}</p>
                  <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
                    {SURVEY_KIND[survey.kind] ?? "Survey"} · {survey.status === "published" ? "open" : "closed"} ·{" "}
                    <Link href={`/dashboard/campaigns/live/${campaign.id}`} className="underline">
                      {campaignTitle(campaign, campaign.reference)}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                    {counted} response{counted === 1 ? "" : "s"}
                    {results?.last_response_at ? ` · latest ${formatDateTime(results.last_response_at)}` : ""}
                    {results && !enough ? ` · results unlock at ${results.min_responses}` : ""}
                  </p>
                </div>
                <Link href={`/dashboard/survey-results/${survey.id}`} className="btn btn-ghost text-sm">
                  View results
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
