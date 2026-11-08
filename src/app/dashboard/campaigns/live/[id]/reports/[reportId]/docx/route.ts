import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/supabase/auth-user";
import { reportDocx } from "@/lib/analysis/docx";
import { brandReportSubtitle, loadBrandReport } from "../report-data";

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";

/** The published report as a Word file, for the brand that owns the campaign. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const supabase = await createClient();
  if (!(await sessionUser(supabase))) return new Response("Please sign in", { status: 401 });
  const { id, reportId } = await params;
  // brand_analysis_report() returns nothing unless it's published and this
  // caller's brand's (or the caller is an admin).
  const report = await loadBrandReport(supabase, reportId);
  if (!report || report.campaign_id !== id) return new Response("Report not found", { status: 404 });

  const buffer = await reportDocx({
    title: report.title,
    subtitle: brandReportSubtitle(report),
    figures: report.figures,
    narrative: report.narrative,
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slug(report.title)}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
