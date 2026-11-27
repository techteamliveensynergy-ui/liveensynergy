import type { AnalysisFigures } from "@/lib/analysis/figures";
import type { AnalysisNarrative } from "@/lib/analysis/narrative";
import { FigureChart } from "@/app/dashboard/admin/reports/analysis/FigureChart";
import { measurementTiles, type CampaignReportMeta } from "@/lib/analysis/campaign-report";
import { formatDate } from "@/lib/format";

/** Measurement + before/after — the code-computed half of a Campaign Performance Report (0127). */
function MeasurementBlock({ meta }: { meta: CampaignReportMeta }) {
  const c = meta.comparison;
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  return (
    <>
      <section className="card print-avoid-break p-6" data-testid="report-measurement">
        <h2 className="text-lg font-semibold">Measurement</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {measurementTiles(meta.measurement).map((t) => (
            <div key={t.label} className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
              <dt className="text-xs text-[var(--color-ink-soft)]">{t.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold">{t.value}</dd>
              {t.hint && <dd className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{t.hint}</dd>}
            </div>
          ))}
        </dl>
      </section>
      {c && c.items.length > 0 && (
        <section className="card space-y-4 p-6" data-testid="report-comparison">
          <div>
            <h2 className="text-lg font-semibold">Before and after the event</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              The same questions in “{c.pre_title}” ({c.pre_responses} responses) and this survey ({c.post_responses}{" "}
              responses). Two groups of respondents side by side, not the same people tracked over time.
            </p>
          </div>
          {c.items.map((item) => (
            <div key={item.question} className="print-avoid-break">
              <h3 className="text-sm font-semibold">{item.question}</h3>
              {item.kind === "number" ? (
                <p className="mt-1 text-sm">
                  Average before: <strong>{item.pre_mean}</strong> · after: <strong>{item.post_mean}</strong>
                </p>
              ) : (
                <table className="mt-2 w-full text-left text-xs">
                  <thead className="text-[var(--color-ink-soft)]">
                    <tr>
                      <th className="py-1 font-medium">Answer</th>
                      <th className="py-1 text-right font-medium">Before</th>
                      <th className="py-1 text-right font-medium">After</th>
                      <th className="py-1 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(item.rows ?? []).map((r) => (
                      <tr key={r.label} className="border-t border-black/5">
                        <td className="py-1">{r.label}</td>
                        <td className="py-1 text-right tabular-nums">{r.pre_pct}%</td>
                        <td className="py-1 text-right tabular-nums">{r.post_pct}%</td>
                        <td className="py-1 text-right tabular-nums">{signed(r.change_pp)} pts</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          {(c.unmatched_pre.length > 0 || c.unmatched_post.length > 0) && (
            <p className="text-xs text-[var(--color-ink-soft)]">
              Asked in only one of the two surveys, so not compared:{" "}
              {[...c.unmatched_pre, ...c.unmatched_post].map((q) => q.replace(/^Q\d+\.\s*/, "")).join("; ")}.
            </p>
          )}
        </section>
      )}
    </>
  );
}

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
  const meta = report.figures.report?.format ? report.figures.report : null;
  return (
      <article data-print-report className="space-y-6 bg-[var(--color-mist)]">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Live·En·Synergy survey report
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-[var(--color-ink)]">{report.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{subtitle}</p>
          {meta && (
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="report-cover">
              {(
                [
                  ["Brand", meta.cover.brand],
                  ["Campaign", meta.cover.campaign && `${meta.cover.campaign}${meta.cover.campaign_reference ? ` (${meta.cover.campaign_reference})` : ""}`],
                  ["Event", meta.cover.event && `${meta.cover.event}${meta.cover.event_date ? ` · ${formatDate(meta.cover.event_date)}` : ""}`],
                  ["Venue", meta.cover.venue],
                  ["Survey", `${meta.cover.survey_title} (${meta.cover.survey_kind === "pre_event" ? "pre-event" : "post-event"})`],
                  [
                    "Responses received",
                    meta.cover.first_response && meta.cover.last_response
                      ? `${formatDate(meta.cover.first_response)} – ${formatDate(meta.cover.last_response)}`
                      : null,
                  ],
                ] as const
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-[var(--color-ink-soft)]">{k}:</dt>
                    <dd className="text-[var(--color-ink)]">{v}</dd>
                  </div>
                ))}
            </dl>
          )}
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

            {meta && <MeasurementBlock meta={meta} />}

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

        {/* No write-up (under 5 responses, or the AI failed): the measured
            figures still lead. */}
        {!n && meta && <MeasurementBlock meta={meta} />}
        {!n && meta && meta.notes.length > 0 && (
          <section className="card print-avoid-break p-6">
            <h2 className="text-lg font-semibold">About the data</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-[var(--color-ink-soft)]">
              {meta.notes.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
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
