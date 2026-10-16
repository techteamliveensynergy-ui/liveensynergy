import { requireAdmin } from "@/lib/profile";
import { reportDocx } from "@/lib/analysis/docx";
import { loadReport, reportSubtitle } from "../report-data";

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";

/** The report as a Word file — edit it in Word, or upload it to Google Drive
 *  and open it with Google Docs. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const report = await loadReport(supabase, id);
  if (!report) return new Response("Report not found", { status: 404 });

  const buffer = await reportDocx({
    title: report.title,
    subtitle: reportSubtitle(report),
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
