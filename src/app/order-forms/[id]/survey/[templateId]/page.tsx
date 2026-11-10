import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";
import type { SurveyQuestion, SurveyTemplate } from "@/lib/types";
import { PreviewSurveyForm } from "@/app/dashboard/admin/surveys/[id]/preview/PreviewSurveyForm";

export const metadata = { title: "Survey preview" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The survey linked from a Campaign Order Form, previewed as a participant
 * would see it — for the brand reviewing the form (Testing notes 7 Nov: the
 * admin-only builder link bounced brands to their dashboard). Read through
 * order_form_survey_preview() (0117), which only answers the form's brand or an
 * admin, for a survey of that campaign or linked from the form, and strips
 * hidden fields and attention-check answers. Nothing typed here is saved.
 */
export default async function OrderFormSurveyPreview({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { id, templateId } = await params;
  if (!UUID.test(id) || !UUID.test(templateId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(`/order-forms/${id}/survey/${templateId}`)}`);

  const { data } = await supabase.rpc("order_form_survey_preview", { p_form_id: id, p_template_id: templateId });
  const preview = data as { template: SurveyTemplate; questions: SurveyQuestion[] } | null;
  if (!preview?.template) notFound();
  const { template, questions } = preview;

  return (
    <div className="min-h-screen bg-[var(--color-mist)]">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-white/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Logo />
          </Link>
          <p className="text-sm font-semibold">
            Preview · {template.title}{" "}
            <span className="font-normal text-[var(--color-ink-soft)]">
              — {template.kind === "pre_event" ? "pre-event" : "post-event"} survey. Nothing you answer here is saved.
            </span>
          </p>
        </div>
        <Link href={`/order-forms/${id}`} className="btn btn-ghost text-sm">
          ← Back to the order form
        </Link>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        {questions.length === 0 ? (
          <div className="card p-8 text-center text-[var(--color-ink-soft)]">This survey has no questions yet.</div>
        ) : (
          <PreviewSurveyForm questions={questions} template={template} />
        )}
      </main>
    </div>
  );
}
