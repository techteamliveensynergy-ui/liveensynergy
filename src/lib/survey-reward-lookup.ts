import type { SupabaseClient } from "@supabase/supabase-js";
import type { SurveyRewardOutcome } from "@/lib/survey-reward";

/**
 * What a respondent should be told about their discount code for an event: the
 * code itself if one has been issued, otherwise plainly why not yet.
 *
 * One lookup, used twice, so the two can't disagree:
 *  - right after a public survey is submitted (registerAndRewardAfterSubmit), and
 *  - every time the survey page is opened by someone who has already answered
 *    (so the code is still there after a refresh or a return visit — the page
 *    re-renders as soon as the submit registers the respondent, and the
 *    thank-you screen on its own did not survive that).
 *
 * Takes the caller's own client: a respondent reads their own participation and
 * their own codes under RLS, nothing more. Never throws — any failure reads as
 * "your code is on its way", never as an error screen. Says nothing about
 * scores or thresholds (M-06): a response that did not pass reads exactly like
 * one held for any other reason.
 */
export async function rewardOutcomeFor(
  supabase: SupabaseClient,
  args: {
    templateId: string;
    eventId: string;
    userId: string;
    /** The quality check did not pass the response outright. */
    underReview: boolean;
    /** Submitted past the participant limit: an admin decides first (0083). */
    heldForReview: boolean;
  },
): Promise<SurveyRewardOutcome> {
  const { templateId, eventId, userId, underReview, heldForReview } = args;
  try {
    const { data: part } = await supabase
      .from("participations")
      .select("id")
      .eq("sponsored_event_id", eventId)
      .eq("audience_profile_id", userId)
      .maybeSingle<{ id: string }>();

    if (part) {
      const { data: codeRow } = await supabase
        .from("reward_codes")
        .select("code, value_label, redemption_platform, redemption_url, redemption_instructions, expires_at, is_shared")
        .eq("participation_id", part.id)
        .neq("status", "void")
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          code: string;
          value_label: string | null;
          redemption_platform: string | null;
          redemption_url: string | null;
          redemption_instructions: string | null;
          expires_at: string | null;
          is_shared: boolean;
        }>();
      if (codeRow) {
        return {
          status: "issued",
          code: codeRow.code,
          valueLabel: codeRow.value_label,
          platform: codeRow.redemption_platform,
          url: codeRow.redemption_url,
          instructions: codeRow.redemption_instructions,
          expiresAt: codeRow.expires_at,
          shared: codeRow.is_shared,
        };
      }
    }

    // No code. Say why, without revealing how the quality check works (M-06).
    if (heldForReview) return { status: "pending", reason: "held" };
    if (underReview) return { status: "pending", reason: "review" };

    const { data: ev } = await supabase
      .from("sponsored_events")
      .select("artist_profile_id, reward_codes_confirmed_at")
      .eq("id", eventId)
      .maybeSingle<{ artist_profile_id: string | null; reward_codes_confirmed_at: string | null }>();
    if (ev?.artist_profile_id && !ev.reward_codes_confirmed_at) {
      return { status: "pending", reason: "not_ready" };
    }
    const { data: codesState } = await supabase.rpc("survey_codes_state", { p_template_id: templateId });
    if (codesState === "exhausted") return { status: "pending", reason: "no_codes" };
    if (codesState === "none") return { status: "pending", reason: "not_ready" };
    return { status: "pending", reason: "unknown" };
  } catch (e) {
    console.error("[survey] rewardOutcomeFor threw:", e);
    return { status: "pending", reason: "unknown" };
  }
}
