"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { ANALYSIS_MAX_BYTES, summariseCsv, type AnalysisFigures } from "@/lib/analysis/figures";
import {
  analysisModel,
  AnalysisError,
  isAnalysisConfigured,
  writeNarrative,
  type AnalysisContext,
  type AnalysisNarrative,
} from "@/lib/analysis/narrative";
import { campaignTitle } from "@/lib/campaign-requests";
import type { Campaign } from "@/lib/types";
import { CAMPAIGN_COLUMNS } from "@/lib/campaign-columns";

export interface AnalysisState {
  error?: string;
}

/**
 * Builds one playground report (14 Oct standup): parse + summarise the CSV in
 * code, add the campaign's context, ask OpenAI for the narrative, save. The
 * raw file is never stored. If OpenAI isn't configured or fails, the report is
 * still saved with its figures and the reason, so the upload isn't wasted.
 */
export async function createAnalysisReport(_prev: AnalysisState, formData: FormData): Promise<AnalysisState> {
  const { supabase } = await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to analyse." };
  if (file.size > ANALYSIS_MAX_BYTES) return { error: "That file is over 4 MB — export fewer columns or split it." };
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return { error: "Upload a .csv file." };

  const campaignId = String(formData.get("campaign_id") ?? "").trim() || null;
  const instructions = String(formData.get("instructions") ?? "").trim().slice(0, 2000) || null;

  // AI calls cost money: 20 reports an hour per admin is plenty.
  const { data: allowed } = await supabase.rpc("rate_limit_hit", {
    p_action: "analysis.create",
    p_window_seconds: 3600,
    p_max: 20,
  });
  if (allowed === false) return { error: "That's a lot of reports in an hour — try again shortly." };

  let figures: AnalysisFigures;
  try {
    figures = summariseCsv(await file.text());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The file couldn't be read as CSV." };
  }
  if (figures.columns.length === 0) {
    return { error: "No survey questions found in that file once personal and bookkeeping columns were removed." };
  }

  const context: AnalysisContext = {
    campaign: null,
    brand: null,
    event: null,
    eventDate: null,
    audience: null,
    objectives: null,
    instructions,
  };
  if (campaignId) {
    const [{ data: c }, { data: ev }] = await Promise.all([
      // Explicit columns: the package margin is the platform's own figure and
      // has no business in an AI prompt (#45).
      supabase
        .from("campaigns")
        .select(`${CAMPAIGN_COLUMNS}, brands(brand_name)`)
        .eq("id", campaignId)
        .maybeSingle<Campaign & { brands: { brand_name: string } | null }>(),
      supabase
        .from("sponsored_events")
        .select("name, event_date, location")
        .eq("campaign_id", campaignId)
        .in("status", ["confirmed", "completed"])
        .limit(1)
        .maybeSingle<{ name: string; event_date: string | null; location: string | null }>(),
    ]);
    if (!c) return { error: "That campaign wasn't found." };
    context.campaign = campaignTitle(c, c.reference);
    context.brand = c.brands?.brand_name ?? null;
    context.event = ev ? [ev.name, ev.location].filter(Boolean).join(", ") : null;
    context.eventDate = ev?.event_date ?? null;
    context.objectives = [c.description, c.expected_outcomes].filter(Boolean).join("\n\n").slice(0, 2000) || null;
  }

  let narrative: AnalysisNarrative | null = null;
  let error: string | null = null;
  if (!isAnalysisConfigured()) {
    error = "OpenAI isn't set up yet (OPENAI_API_KEY), so this report has the figures only.";
  } else {
    try {
      narrative = await writeNarrative(context, figures);
    } catch (err) {
      error =
        err instanceof AnalysisError
          ? `${err.message} The figures are below.`
          : "The AI analysis didn't complete, so this report has the figures only.";
      if (!(err instanceof AnalysisError)) console.error("[analysis] narrative failed", err);
    }
  }

  const title =
    String(formData.get("title") ?? "").trim().slice(0, 200) ||
    (context.campaign ? `${context.campaign} — survey analysis` : file.name.replace(/\.csv$/i, ""));

  const { data: row, error: insertError } = await supabase
    .from("analysis_reports")
    .insert({
      title,
      campaign_id: campaignId,
      source_filename: file.name.slice(0, 255),
      row_count: figures.rows,
      dropped_columns: figures.dropped,
      instructions,
      figures,
      narrative,
      model: narrative ? analysisModel() : null,
      status: narrative ? "complete" : "figures_only",
      error,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !row) return { error: insertError?.message ?? "The report couldn't be saved." };

  // Compliance & audit (0060): survey data left the platform for the AI call.
  await supabase.rpc("log_admin_action", {
    p_action: "analysis.create",
    p_target_type: "analysis_report",
    p_target_id: row.id,
    p_detail: {
      rows: figures.rows,
      dropped_columns: figures.dropped,
      sent_to_openai: !!narrative,
      campaign_id: campaignId,
    },
  });

  revalidatePath("/dashboard/admin/reports/analysis");
  redirect(`/dashboard/admin/reports/analysis/${row.id}`);
}

export async function deleteAnalysisReport(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await supabase.from("analysis_reports").delete().eq("id", id);
  revalidatePath("/dashboard/admin/reports/analysis");
  redirect("/dashboard/admin/reports/analysis");
}
