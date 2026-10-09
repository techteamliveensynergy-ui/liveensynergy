import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, MetricTile, PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { QuestionResultCard, type ResultQuestion, type ResultStats } from "@/components/surveys/QuestionResultCard";

export const metadata = { title: "Survey results" };

interface BrandResults {
  title: string;
  kind: string;
  status: string;
  counted: number;
  min_responses: number;
  last_response_at: string | null;
  questions: (ResultQuestion & ResultStats & { order_index: number })[];
}

/**
 * The brand's view of its campaign survey results (Admin Portal brief, 9 Oct:
 * "survey responses, reports, analysis — only brands can see"). Everything
 * comes from brand_survey_results() (0060), which checks the caller owns the
 * campaign and returns totals only: no names, no individual answers, no open
 * text, nothing per question until enough responses are in to stay anonymous.
 */
export default async function BrandSurveyResultsPage({ params }: { params: Promise<{ templateId: string }> }) {
  await requireRole(["brand", "admin"]);
  const { templateId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("brand_survey_results", { p_template_id: templateId });
  const results = data as BrandResults | null;
  if (!results) notFound();

  const enough = results.counted >= results.min_responses;

  return (
    <div>
      <Link href="/dashboard/sponsored" className="mb-4 inline-block text-sm text-[var(--color-brand)]">
        ← Back to sponsored events
      </Link>
      <PageHeader
        title={results.title}
        subtitle={`${results.kind === "pre_event" ? "Pre-event" : "Post-event"} survey results · totals only, no names or individual answers`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile label="Responses" value={results.counted} hint={results.status === "archived" ? "Survey closed" : "Survey open — updates as responses arrive"} />
        <MetricTile
          label="Latest response"
          value={results.last_response_at ? formatDateTime(results.last_response_at) : "—"}
        />
        <MetricTile label="Questions shown" value={enough ? results.questions.length : "—"} hint="Open-text questions are summarised by our team" />
      </div>

      {!enough ? (
        <EmptyState
          icon="🔒"
          title="Results unlock at a few more responses"
          body={`To keep every participant anonymous, question results appear once ${results.min_responses} responses are in. ${results.counted} so far.`}
        />
      ) : (
        <div className="space-y-4">
          {results.questions.map((q, i) => (
            <QuestionResultCard key={q.id} index={i} q={q} s={q} counted={results.counted} />
          ))}
        </div>
      )}
    </div>
  );
}
