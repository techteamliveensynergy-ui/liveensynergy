import {
  averageSeconds,
  CHOICE_TYPES,
  choiceBars,
  formatDuration,
  formatPct,
  meanAndSd,
  pct,
  QUESTION_TYPE_LABELS,
  rankingRows,
  scaleBars,
  TEXT_TYPES,
  type SurveyQuestionStats,
} from "@/lib/survey-results";
import { formatDate } from "@/lib/format";
import type { SurveyQuestion } from "@/lib/types";

/**
 * One question's results block, shared by the admin results page and the
 * brand's results page. It only draws what it's given: the brand page never
 * passes open-text answers or attention checks (brand_survey_results(), 0060,
 * doesn't return them), so the same card can't leak them.
 */

export type ResultQuestion = Pick<SurveyQuestion, "id" | "type" | "prompt" | "options" | "config">;
export type ResultStats = Partial<
  Pick<
    SurveyQuestionStats,
    "answered_count" | "time_count" | "time_sum_ms" | "num_count" | "num_sum" | "num_sumsq" | "na_count" | "option_counts" | "rank_sums"
  >
>;

/** One labelled horizontal bar: label and figures on a line, the bar beneath. */
export function BarRow({ label, value, share, title }: { label: string; value: string; share: number; title?: string }) {
  return (
    <div className="space-y-1" title={title ?? `${label}: ${value}`}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 break-words text-[var(--color-ink)]">{label}</span>
        <span className="shrink-0 tabular-nums text-[var(--color-ink-soft)]">{value}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-black/5">
        <div
          className="h-2.5 rounded-full bg-[var(--color-brand)]"
          style={{ width: `${Math.max(Math.min(share, 100), share > 0 ? 1.5 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export function QuestionResultCard({
  index,
  q,
  s,
  counted,
  textAnswers,
  moreTextHref,
}: {
  index: number;
  q: ResultQuestion;
  s: ResultStats | undefined;
  counted: number;
  textAnswers?: { reference: string; submitted_at: string; answer: string }[];
  moreTextHref?: string;
}) {
  const answered = s?.answered_count ?? 0;
  const avgTime = s && s.time_count != null && s.time_sum_ms != null ? averageSeconds(s.time_sum_ms / 1000, s.time_count) : null;
  return (
<section className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        Q{index + 1} · {QUESTION_TYPE_LABELS[q.type]}
      </p>
      <h3 className="mt-1 font-semibold">{q.prompt || "Untitled question"}</h3>
      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
        {answered} answered ({formatPct(pct(answered, counted))} of responses)
        {avgTime != null ? ` · about ${formatDuration(avgTime)} on this question` : ""}
      </p>

      <div className="mt-4 space-y-2.5">
        {CHOICE_TYPES.includes(q.type) && (
          <>
            {choiceBars(q, s?.option_counts ?? {}, answered).map((b) => (
              <BarRow key={b.key} label={b.label} value={`${b.count} · ${formatPct(b.share)}`} share={b.share} />
            ))}
            {q.type === "multiple_choice" && (
              <p className="text-xs text-[var(--color-ink-soft)]">
                People could pick more than one, so these add up to more than 100%.
              </p>
            )}
            {q.type === "attention_check" && typeof q.config?.expected_answer === "string" && answered > 0 && (
              <p className="text-xs text-[var(--color-ink-soft)]">
                Passed the check:{" "}
                {formatPct(pct(s?.option_counts?.[q.config.expected_answer as string] ?? 0, answered))}
              </p>
            )}
          </>
        )}

        {q.type === "scale" && (() => {
          const m = s ? meanAndSd(s.num_count ?? 0, Number(s.num_sum ?? 0), Number(s.num_sumsq ?? 0)) : null;
          return (
            <>
              {m && (
                <p className="text-sm">
                  Average <span className="font-semibold">{m.mean.toFixed(1)}</span>
                  {q.config?.max != null ? ` out of ${q.config.max}` : ""}
                  <span className="text-[var(--color-ink-soft)]"> · spread ±{m.sd.toFixed(1)}</span>
                </p>
              )}
              {scaleBars(q, s?.option_counts ?? {}, s?.num_count ?? 0).map((b) => (
                <BarRow key={b.key} label={b.label} value={`${b.count} · ${formatPct(b.share)}`} share={b.share} />
              ))}
              {!!s?.na_count && (
                <p className="text-xs text-[var(--color-ink-soft)]">
                  {s.na_count} chose &ldquo;{(q.config?.na_label as string) || "Not applicable"}&rdquo; — not
                  included in the average.
                </p>
              )}
            </>
          );
        })()}

        {q.type === "number" && (() => {
          const m = s ? meanAndSd(s.num_count ?? 0, Number(s.num_sum ?? 0), Number(s.num_sumsq ?? 0)) : null;
          return m ? (
            <p className="text-sm">
              Average <span className="font-semibold">{m.mean.toFixed(1)}</span>
              <span className="text-[var(--color-ink-soft)]">
                {" "}
                · spread ±{m.sd.toFixed(1)} · {s?.num_count} answers
              </span>
            </p>
          ) : (
            <p className="text-sm text-[var(--color-ink-soft)]">No answers yet.</p>
          );
        })()}

        {q.type === "ranking" && (() => {
          const rows = rankingRows(q, s?.option_counts ?? {}, s?.rank_sums ?? {});
          const n = Math.max(rows.length, 2);
          return (
            <>
              <p className="text-xs text-[var(--color-ink-soft)]">Average position — 1 is ranked top. Longer bar = ranked higher.</p>
              {rows.map((r) => (
                <BarRow
                  key={r.key}
                  label={r.label}
                  value={r.avg != null ? `avg ${r.avg.toFixed(1)}` : "—"}
                  share={r.avg != null ? ((n - r.avg) / (n - 1)) * 100 : 0}
                />
              ))}
            </>
          );
        })()}

        {TEXT_TYPES.includes(q.type) && (() => {
          const list = textAnswers ?? [];
          return list.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">No written answers yet.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {list.map((a) => (
                  <li key={a.reference} className="rounded-xl bg-[var(--color-mist)] px-3 py-2 text-sm">
                    <p className="whitespace-pre-line break-words">{a.answer}</p>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      {a.reference} · {formatDate(a.submitted_at)}
                    </p>
                  </li>
                ))}
              </ul>
              {answered > list.length && (
                <p className="text-xs text-[var(--color-ink-soft)]">
                  Latest {list.length} of {answered}.{" "}
                  <a href={moreTextHref ?? "#"} className="underline">
                    Download all answers
                  </a>
                </p>
              )}
            </>
          );
        })()}
      </div>
    </section>
  );
}
