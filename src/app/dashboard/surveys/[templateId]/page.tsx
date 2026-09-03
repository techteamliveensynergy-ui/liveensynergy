import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import type { SurveyQuestion, SurveyTemplate } from "@/lib/types";
import { SurveyForm } from "./SurveyForm";

export const metadata = { title: "Survey" };

function NotAvailable() {
  return (
    <div>
      <PageHeader title="Survey" />
      <div className="card p-8 text-center">
        <p className="text-[var(--color-ink-soft)]">
          This survey isn&apos;t available to you.
        </p>
        <Link href="/dashboard/participations" className="btn btn-primary mt-4">
          Back to My events
        </Link>
      </div>
    </div>
  );
}

export default async function TakeSurveyPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  await requireRole(["audience"]);
  const supabase = await createClient();

  // RLS (migration 0033) only returns a row here if the signed-in audience
  // member is actually eligible for this template — so "no row" already
  // covers not-eligible, not-published, wrong campaign, and non-existent
  // alike. One state for all of those on purpose: nothing about *why* is
  // leaked back to the page.
  const { data: template } = await supabase
    .from("survey_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (!template) return <NotAvailable />;

  const tpl = template as SurveyTemplate;

  // survey_participation_for() is what the RLS above already evaluated to
  // let that row through — called again here only to get the id back.
  const { data: participationId } = await supabase.rpc("survey_participation_for", {
    p_template_id: templateId,
  });
  if (!participationId) return <NotAvailable />;

  const { data: existingResponse } = await supabase
    .from("survey_responses")
    .select("submitted_at")
    .eq("template_id", templateId)
    .eq("participation_id", participationId as string)
    .maybeSingle();

  if (existingResponse) {
    return (
      <div>
        <PageHeader title={tpl.title} />
        <div className="card p-8 text-center">
          <p className="text-lg font-semibold">
            ✓ You&apos;ve already completed this survey
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Submitted {formatDateTime(existingResponse.submitted_at)}.
          </p>
          <Link href="/dashboard/participations" className="btn btn-primary mt-4">
            Back to My events
          </Link>
        </div>
      </div>
    );
  }

  const { data: questionRows } = await supabase
    .from("survey_form_questions")
    .select("*")
    .eq("template_id", templateId)
    .order("order_index");
  const questions = (questionRows ?? []) as SurveyQuestion[];
  if (questions.length === 0) return <NotAvailable />;

  return (
    <div>
      <PageHeader title={tpl.title} subtitle={tpl.description ?? undefined} />
      <SurveyForm templateId={tpl.id} questions={questions} />
    </div>
  );
}
