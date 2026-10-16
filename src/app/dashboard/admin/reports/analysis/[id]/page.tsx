import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { FigureChart } from "../FigureChart";
import { deleteAnalysisReport } from "../actions";
import { loadReport, reportSubtitle } from "./report-data";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Analysis report · Admin" };

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * One playground report (14 Oct standup): the write-up with its charts on the
 * page, every figure in an appendix, and PDF / Word downloads. Charts are drawn
 * from figures computed in code (src/lib/analysis/figures.ts); the AI only
 * chose which to show.
 */
export default async function AnalysisReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const supabase = await createClient();
  const report = await loadReport(supabase, id);
  if (!report) notFound();

  const byId = new Map(report.figures.columns.map((c) => [c.id, c]));
  const n = report.narrative;

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

      <article data-print-report className="space-y-6 bg-[var(--color-mist)]">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Live·En·Synergy survey report
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-[var(--color-ink)]">{report.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{reportSubtitle(report)}</p>
        </header>

        {n && (
          <>
            <section className="card print-avoid-break p-6">
              <h2 className="text-xl font-semibold">{n.headline}</h2>
              {paragraphs(n.summary).map((p, i) => (
                <p key={i} className="mt-3 text-[var(--color-ink)]">
                  {p}
                </p>
              ))}
            </section>

            {n.sections.map((s, i) => (
              <section key={i} className="card space-y-4 p-6">
                <h2 className="text-lg font-semibold">{s.heading}</h2>
                {paragraphs(s.body).map((p, k) => (
                  <p key={k} className="text-[var(--color-ink)]">
                    {p}
                  </p>
                ))}
                {s.charts.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {s.charts.map((cid) => {
                      const c = byId.get(cid);
                      return c ? <FigureChart key={cid} column={c} compact /> : null;
                    })}
                  </div>
                )}
              </section>
            ))}

            {n.recommendations.length > 0 && (
              <section className="card print-avoid-break p-6">
                <h2 className="text-lg font-semibold">Recommendations</h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-5">
                  {n.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}
            {n.caveats.length > 0 && (
              <section className="card print-avoid-break p-6">
                <h2 className="text-lg font-semibold">About the data</h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-[var(--color-ink-soft)]">
                  {n.caveats.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{n ? "Appendix: all figures" : "Figures"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {report.figures.columns.map((c) => (
              <FigureChart key={c.id} column={c} />
            ))}
          </div>
        </section>

        <footer className="text-xs text-[var(--color-ink-soft)]">
          {report.source_filename ? `From ${report.source_filename}. ` : ""}
          {report.dropped_columns.length > 0
            ? `Removed as personal before analysis: ${report.dropped_columns.join(", ")}. `
            : ""}
          {report.model ? `Written with ${report.model} from the figures above; every number is computed from the file.` : ""}
        </footer>
      </article>

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
