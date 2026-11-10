import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, MetricTile, PageHeader } from "@/components/dashboard/ui";
import { formatDate, formatDateTime } from "@/lib/format";
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

interface PublishedReport {
  id: string;
  campaign_id: string;
  title: string;
  row_count: number;
  shared_at: string;
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

  // The brand row and the written reports the team has published to this brand
  // (0115) don't depend on each other. Before 0115 the call errors → none.
  const [{ data: brand }, { data: reportData }] = await Promise.all([
    supabase.from("brands").select("id").eq("profile_id", profile.id).maybeSingle(),
    supabase.rpc("brand_analysis_reports", { p_campaign_id: null }),
  ]);
  const reports = (reportData ?? []) as PublishedReport[];
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
        subtitle="Written reports and survey results for your campaigns — totals and charts only, never names or individual answers."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <MetricTile label="Surveys" value={rows.length} hint={`${open} open now`} />
        <MetricTile label="Responses" value={totalResponses} hint="Across all your campaigns" />
        <MetricTile label="Campaigns" value={campaigns.length} />
      </div>

      {/* The written, AI-assisted report an admin has reviewed and published —
          the thing "reporting" means beyond totals (QA 10 Nov: brands couldn't
          find it). */}
      <section id="written-reports" className="card mb-6 scroll-mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Written survey reports</h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            None published yet. Once enough responses are in, our team writes up what your audience told you — the
            findings, charts, quotes and recommendations — checks it, and publishes it here. We&apos;ll email you when
            it&apos;s ready, and you can print it or download it as a Word document.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reports.map((r) => {
              const c = campaigns.find((x) => x.id === r.campaign_id);
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm"
                >
                  <span>
                    <span className="font-semibold">{r.title}</span>
                    <span className="text-[var(--color-ink-soft)]">
                      {c ? ` · ${campaignTitle(c, c.reference)}` : ""} · {r.row_count} responses · published{" "}
                      {formatDate(r.shared_at)}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Link href={`/dashboard/campaigns/live/${r.campaign_id}/reports/${r.id}`} className="btn btn-primary text-xs">
                      Read report
                    </Link>
                    <a href={`/dashboard/campaigns/live/${r.campaign_id}/reports/${r.id}/docx`} className="btn btn-ghost text-xs">
                      Word
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
