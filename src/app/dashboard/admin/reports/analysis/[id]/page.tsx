import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { ReportArticle } from "@/components/reports/ReportArticle";
import { deleteAnalysisReport, shareAnalysisReport } from "../actions";
import { formatDateTime } from "@/lib/format";
import { loadReport, reportSubtitle } from "./report-data";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Analysis report · Admin" };

/**
 * One playground report (14 Oct standup): the write-up with its charts on the
 * page, every figure in an appendix, and PDF / Word downloads. Charts are drawn
 * from figures computed in code (src/lib/analysis/figures.ts); the AI only
 * chose which to show.
 */
export default async function AnalysisReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ shared?: string; share_error?: string }>;
}) {
  await requireRole(["admin"]);
  const { id } = await params;
  const { shared, share_error: shareError } = await searchParams;
  const supabase = await createClient();
  const report = await loadReport(supabase, id);
  if (!report) notFound();


  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/admin/reports/analysis" className="text-sm text-[var(--color-brand)]">
          ← Analysis playground
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <a href={`/dashboard/admin/reports/analysis/${report.id}/docx`} className="btn btn-ghost text-sm">
            Download Word (.docx)
          </a>
        </div>
      </div>

      {report.error && (
        <p className="no-print rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm">{report.error}</p>
      )}

      <ReportArticle
        report={report}
        subtitle={reportSubtitle(report)}
        footer={
          <>
            {report.source_filename ? `From ${report.source_filename}. ` : ""}
            {report.dropped_columns.length > 0
              ? `Removed as personal before analysis: ${report.dropped_columns.join(", ")}. `
              : ""}
            {report.model ? `Written with ${report.model} from the figures above; every number is computed from the file.` : ""}
          </>
        }
      />

      {/* Publish to the brand (0115): only a reviewed report reaches a brand. */}
      <div className="no-print card p-5">
        <h2 className="font-semibold">Share with the brand</h2>
        {shareError && (
          <p role="alert" className="mt-2 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
            {shareError}
          </p>
        )}
        {shared === "1" && !shareError && (
          <p className="mt-2 rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">
            Published — the brand has been told and can read and download it from their campaign.
          </p>
        )}
        {report.shared_with_brand_at ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              Published to {report.campaigns?.brands?.brand_name ?? "the brand"} on{" "}
              {formatDateTime(report.shared_with_brand_at)}. They see the write-up and charts — not your instructions
              or the file name.
            </p>
            <form action={shareAnalysisReport}>
              <input type="hidden" name="id" value={report.id} />
              <input type="hidden" name="share" value="0" />
              <button type="submit" className="btn btn-ghost text-sm">Unpublish</button>
            </form>
          </div>
        ) : !report.campaigns ? (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            This report isn&apos;t linked to a campaign, so there&apos;s no brand to share it with.
          </p>
        ) : report.row_count < 5 ? (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            Brands only see results from 5 responses up — this report has {report.row_count}.
          </p>
        ) : (
          <form action={shareAnalysisReport} className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <input type="hidden" name="id" value={report.id} />
            <input type="hidden" name="share" value="1" />
            <p className="text-sm text-[var(--color-ink-soft)]">
              Read it through first. Publishing shows the write-up, charts and quotes to{" "}
              {report.campaigns.brands?.brand_name ?? "the brand"} on their campaign, with a Word download, and emails them.
            </p>
            <ConfirmSubmitButton
              label="Publish to brand…"
              className="btn btn-primary text-sm"
              title={`Publish “${report.title}” to ${report.campaigns.brands?.brand_name ?? "the brand"}?`}
              points={[
                "The brand sees the write-up, charts and the anonymous quotes in it — never your instructions, the file name or who answered.",
                "They're emailed and can download it as a Word document.",
                "You can unpublish it later.",
              ]}
              confirmLabel="Publish"
              pendingLabel="Publishing…"
            />
          </form>
        )}
      </div>

      <form action={deleteAnalysisReport} className="no-print">
        <input type="hidden" name="id" value={report.id} />
        <ConfirmSubmitButton
          label="Delete report…"
          className="btn btn-ghost text-sm"
          title="Delete this report?"
          points={["Remove the report and its figures. The original survey responses aren't affected."]}
          confirmLabel="Yes, delete"
          danger
        />
      </form>
    </div>
  );
}
