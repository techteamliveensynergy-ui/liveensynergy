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
import { recalculateSurveyResults, requestSurveyReport } from "../../actions";
import { skipDescription } from "@/lib/survey-logic";
import { BarRow, QuestionResultCard } from "@/components/surveys/QuestionResultCard";
import { campaignLabel } from "@/lib/campaign-requests";

export const metadata = { title: "Survey results · Admin" };

type Question = Pick<SurveyQuestion, "id" | "order_index" | "type" | "prompt" | "help_text" | "options" | "config">;

interface TemplateRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  is_public: boolean;
  expected_participants: number | null;
  campaigns: { reference: string; campaign_name: string | null; brands: { brand_name: string } | null } | null;
}

interface TextAnswer {
  reference: string;
  submitted_at: string;
  answer: string;
  /** 0094 (#54); absent on a database without it. */
  contains_pii?: boolean;
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
  searchParams: Promise<{ recalculated?: string; report?: string }>;
}) {
  await requireRole(["admin"]);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const days = trendDays();

  const [{ data: template }, { data: questionRows }, { data: tStats }, { data: qStatRows }, { data: dailyRows }, capacity, { data: reachData }] =
    await Promise.all([
      supabase
        .from("survey_templates")
        .select("id, title, kind, status, is_public, expected_participants, campaigns(reference, campaign_name, brands(brand_name))")
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
      supabase.rpc("survey_question_reach", { p_template_id: id }),
    ]);
  if (!template) notFound();

  // Extra responses (0131): over the participant limit, and who has / hasn't got
  // a code. Without 0131 the call errors and the tiles stay hidden.
  const { data: codeSummaryRows } = await supabase.rpc("survey_code_summary", { p_template_id: id });
  const codeSummary = ((codeSummaryRows ?? []) as {
    within_limit: number;
    over_limit: number;
    with_code: number;
    without_code: number;
  }[])[0];

  const questions = (questionRows ?? []) as Question[];
  const stats = { ...EMPTY_TEMPLATE_STATS, ...(tStats ?? {}) };
  const qStats = new Map(((qStatRows ?? []) as SurveyQuestionStats[]).map((s) => [s.question_id, s]));
  const daily = new Map(((dailyRows ?? []) as SurveyDailyStat[]).map((d) => [d.day, d.responses]));
  const counted = countedResponses(stats);
  // Null when the survey has no skip logic — every question reached everyone.
  const reach = (reachData ?? null) as Record<string, number> | null;

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

  // What respondents typed for "Other — please specify" (FB-00029): the
  // latest few per question that offers it. Admin-only — admins read
  // survey_answers directly; rejected responses are left out, like the
  // open-text answers above.
  const otherQuestions = questions.filter((q) => q.config?.allow_other);
  const otherAnswers = new Map<string, TextAnswer[]>(
    await Promise.all(
      otherQuestions.map(async (q) => {
        const { data } = await supabase
          .from("survey_answers")
          .select("other_text, survey_responses!inner(reference, submitted_at, quality_status)")
          .eq("question_id", q.id)
          .not("other_text", "is", null)
          .neq("survey_responses.quality_status", "reject")
          .order("submitted_at", { ascending: false, referencedTable: "survey_responses" })
          .limit(10);
        const rows = (data ?? []) as unknown as {
          other_text: string;
          survey_responses: { reference: string; submitted_at: string } | null;
        }[];
        return [
          q.id,
          rows.map((r) => ({
            reference: r.survey_responses?.reference ?? "",
            submitted_at: r.survey_responses?.submitted_at ?? "",
            answer: r.other_text,
          })),
        ] as const;
      }),
    ),
  );

  // Automatic Campaign Performance Reports for this survey (0127). A database
  // without 0127 reads as "none yet".
  const [{ data: jobRows }, { data: autoReports }] = await Promise.all([
    supabase
      .from("survey_report_jobs")
      .select("id, status, outcome, close_reason, closed_at, hold_until, last_error, report_id, created_at")
      .eq("template_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("analysis_reports")
      .select("id, title, status, row_count, shared_with_brand_at, created_at")
      .eq("survey_template_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const jobs = (jobRows ?? []) as {
    id: string;
    status: string;
    outcome: string | null;
    close_reason: string;
    closed_at: string;
    hold_until: string | null;
    last_error: string | null;
    report_id: string | null;
    created_at: string;
  }[];
  const reports = (autoReports ?? []) as {
    id: string;
    title: string;
    status: string;
    row_count: number;
    shared_with_brand_at: string | null;
    created_at: string;
  }[];
  const pendingJob = jobs.find((j) => j.status === "queued" || j.status === "running");

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
            ? `${campaignLabel(template.campaigns)}${template.campaigns.brands ? ` · ${template.campaigns.brands.brand_name}` : ""}`
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

      {/* Campaign Performance Report (0127): made automatically when this
          survey closes, as a draft for the team to review before the brand
          sees it. */}
      <section id="auto-report" className="card mb-6 scroll-mt-24 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Campaign Performance Report</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
              Made automatically when this survey closes, from the anonymised responses file (passed responses
              only) and the campaign, brand and event details. It arrives as a draft: read it through, then publish
              it to the brand from the report page.
            </p>
          </div>
          {template.campaigns && (
            <form action={requestSurveyReport}>
              <input type="hidden" name="id" value={template.id} />
              <button type="submit" className="btn btn-ghost text-sm" disabled={Boolean(pendingJob)}>
                {pendingJob ? "Report on its way…" : "Generate report now"}
              </button>
            </form>
          )}
        </div>
        {sp.report && (
          <p
            role="status"
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${sp.report === "queued" ? "bg-[var(--color-sage)]/60 text-[var(--color-olive-deep)]" : "bg-[var(--color-gold)]/40"}`}
          >
            {sp.report === "queued"
              ? "Started — the report usually takes a few minutes. You'll get a notification when it's ready."
              : sp.report === "already_queued"
                ? "A report for this survey is already on its way."
                : sp.report === "no_campaign"
                  ? "This survey isn't linked to a campaign, so there's nothing to report on for a brand."
                  : "The report couldn't be started. Please try again."}
          </p>
        )}
        {pendingJob && (
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-testid="report-pending">
            {pendingJob.status === "running"
              ? "Being generated now."
              : pendingJob.hold_until && new Date(pendingJob.hold_until) > new Date() && stats.review_count > 0
                ? `Waiting for the ${stats.review_count} response${stats.review_count === 1 ? "" : "s"} held for review — the report starts as soon as they're decided, or on ${formatDateTime(pendingJob.hold_until)} without them.`
                : "Queued — it starts within 15 minutes."}
            {pendingJob.last_error ? ` Last attempt: ${pendingJob.last_error}` : ""}
          </p>
        )}
        {reports.length > 0 ? (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/dashboard/admin/reports/analysis/${r.id}`} className="font-medium text-[var(--color-brand-dark)] underline">
                  {r.title}
                </Link>
                <span className="text-xs text-[var(--color-ink-soft)]">
                  {r.row_count} responses · {formatDateTime(r.created_at)} ·{" "}
                  {r.shared_with_brand_at ? "published to the brand" : "draft — needs review"}
                  {r.status === "figures_only" ? " · figures only" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          !pendingJob && (
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
              {jobs[0]?.outcome === "empty"
                ? "This survey closed with no passed responses, so no report was made."
                : "No report yet."}
            </p>
          )
        )}
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
              ? `${counted} of ${limit}${template.expected_participants ? ` (${template.expected_participants} expected)` : " (from the order form)"}${capacity?.is_full ? " · closed" : ""}`
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

      {codeSummary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2" data-testid="extra-responses">
          <MetricTile
            label="Extra responses (over the limit)"
            value={codeSummary.over_limit}
            tint={codeSummary.over_limit > 0 ? "bg-[var(--color-gold)]" : undefined}
            hint={`${codeSummary.within_limit} within the limit. The download marks each one: “Over the limit (extra)” Yes / No.`}
          />
          <MetricTile
            label="Got a code"
            value={codeSummary.with_code}
            tint={codeSummary.without_code > 0 ? "bg-[var(--color-pink)]" : undefined}
            hint={`${codeSummary.without_code} without a code. The download marks each one: “Got a code” Yes / No.`}
          />
        </div>
      )}

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
                otherAnswers={otherAnswers.get(q.id)}
                shown={reach ? (reach[q.id] ?? 0) : undefined}
                skipNote={reach ? skipDescription(questions, i) : null}
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
