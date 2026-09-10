import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";
import { formatDateTime } from "@/lib/format";
import type { SurveyQuestion, SurveyTemplate } from "@/lib/types";
import { SurveyForm } from "@/app/dashboard/surveys/[templateId]/SurveyForm";
import { PublicSurveyForm, type PublicSurveyEvent } from "./PublicSurveyForm";

export const metadata = { title: "Survey" };

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-mist)] px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusCard({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">{body}</p>
    </div>
  );
}

/**
 * Public, link-shareable pre-event survey — no account required. A visitor
 * who is already a signed-in, registered participant for this campaign gets
 * handed the existing authenticated SurveyForm unchanged (same component the
 * dashboard route renders); everyone else answers through PublicSurveyForm's
 * contact-capture path. See supabase/migrations/0037_public_surveys.sql for
 * the eligibility split this mirrors.
 */
export default async function PublicSurveyPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: template } = await supabase
    .from("survey_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();

  const tpl = template as SurveyTemplate | null;
  if (!tpl || tpl.status !== "published" || !tpl.is_public || tpl.kind !== "pre_event") {
    return (
      <Shell>
        <StatusCard
          title="Survey not available"
          body="This link doesn't match a live Live·En·Synergy survey. Ask the organiser for the current link."
        />
      </Shell>
    );
  }

  let event: PublicSurveyEvent | null = null;
  if (tpl.campaign_id) {
    // A campaign can carry several sponsored_events rows (withdrawn
    // siblings, etc.) — take the most recent live one rather than assuming
    // exactly zero or one match, which .maybeSingle() requires.
    const { data: evRows } = await supabase
      .from("sponsored_events")
      .select("id, reference, name")
      .eq("campaign_id", tpl.campaign_id)
      .in("status", ["confirmed", "completed"])
      .order("created_at", { ascending: false })
      .limit(1);
    event = (evRows?.[0] as PublicSurveyEvent | undefined) ?? null;
  }

  // Already-registered participant taking their own campaign's survey via a
  // shared link — same eligibility check the dashboard route itself uses.
  if (user) {
    const { data: participationId } = await supabase.rpc("survey_participation_for", {
      p_template_id: templateId,
    });
    if (participationId) {
      const { data: existingResponse } = await supabase
        .from("survey_responses")
        .select("submitted_at")
        .eq("template_id", templateId)
        .eq("participation_id", participationId as string)
        .maybeSingle();

      if (existingResponse) {
        return (
          <Shell>
            <StatusCard
              title={`✓ You've already completed "${tpl.title}"`}
              body={`Submitted ${formatDateTime(existingResponse.submitted_at)}.`}
            />
          </Shell>
        );
      }

      const { data: questionRows } = await supabase
        .from("survey_form_questions")
        .select("*")
        .eq("template_id", templateId)
        .order("order_index");
      const questions = (questionRows ?? []) as SurveyQuestion[];

      return (
        <Shell>
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-semibold text-[var(--color-ink)]">{tpl.title}</h1>
            {tpl.description && (
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{tpl.description}</p>
            )}
          </div>
          <SurveyForm templateId={tpl.id} questions={questions} />
        </Shell>
      );
    }
  }

  // Anonymous, or signed in without a participation yet.
  const { data: publicQuestionRows } = await supabase
    .from("survey_public_form_questions")
    .select("*")
    .eq("template_id", templateId)
    .order("order_index");
  const publicQuestions = (publicQuestionRows ?? []) as SurveyQuestion[];

  if (publicQuestions.length === 0) {
    return (
      <Shell>
        <StatusCard
          title="Survey not available"
          body="This survey doesn't have any questions yet. Check back soon."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-[var(--color-ink)]">{tpl.title}</h1>
        {tpl.description && (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{tpl.description}</p>
        )}
      </div>
      <PublicSurveyForm
        templateId={tpl.id}
        questions={publicQuestions}
        introMessage={tpl.intro_message}
        thankYouMessage={tpl.thank_you_message}
        event={event}
        isAuthenticated={Boolean(user)}
      />
    </Shell>
  );
}
