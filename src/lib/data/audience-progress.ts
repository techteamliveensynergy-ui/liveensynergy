import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CodeWait } from "@/components/dashboard/ParticipationProgress";
import type { Participation, RewardCode, SponsoredEvent, SurveyTemplate } from "@/lib/types";

type Row = Participation & { sponsored_events: SponsoredEvent | null };

/**
 * For an audience member's own events: which surveys apply, whether each event's
 * survey is done (on the dashboard OR through the survey link), why a code
 * hasn't arrived, and the live codes. Used by My events and the Overview so the
 * two never disagree (QA 8 Nov: the Overview missed survey-link responses).
 * Everything is read under the member's own RLS.
 */
export async function loadAudienceProgress(supabase: SupabaseClient, profileId: string, allRows: Row[]) {
  const profile = { id: profileId };
  // Surveys tied to this audience member's campaigns. RLS (migration 0033)
  // already scopes survey_templates reads to eligible respondents, so no
  // extra campaign filter is needed on the query itself.
  const campaignIds = Array.from(
    new Set(allRows.map((r) => r.sponsored_events?.campaign_id).filter((id): id is string => Boolean(id))),
  );
  const participationIds = allRows.map((r) => r.id);
  const [{ data: surveyTemplateRows }, { data: surveyResponseRows }, { data: codeRows }] = await Promise.all([
    campaignIds.length > 0
      ? supabase
          .from("survey_templates")
          .select("id, campaign_id, kind, title, is_public")
          .in("campaign_id", campaignIds)
          .eq("status", "published")
      : Promise.resolve({ data: [] as SurveyTemplate[] }),
    // Dashboard responses carry the participation; public-link ones (0043)
    // only the respondent — readable by them since 0076. quality_status says
    // why a code hasn't arrived (under review / not approved / being set up);
    // if it can't be read the card simply says less, as before.
    (async () => {
      const filter =
        participationIds.length > 0
          ? `participation_id.in.(${participationIds.join(",")}),respondent_profile_id.eq.${profile.id}`
          : `respondent_profile_id.eq.${profile.id}`;
      const withStatus = await supabase
        .from("survey_responses")
        .select("template_id, participation_id, quality_status, decided_at")
        .or(filter);
      if (!withStatus.error) return withStatus;
      return supabase.from("survey_responses").select("template_id, participation_id").or(filter);
    })(),
    // Codes are released as soon as a survey passes (0075), so they belong on
    // the event card too — "they can see the discount code anytime" (16 Oct).
    participationIds.length > 0
      ? supabase
          .from("reward_codes")
          .select("id, participation_id, code, value_label, code_type, redemption_platform, redemption_url, expires_at, status")
          .in("participation_id", participationIds)
          .neq("status", "void")
      : Promise.resolve({ data: [] }),
  ]);
  const surveyTemplates = (surveyTemplateRows ?? []) as Pick<
    SurveyTemplate,
    "id" | "campaign_id" | "kind" | "title" | "is_public"
  >[];
  const responses = (surveyResponseRows ?? []) as {
    template_id: string;
    participation_id: string | null;
    quality_status?: string | null;
    /** Set when a person decided it (0035) — an automatic reject has none. */
    decided_at?: string | null;
  }[];
  const respondedKeys = new Set(responses.map((r) => `${r.template_id}:${r.participation_id}`));
  const respondedPublicly = new Set(responses.filter((r) => !r.participation_id).map((r) => r.template_id));
  // Answered any of this event's surveys — on the dashboard (carries the
  // participation) or through the public link (carries only the person).
  const surveyDone = (p: Row) =>
    responses.some(
      (r) =>
        r.participation_id === p.id ||
        (!r.participation_id &&
          surveyTemplates.some((t) => t.id === r.template_id && t.campaign_id === p.sponsored_events?.campaign_id)),
    );
  // Why someone who has answered has no code yet. Never says why a response was
  // held (M-06) — only that it is being reviewed, wasn't approved, or passed.
  const codeWaitFor = (p: Row): CodeWait | null => {
    const mine = responses.filter(
      (r) =>
        r.participation_id === p.id ||
        (!r.participation_id &&
          surveyTemplates.some((t) => t.id === r.template_id && t.campaign_id === p.sponsored_events?.campaign_id)),
    );
    if (mine.length === 0) return null;
    const statuses = mine.map((r) => r.quality_status ?? null);
    if (statuses.every((s) => s == null)) return null; // couldn't read it: say nothing new
    if (statuses.includes("pass")) return "setup";
    // "Not approved" only once a PERSON has rejected it. An automatic reject
    // reads as "under review", exactly as the thank-you screen says, so the
    // scoring rules aren't given away (M-06).
    if (mine.some((r) => r.quality_status === "reject" && r.decided_at)) return "declined";
    return "review";
  };
  const codeByParticipation = new Map(
    ((codeRows ?? []) as Pick<
      RewardCode,
      "id" | "participation_id" | "code" | "value_label" | "code_type" | "redemption_platform" | "redemption_url" | "expires_at" | "status"
    >[]).map((c) => [c.participation_id, c]),
  );

  return { surveyTemplates, respondedKeys, respondedPublicly, surveyDone, codeWaitFor, codeByParticipation };
}
