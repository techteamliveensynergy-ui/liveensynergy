import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/profile";
import { CSV_BOM } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * The two inputs an automatic survey report was made from (0127, C1):
 * ?file=csv  responses.csv — the anonymised one-row-per-respondent file, passed responses only
 * ?file=json context.json  — survey, campaign, brand, event and measurement
 * Admin-only (analysis_report_inputs has an admin read policy only); every
 * download is recorded in the audit log, like any other survey export.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const file = new URL(request.url).searchParams.get("file") === "json" ? "json" : "csv";

  const { data } = await supabase
    .from("analysis_report_inputs")
    .select("context, responses_csv, analysis_reports(title)")
    .eq("report_id", id)
    .maybeSingle<{ context: unknown; responses_csv: string; analysis_reports: { title: string } | null }>();
  if (!data) return new Response("No inputs stored for this report", { status: 404 });

  const { error: logError } = await supabase.rpc("log_admin_action", {
    p_action: "survey_report.inputs_download",
    p_target_type: "analysis_report",
    p_target_id: id,
    p_detail: { file },
  });
  if (logError) console.error("audit log write failed (survey_report.inputs_download)", logError.message);

  const base =
    (data.analysis_reports?.title ?? "survey-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) ||
    "survey-report";
  if (file === "json") {
    return new Response(JSON.stringify(data.context, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}-context.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(CSV_BOM + data.responses_csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-responses.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
