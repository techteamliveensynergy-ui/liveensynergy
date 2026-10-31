import Link from "next/link";
import { SURVEY_CLOSED_BODY, SURVEY_CLOSED_TITLE, surveyCapacityState } from "@/lib/survey-capacity";
import { CapacityNotice } from "@/components/surveys/CapacityNotice";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import type { SurveyQuestion, SurveyTemplate } from "@/lib/types";
import { surveyAppearance } from "@/lib/survey-media";
import { SurveyForm } from "./SurveyForm";

export const metadata = { title: "Survey" };

/**
 * Why a survey is locked, in the participant's terms (QA 30 Oct #20 — it
 * used to say only "isn't available"). The reason comes from
 * survey_access_reason() (0098) and covers the caller's own registration
 * only; anything else, including a database without 0098, gets the plain
 * message.
 */
const LOCKED_REASONS: Record<string, { title: string; body: string }> = {
  awaiting_selection: {
    title: "This survey opens after the event",
    body: "It's the post-event survey, so it opens once you've been selected to take part and your attendance has been verified at the venue. We'll let you know when it's ready.",
  },
  awaiting_attendance: {
    title: "This survey opens once your attendance is verified",
    body: "You're selected — check in with the QR code at the venue on the day. As soon as your attendance is verified the survey opens under My events, and we'll let you know.",
  },
  rejected: {
    title: "This survey isn't open to you",
    body: "Your registration for this event wasn't selected this time, so its survey isn't available. Thanks for registering.",
  },
};

function NotAvailable({ reason }: { reason?: string | null }) {
  const locked = reason ? LOCKED_REASONS[reason] : undefined;
  return (
    <div>
      <PageHeader title="Survey" />
      <div className="card p-8 text-center">
        {locked ? (
          <>
            <p className="text-lg font-semibold text-[var(--color-ink)]">{locked.title}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-ink-soft)]">{locked.body}</p>
          </>
        ) : (
          <p className="text-[var(--color-ink-soft)]">
            This survey isn&apos;t available to you — it may have closed, or it belongs to an event you haven&apos;t
            registered for.
          </p>
        )}
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
  if (!template) {
    const { data: reason } = await supabase.rpc("survey_access_reason", { p_template_id: templateId });
    return <NotAvailable reason={typeof reason === "string" ? reason : null} />;
  }

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

  // Past the limit the form stays open and the response waits for an admin
  // (#34, 0083); only a database without 0083 still refuses it.
  const capacity = await surveyCapacityState(supabase, templateId);
  if (capacity?.is_full && capacity.refusesWhenFull) {
    return (
      <div>
        <PageHeader title={tpl.title} />
        <div className="card p-10 text-center">
          <p className="text-xl font-semibold">{SURVEY_CLOSED_TITLE}</p>
          <p className="mt-2 text-[var(--color-ink-soft)]">{SURVEY_CLOSED_BODY}</p>
          <Link href="/dashboard/participations" className="btn btn-primary mt-5">
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
      <CapacityNotice capacity={capacity} />
      <SurveyForm
        initiallyFull={Boolean(capacity?.is_full)}
        templateId={tpl.id}
        questions={questions}
        introMessage={tpl.intro_message}
        showIntroGate={tpl.show_intro_gate}
        layoutMode={tpl.layout_mode}
        coverMediaUrl={tpl.cover_media_url}
        coverMediaType={tpl.cover_media_type}
        footerBrandName={tpl.footer_brand_name}
        footerTagline={tpl.footer_tagline}
        footerLogoUrl={tpl.footer_logo_url}
        accentColor={tpl.accent_color}
        backgroundImageUrl={tpl.background_image_url}
        typography={{
          fontScale: tpl.font_scale,
          fontFamily: tpl.font_family,
          questionTextColor: tpl.question_text_color,
          bodyTextColor: tpl.body_text_color,
        }}
        appearance={surveyAppearance(tpl)}
      />
    </div>
  );
}
