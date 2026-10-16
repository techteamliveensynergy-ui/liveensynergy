import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisFigures } from "@/lib/analysis/figures";
import type { AnalysisNarrative } from "@/lib/analysis/narrative";
import { formatDate } from "@/lib/format";

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
  campaigns: { id: string; reference: string; brands: { brand_name: string } | null } | null;
}

export async function loadReport(supabase: SupabaseClient, id: string): Promise<AnalysisReportRow | null> {
  const { data } = await supabase
    .from("analysis_reports")
    .select("*, campaigns(id, reference, brands(brand_name))")
    .eq("id", id)
    .maybeSingle();
  return (data as AnalysisReportRow | null) ?? null;
}

/** "Northwave · CMP-00010 · 120 responses · 15 Oct 2026" */
export function reportSubtitle(r: AnalysisReportRow): string {
  return [
    r.campaigns?.brands?.brand_name,
    r.campaigns?.reference,
    `${r.row_count.toLocaleString("en-GB")} responses`,
    formatDate(r.created_at),
  ]
    .filter(Boolean)
    .join(" · ");
}
