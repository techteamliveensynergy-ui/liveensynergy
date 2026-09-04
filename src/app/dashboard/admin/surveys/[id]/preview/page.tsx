import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { SurveyQuestion, SurveyTemplate } from "@/lib/types";
import { PreviewSurveyForm } from "./PreviewSurveyForm";
import { CopyLinkButton } from "./CopyLinkButton";

export const metadata = { title: "Survey preview · Admin" };

export default async function SurveyPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: template }, { data: questionRows }] = await Promise.all([
    supabase.from("survey_templates").select("*").eq("id", id).maybeSingle(),
    supabase.from("survey_questions").select("*").eq("template_id", id).order("order_index"),
  ]);
  if (!template) notFound();

  const tpl = template as SurveyTemplate;
  const allQuestions = (questionRows ?? []) as SurveyQuestion[];
  const hiddenCount = allQuestions.filter((q) => q.type === "hidden_field").length;

  // Mirrors the survey_form_questions view (0033): no hidden_field rows, and
  // an attention check's expected_answer never reaches anything a respondent
  // (or someone previewing as one) can read.
  const questions = allQuestions
    .filter((q) => q.type !== "hidden_field")
    .map((q) => {
      if (q.type !== "attention_check" || !q.config.expected_answer) return q;
      const { expected_answer: _expected_answer, ...rest } = q.config;
      return { ...q, config: rest };
    });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const previewUrl = `${base}/dashboard/admin/surveys/${id}/preview`;

  return (
    <div>
      <PageHeader
        title={`Preview · ${tpl.title}`}
        subtitle={`${tpl.kind === "pre_event" ? "Pre-event" : "Post-event"} survey — answers here are never saved`}
      />
      <Link
        href={`/dashboard/admin/surveys/${id}`}
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to editor
      </Link>

      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <p className="font-medium text-[var(--color-ink)]">Shareable preview link</p>
          <p className="text-[var(--color-ink-soft)]">
            Any signed-in admin can open this link to see and try the form as a participant would.
          </p>
        </div>
        <CopyLinkButton url={previewUrl} />
      </div>

      {hiddenCount > 0 && (
        <p className="mb-6 text-sm text-[var(--color-ink-soft)]">
          This survey also collects {hiddenCount} hidden field{hiddenCount === 1 ? "" : "s"} automatically
          from the respondent's profile — never shown on the form itself, so it isn't shown here either.
        </p>
      )}

      {questions.length === 0 ? (
        <div className="card p-8 text-center text-[var(--color-ink-soft)]">
          Add at least one question in the editor to preview it.
        </div>
      ) : (
        <PreviewSurveyForm questions={questions} />
      )}
    </div>
  );
}
