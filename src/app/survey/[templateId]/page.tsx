import type { ReactNode } from "react";
import Link from "next/link";
import { SURVEY_CLOSED_BODY, SURVEY_CLOSED_TITLE, surveyCapacity } from "@/lib/survey-capacity";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";
import { formatDateTime } from "@/lib/format";
import type { SurveyQuestion, SurveyTemplate } from "@/lib/types";
import { SurveyForm } from "@/app/dashboard/surveys/[templateId]/SurveyForm";
import { PublicSurveyForm, type PublicSurveyEvent, type SurveyPrefill } from "./PublicSurveyForm";

export const metadata = { title: "Survey" };

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-mist)] px-4 py-10">
      <div className="mx-auto w-full max-w-5xl">
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

  // Response cap (#8): checked up front so nobody fills in a form that can't
  // be submitted. Someone who already answered still sees "already completed".
  const full = (await surveyCapacity(supabase, templateId))?.is_full ?? false;

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

      if (full) {
        return (
          <Shell>
            <StatusCard title={SURVEY_CLOSED_TITLE} body={SURVEY_CLOSED_BODY} />
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
          <SurveyForm
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
          />
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

  // Signed in but no participation yet — either a pre-existing account
  // taking a different campaign's survey, or one startSurveyAccount() just
  // created and redirected straight back here. Either way, pre-fill from
  // their own profile rather than asking again (owner-read RLS already
  // allows both selects — no policy change) — the "Implement Pre-fill"
  // action item.
  let prefill: SurveyPrefill | null = null;
  if (user) {
    const [{ data: profile }, { data: member }] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
      supabase
        .from("audience_members")
        .select("phone, phone_country_code")
        .eq("profile_id", user.id)
        .maybeSingle(),
    ]);
    const name = (profile?.full_name ?? "").trim();
    const cut = name.lastIndexOf(" ");
    prefill = {
      firstName: cut > 0 ? name.slice(0, cut) : name,
      lastName: cut > 0 ? name.slice(cut + 1) : "",
      email: profile?.email ?? user.email ?? "",
      phone: member ? `${member.phone_country_code ?? ""}${member.phone ?? ""}`.trim() || null : null,
    };
  }
  // Set by startSurveyAccount() (src/app/survey/[templateId]/actions.ts) at
  // account-creation time — this account has a random password the
  // respondent never saw, so the thank-you screen offers to set a real one.
  const needsPassword = Boolean((user?.user_metadata as Record<string, unknown> | undefined)?.survey_account);

  if (full) {
    return (
      <Shell>
        <StatusCard title={SURVEY_CLOSED_TITLE} body={SURVEY_CLOSED_BODY} />
      </Shell>
    );
  }

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
        needsPassword={needsPassword}
        prefill={prefill}
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
      />
    </Shell>
  );
}
