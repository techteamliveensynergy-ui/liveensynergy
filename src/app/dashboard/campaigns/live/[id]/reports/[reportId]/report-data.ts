import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisFigures } from "@/lib/analysis/figures";
import { uniqueCharts, type AnalysisNarrative } from "@/lib/analysis/narrative";
import { formatDate } from "@/lib/format";

export interface BrandReport {
  id: string;
  campaign_id: string;
  title: string;
  row_count: number;
  figures: AnalysisFigures;
  narrative: AnalysisNarrative | null;
  model: string | null;
  shared_at: string;
  campaign_reference: string | null;
  campaign_name: string | null;
  brand_name: string | null;
}

/** A report the team published to this brand (0115) — null if it isn't theirs or isn't published. */
export async function loadBrandReport(supabase: SupabaseClient, reportId: string): Promise<BrandReport | null> {
  const { data, error } = await supabase.rpc("brand_analysis_report", { p_report_id: reportId });
  if (error || !data) return null;
  const report = data as BrandReport;
  if (report.narrative?.sections) {
    report.narrative = { ...report.narrative, sections: uniqueCharts(report.narrative.sections) };
  }
  return report;
}

export function brandReportSubtitle(r: BrandReport): string {
  return [
    r.brand_name,
    r.campaign_name ? `“${r.campaign_name}” (${r.campaign_reference})` : r.campaign_reference,
    `${r.row_count.toLocaleString("en-GB")} responses`,
    `Published ${formatDate(r.shared_at)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
