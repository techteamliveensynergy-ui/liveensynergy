import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { SURVEY_QUALITY_SIGNALS } from "@/lib/surveys";
import type {
  SurveyAnswer,
  SurveyQualityStatus,
  SurveyQuestion,
  SurveyQuestionOption,
} from "@/lib/types";
import { scoreSurveyResponseNow } from "../actions";
import { DecisionForm } from "./DecisionForm";

export const metadata = { title: "Survey response · Admin" };

interface ResponseRow {
  id: string;
  template_id: string;
  started_at: string;
  submitted_at: string;
  quality_score: number | null;
  quality_status: SurveyQualityStatus;
  signal_breakdown: Record<
    string,
    { applicable: boolean; weight: number; severity: number; contribution: number; verdict: string; evidence: string }
  > | null;
  duplicate_of: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  survey_templates: { title: string; kind: string } | null;
  participations: {
    audience_profile_id: string;
    profiles: { full_name: string | null; email: string | null } | null;
    sponsored_events: { name: string } | null;
  } | null;
}

function answerText(value: unknown, options: SurveyQuestionOption[] | null): string {
  if (value == null || value === "") return "—";
  const labelFor = (v: string) => options?.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map((v) => labelFor(String(v))).join(", ");
  return labelFor(String(value));
}

const VERDICT_STYLES: Record<string, string> = {
  clear: "text-[var(--color-olive-deep)]",
  warning: "text-[var(--color-ink)]",
  failed: "text-[var(--color-accent)]",
};

export default async function SurveyResponseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin"]);
  const supabase = await createClient();

  const { data: responseData } = await supabase
    .from("survey_responses")
    .select(
      "*, survey_templates(title, kind), " +
        "participations(audience_profile_id, profiles(full_name, email), sponsored_events(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!responseData) notFound();
  const response = responseData as unknown as ResponseRow;

  const [{ data: questionRows }, { data: answerRows }, { data: decider }, { data: duplicateOf }] =
    await Promise.all([
      supabase
        .from("survey_questions")
        .select("*")
        .eq("template_id", response.template_id)
        .order("order_index"),
      supabase.from("survey_answers").select("*").eq("response_id", id),
      response.decided_by
        ? supabase.from("profiles").select("full_name").eq("id", response.decided_by).maybeSingle()
        : Promise.resolve({ data: null }),
      response.duplicate_of
        ? supabase
            .from("survey_responses")
            .select("id, participations(profiles(full_name))")
            .eq("id", response.duplicate_of)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const questions = (questionRows ?? []) as SurveyQuestion[];
  const answers = (answerRows ?? []) as SurveyAnswer[];
  const answerByQuestion = new Map(answers.map((a) => [a.question_id, a]));
  const durationSeconds = Math.round(
    (new Date(response.submitted_at).getTime() - new Date(response.started_at).getTime()) / 1000,
  );

  return (
    <div>
      <PageHeader
        title={response.participations?.profiles?.full_name ?? "Survey response"}
        subtitle={`${response.survey_templates?.title ?? "Survey"} · ${response.participations?.sponsored_events?.name ?? "Event"}`}
        action={<StatusBadge status={response.quality_status} />}
      />
      <Link
        href="/dashboard/admin/surveys/responses"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to survey responses
      </Link>

      {/* 1. Response meta */}
      <div className="card mb-4 grid gap-3 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-[var(--color-ink-soft)]">Respondent</p>
          <p className="font-medium">{response.participations?.profiles?.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-ink-soft)]">Submitted</p>
          <p className="font-medium">{formatDateTime(response.submitted_at)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-ink-soft)]">Completion time</p>
          <p className="font-medium">{durationSeconds}s</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-ink-soft)]">Quality score</p>
          <p className="font-medium">{response.quality_score ?? "not yet scored"}</p>
        </div>
      </div>

      {response.duplicate_of && (
        <div className="card mb-4 p-4 text-sm">
          Possibly a duplicate of{" "}
          <Link
            href={`/dashboard/admin/surveys/responses/${response.duplicate_of}`}
            className="font-semibold text-[var(--color-brand-dark)] hover:underline"
          >
            {(duplicateOf as { participations?: { profiles?: { full_name: string | null } | null } } | null)
              ?.participations?.profiles?.full_name ?? "another response"}
          </Link>{" "}
          to this same survey.
        </div>
      )}

      {response.quality_score == null && (
        <div className="card mb-4 flex items-center justify-between p-4 text-sm">
          <span>This response hasn&apos;t been scored yet.</span>
          <form action={scoreSurveyResponseNow}>
            <input type="hidden" name="id" value={response.id} />
            <button type="submit" className="btn btn-ghost text-sm">
              Score now
            </button>
          </form>
        </div>
      )}

      {/* 2. Signal breakdown */}
      <div className="card mb-4 overflow-x-auto p-5">
        <h3 className="mb-3 font-semibold text-[var(--color-ink)]">Signal breakdown</h3>
        {response.signal_breakdown ? (
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-ink-soft)]">
                <th className="pb-2">Signal</th>
                <th className="pb-2">Verdict</th>
                <th className="pb-2">Weight</th>
                <th className="pb-2">Cost</th>
                <th className="pb-2">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {SURVEY_QUALITY_SIGNALS.map((spec) => {
                const s = response.signal_breakdown?.[spec.key];
                if (!s) return null;
                return (
                  <tr key={spec.key}>
                    <td className="py-2 pr-3 font-medium">{spec.label}</td>
                    <td className={`py-2 pr-3 font-medium ${VERDICT_STYLES[s.verdict] ?? ""}`}>
                      {s.applicable ? s.verdict : "n/a"}
                    </td>
                    <td className="py-2 pr-3">{s.weight}</td>
                    <td className="py-2 pr-3">{s.applicable ? s.contribution.toFixed(1) : "—"}</td>
                    <td className="py-2 text-[var(--color-ink-soft)]">{s.evidence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">Not scored yet.</p>
        )}
      </div>

      {/* 3. Answers */}
      <div className="card mb-4 divide-y divide-black/5 p-5">
        <h3 className="mb-3 font-semibold text-[var(--color-ink)]">Answers</h3>
        {questions.map((q, i) => {
          const a = answerByQuestion.get(q.id);
          return (
            <div key={q.id} className="py-2 text-sm">
              <p className="text-xs text-[var(--color-ink-soft)]">
                Q{i + 1}
                {q.type === "hidden_field" && " · hidden"}
                {q.type === "attention_check" && " · attention check"}
              </p>
              <p className="font-medium">{q.prompt ?? "(hidden field)"}</p>
              <p className="text-[var(--color-ink-soft)]">
                {answerText(a?.value ?? null, q.options)}
              </p>
            </div>
          );
        })}
      </div>

      {/* 4. Decision */}
      <div className="card p-5">
        <h3 className="mb-3 font-semibold text-[var(--color-ink)]">Decision</h3>
        {response.decided_at && (
          <p className="field-hint mb-3">
            Last decided {formatDateTime(response.decided_at)}
            {decider ? ` by ${(decider as { full_name: string | null }).full_name}` : ""}
            {response.decision_reason ? ` — "${response.decision_reason}"` : ""}
          </p>
        )}
        <DecisionForm responseId={response.id} currentStatus={response.quality_status} />
      </div>
    </div>
  );
}
