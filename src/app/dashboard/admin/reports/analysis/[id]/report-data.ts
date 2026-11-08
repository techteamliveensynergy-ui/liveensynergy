import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisFigures } from "@/lib/analysis/figures";
import { uniqueCharts, type AnalysisNarrative } from "@/lib/analysis/narrative";
import { formatDate } from "@/lib/format";
import { campaignLabel } from "@/lib/campaign-requests";

export interface AnalysisReportRow {
  id: string;
  title: string;
  source_filename: string | null;
  row_count: number;
  dropped_columns: string[];
  instructions: string | null;
  figures: AnalysisFigures;
  narrative: AnalysisNarrative | null;
  model: string | null;
  status: "complete" | "figures_only";
  error: string | null;
  created_at: string;
  /** Published to the campaign's brand (0115). */
  shared_with_brand_at?: string | null;
  campaigns: { id: string; reference: string; campaign_name: string | null; brands: { brand_name: string } | null } | null;
}

export async function loadReport(supabase: SupabaseClient, id: string): Promise<AnalysisReportRow | null> {
  const { data } = await supabase
    .from("analysis_reports")
    .select("*, campaigns(id, reference, campaign_name, brands(brand_name))")
    .eq("id", id)
    .maybeSingle();
  const report = (data as AnalysisReportRow | null) ?? null;
  // Reports written before charts were de-duplicated read the same as new ones.
  if (report?.narrative?.sections) {
    report.narrative = { ...report.narrative, sections: uniqueCharts(report.narrative.sections) };
  }
  return report;
}

/** "Northwave · “Summer push” (CMP-00010) · 120 responses · 15 Oct 2026" */
export function reportSubtitle(r: AnalysisReportRow): string {
  return [
    r.campaigns?.brands?.brand_name,
    r.campaigns ? campaignLabel(r.campaigns) : null,
    `${r.row_count.toLocaleString("en-GB")} responses`,
    formatDate(r.created_at),
  ]
    .filter(Boolean)
    .join(" · ");
}
