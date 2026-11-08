import type { AnalysisFigures } from "@/lib/analysis/figures";
import type { AnalysisNarrative } from "@/lib/analysis/narrative";
import { FigureChart } from "@/app/dashboard/admin/reports/analysis/FigureChart";

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * An AI survey report as a printable article: the write-up with its charts,
 * then every figure as an appendix. Shared by the admin playground and the
 * brand's published-report page (0115), so the two always read the same.
 */
export function ReportArticle({
  report,
  subtitle,
  footer,
}: {
  report: {
    title: string;
    figures: AnalysisFigures;
    narrative: AnalysisNarrative | null;
  };
  subtitle: string;
  footer?: React.ReactNode;
}) {
  const byId = new Map(report.figures.columns.map((c) => [c.id, c]));
  const n = report.narrative;
  return (
      <article data-print-report className="space-y-6 bg-[var(--color-mist)]">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Live·En·Synergy survey report
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-[var(--color-ink)]">{report.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{subtitle}</p>
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

        {footer && <footer className="text-xs text-[var(--color-ink-soft)]">{footer}</footer>}
      </article>
  );
}
