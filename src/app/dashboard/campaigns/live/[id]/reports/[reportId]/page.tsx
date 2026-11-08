import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { ReportArticle } from "@/components/reports/ReportArticle";
import { PrintButton } from "@/app/dashboard/admin/reports/analysis/[id]/PrintButton";
import { brandReportSubtitle, loadBrandReport } from "./report-data";

export const metadata = { title: "Survey report" };

/**
 * A survey report the Live·En·Synergy team published to this brand (0115):
 * the write-up and charts, printable to PDF and downloadable as Word. Only
 * reports an admin has reviewed and published, with 5+ responses, reach here.
 */
export default async function BrandReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  await requireRole(["brand", "admin"]);
  const { id, reportId } = await params;
  const supabase = await createClient();
  const report = await loadBrandReport(supabase, reportId);
  if (!report || report.campaign_id !== id) notFound();

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/campaigns/live/${id}#reports`} className="text-sm text-[var(--color-brand)]">
          ← Back to the campaign
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <a href={`/dashboard/campaigns/live/${id}/reports/${report.id}/docx`} className="btn btn-ghost text-sm">
            Download Word (.docx)
          </a>
        </div>
      </div>
      <ReportArticle
        report={report}
        subtitle={brandReportSubtitle(report)}
        footer={
          <>
            Every figure is counted from the anonymous survey answers; nothing identifies who answered.
            {report.model ? " The write-up was drafted with AI from those figures and reviewed by our team." : ""}
          </>
        }
      />
    </div>
  );
}
