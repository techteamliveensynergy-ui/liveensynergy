import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { surveyCapacity } from "@/lib/survey-capacity";
import { EmptyState, MetricTile, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  averageSeconds,
  countedResponses,
  DURATION_BUCKETS,
  EMPTY_TEMPLATE_STATS,
  formatDuration,
  formatPct,
  medianBucket,
  pct,
  TEXT_TYPES,
  type SurveyDailyStat,
  type SurveyQuestionStats,
  type SurveyTemplateStats,
} from "@/lib/survey-results";
import type { SurveyQuestion } from "@/lib/types";
import { recalculateSurveyResults } from "../../actions";
import { BarRow, QuestionResultCard } from "@/components/surveys/QuestionResultCard";

export const metadata = { title: "Survey results · Admin" };

type Question = Pick<SurveyQuestion, "id" | "order_index" | "type" | "prompt" | "help_text" | "options" | "config">;

interface TemplateRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  is_public: boolean;
  expected_participants: number | null;
  campaigns: { reference: string; brands: { brand_name: string } | null } | null;
}

interface TextAnswer {
  reference: string;
  submitted_at: string;
  answer: string;
}

const TREND_DAYS = 30;

/** YYYY-MM-DD for "today" in London, then the previous days back from it. */
function trendDays(): string[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const base = new Date(`${today}T00:00:00Z`).getTime();
  return Array.from({ length: TREND_DAYS }, (_, i) =>
    new Date(base - (TREND_DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

export default async function SurveyResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recalculated?: string }>;
}) {
  await requireRole(["admin"]);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const days = trendDays();

  const [{ data: template }, { data: questionRows }, { data: tStats }, { data: qStatRows }, { data: dailyRows }, capacity] =
    await Promise.all([
      supabase
        .from("survey_templates")
        .select("id, title, kind, status, is_public, expected_participants, campaigns(reference, brands(brand_name))")
        .eq("id", id)
        .maybeSingle<TemplateRow>(),
      supabase
        .from("survey_questions")
        .select("id, order_index, type, prompt, help_text, options, config")
        .eq("template_id", id)
        .neq("type", "hidden_field")
        .order("order_index"),
      supabase.from("survey_template_stats").select("*").eq("template_id", id).maybeSingle<SurveyTemplateStats>(),
      supabase.from("survey_question_stats").select("*").eq("template_id", id),
      supabase
        .from("survey_daily_stats")
        .select("day, responses")
        .eq("template_id", id)
        .gte("day", days[0])
        .order("day"),
      surveyCapacity(supabase, id),
    ]);
  if (!template) notFound();

  const questions = (questionRows ?? []) as Question[];
  const stats = { ...EMPTY_TEMPLATE_STATS, ...(tStats ?? {}) };
  const qStats = new Map(((qStatRows ?? []) as SurveyQuestionStats[]).map((s) => [s.question_id, s]));
  const daily = new Map(((dailyRows ?? []) as SurveyDailyStat[]).map((d) => [d.day, d.responses]));
  const counted = countedResponses(stats);

  // Open-text answers: the latest few per question (each a small, indexed query).
  const textQuestions = questions.filter((q) => TEXT_TYPES.includes(q.type));
  const textAnswers = new Map<string, TextAnswer[]>(
    await Promise.all(
      textQuestions.map(async (q) => {
        const { data } = await supabase.rpc("survey_text_answers", { p_question_id: q.id, p_limit: 5, p_offset: 0 });
        return [q.id, (data ?? []) as TextAnswer[]] as const;
      }),
    ),
  );

  const avgDuration = averageSeconds(Number(stats.duration_sum_seconds), stats.duration_count);
  const typical = medianBucket(stats.duration_buckets ?? {});
  const limit = capacity?.response_limit ?? null;
  const trendMax = Math.max(1, ...days.map((d) => daily.get(d) ?? 0));
  const trendTotal = days.reduce((t, d) => t + (daily.get(d) ?? 0), 0);
  const exportHref = (file: string, rejected = false) =>
    `/dashboard/admin/surveys/${id}/export?file=${file}${rejected ? "&include=rejected" : ""}`;

  return (
    <div>
      <PageHeader
        title={`Results · ${template.title}`}
        subtitle={[
          template.kind === "pre_event" ? "Pre-event survey" : "Post-event survey",
          template.is_public ? "public link" : null,
          template.campaigns
            ? `${template.campaigns.reference}${template.campaigns.brands ? ` · ${template.campaigns.brands.brand_name}` : ""}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={<StatusBadge status={template.status} />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/dashboard/admin/surveys" className="text-[var(--color-brand)]">
          ← All surveys
        </Link>
        <Link href={`/dashboard/admin/surveys/responses`} className="text-[var(--color-brand-dark)] underline">
          Review queue
        </Link>
      </div>

      {sp.recalculated && (
        <p role="status" className="mb-4 rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          Recalculated from every response.
        </p>
      )}

      <section className="card mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Download the data</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
              Anonymised: each person is a respondent ID (RSP-…) and a person ID (PER-…, the same across this
              person&apos;s other surveys) — no names, emails, phone numbers or dates of birth. Open-text answers are
              exported as typed, so check them before sharing outside the team.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={exportHref("responses")} className="btn btn-primary text-sm">
            Responses (one row per person)
          </a>
          <a href={exportHref("answers")} className="btn btn-ghost text-sm">
            Answers (one row per answer)
          </a>
          <a href={exportHref("summary")} className="btn btn-ghost text-sm">
            Question summary
          </a>
        </div>
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Rejected responses are left out.{" "}
          <a href={exportHref("responses", true)} className="underline">
            Download including rejected (audit)
          </a>
        </p>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Responses counted"
          value={counted}
          hint={`${stats.responses_total} received · ${stats.reject_count} rejected`}
        />
        <MetricTile
          label="Against target"
          value={limit ? formatPct(pct(counted, limit)) : "—"}
          hint={
            limit
              ? `${counted} of ${limit}${template.expected_participants ? ` (${template.expected_participants} expected + buffer)` : " (from the order form)"}${capacity?.is_full ? " · closed" : ""}`
              : "No target — set expected participants on the survey or the order form"
          }
        />
        <MetricTile
          label="Average time to complete"
          value={formatDuration(avgDuration)}
          hint={typical ? `Most typical: ${typical}` : "No responses yet"}
        />
        <MetricTile
          label="Quality check"
          value={`${stats.pass_count} passed`}
          hint={`${stats.review_count} in review · ${stats.pending_count} pending · ${stats.reject_count} rejected`}
        />
      </div>

      {counted === 0 ? (
        <EmptyState
          icon="📊"
          title="No responses yet"
          body="Results fill in here as responses arrive — each one updates the numbers straight away."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="font-semibold">Responses per day</h2>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                Last {TREND_DAYS} days · {trendTotal} response{trendTotal === 1 ? "" : "s"}
                {stats.last_response_at ? ` · latest ${formatDateTime(stats.last_response_at)}` : ""}
              </p>
              <div className="mt-4 flex h-32 items-end gap-[2px]" role="img" aria-label={`Responses per day, last ${TREND_DAYS} days`}>
                {days.map((d) => {
                  const n = daily.get(d) ?? 0;
                  return (
                    <div
                      key={d}
                      className="flex h-full flex-1 items-end"
                      title={`${formatDate(d)}: ${n} response${n === 1 ? "" : "s"}`}
                    >
                      <div
                        className={`w-full rounded-t-[4px] ${n > 0 ? "bg-[var(--color-brand)]" : "bg-black/5"}`}
                        style={{ height: n > 0 ? `${Math.max((n / trendMax) * 100, 4)}%` : "2px" }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-xs text-[var(--color-ink-soft)]">
                <span>{formatDate(days[0])}</span>
                <span>Today</span>
              </div>
            </section>

            <section className="card p-5">
              <h2 className="font-semibold">Time to complete</h2>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                How long each counted response took, start to submit. A survey that runs long here is a candidate for
                fewer questions.
              </p>
              <div className="mt-4 space-y-2.5">
                {DURATION_BUCKETS.map((b) => {
                  const n = stats.duration_buckets?.[b.key] ?? 0;
                  const share = pct(n, stats.duration_count);
                  return <BarRow key={b.key} label={b.label} value={`${n} · ${formatPct(share)}`} share={share} />;
                })}
              </div>
            </section>
          </div>

          <h2 className="mb-3 text-lg font-semibold">Question by question</h2>
          <div className="space-y-4">
            {questions.map((q, i) => (
              <QuestionResultCard
                key={q.id}
                index={i}
                q={q}
                s={qStats.get(q.id)}
                counted={counted}
                textAnswers={textAnswers.get(q.id)}
                moreTextHref={exportHref("answers")}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4 text-xs text-[var(--color-ink-soft)]">
        <span>
          Live: every response updates these numbers as it arrives. Rejected responses are left out; pending and
          in-review ones count until a decision.
          {tStats ? ` Last updated ${formatDateTime(tStats.updated_at)}.` : ""}
        </span>
        <form action={recalculateSurveyResults}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="btn btn-ghost text-xs">
            Recalculate from every response
          </button>
        </form>
      </div>
    </div>
  );
}
