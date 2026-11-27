import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { campaignTitle } from "@/lib/campaign-requests";
import { isAnalysisConfigured } from "@/lib/analysis/narrative";
import type { Campaign } from "@/lib/types";
import { NewReportForm } from "./NewReportForm";
import { campaignLabel } from "@/lib/campaign-requests";

export const metadata = { title: "Analysis playground · Admin" };

interface ReportRow {
  id: string;
  title: string;
  row_count: number;
  status: "complete" | "figures_only";
  created_at: string;
  /** 'auto' = made when a survey closed (0127); absent before 0127. */
  source?: "manual" | "auto";
  shared_with_brand_at?: string | null;
  campaigns: { reference: string; campaign_name: string | null } | null;
}

/**
 * AI survey analysis playground (14 Oct standup): kept apart from the live
 * survey pipeline so heavy AI work never slows the app. Upload an anonymised
 * CSV, pick the campaign for context, get a written report with charts;
 * download it as PDF or Word.
 */
export default async function AnalysisPlaygroundPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: campaignRows }, { data: reportRows }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, reference, campaign_name, target_name, category, category_other, status, brands(brand_name)")
      .neq("status", "awaiting_payment")
      .order("created_at", { ascending: false }),
    supabase
      .from("analysis_reports")
      // "*" so a database without 0127's `source` still lists its reports.
      .select("*, campaigns(reference, campaign_name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const campaigns = ((campaignRows ?? []) as unknown as (Campaign & { brands: { brand_name: string } | null })[]).map(
    (c) => ({
      id: c.id,
      label: `${campaignTitle(c, c.reference)} · ${c.brands?.brand_name ?? "—"} (${c.reference})`,
    }),
  );
  const reports = (reportRows ?? []) as unknown as ReportRow[];

  return (
    <div className="space-y-6">
      <Link href="/dashboard/admin/reports" className="inline-block text-sm text-[var(--color-brand)]">
        ← Reporting &amp; analysis
      </Link>
      <PageHeader
        title="Analysis playground"
        subtitle="Campaign Performance Reports appear here automatically when a survey closes, as drafts to review. You can also upload survey results yourself, pick the campaign, and get a written report with charts — downloadable as PDF or Word."
      />

      <NewReportForm campaigns={campaigns} aiReady={isAnalysisConfigured()} />

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Reports</h2>
        {reports.length === 0 ? (
          <EmptyState icon="📈" title="No reports yet" body="Your first analysis will appear here." />
        ) : (
          <ul className="card divide-y divide-black/5">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/admin/reports/analysis/${r.id}`} className="font-semibold underline">
                    {r.title}
                  </Link>
                  {r.source === "auto" && (
                    <span className="chip bg-[var(--color-lavender)] text-xs">Automatic</span>
                  )}
                  {r.source === "auto" && !r.shared_with_brand_at && (
                    <span className="chip bg-[var(--color-gold)]/50 text-xs">Draft — needs review</span>
                  )}
                  {r.shared_with_brand_at && (
                    <span className="chip bg-[var(--color-sage)] text-xs">Published</span>
                  )}
                </span>
                <span className="text-xs text-[var(--color-ink-soft)]">
                  {r.campaigns ? `${campaignLabel(r.campaigns)} · ` : ""}
                  {r.row_count.toLocaleString("en-GB")} responses · {formatDateTime(r.created_at)}
                  {r.status === "figures_only" ? " · figures only" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
