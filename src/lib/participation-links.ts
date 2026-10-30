import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a "you're registered" notification sends the participant (QA 30 Oct
 * #9). A just-registered account is often not yet email-verified, and until
 * it is every /dashboard/* page except the home is blocked (0074) — so the
 * old link to My events landed on a wall. The campaign's published public
 * pre-event survey opens at /survey/[id] regardless; otherwise My events,
 * which always exists.
 */
export async function registrationNextLink(
  supabase: SupabaseClient,
  campaignId: string | null | undefined,
): Promise<string> {
  const fallback = "/dashboard/participations";
  if (!campaignId) return fallback;
  const { data } = await supabase
    .from("survey_templates")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("kind", "pre_event")
    .eq("status", "published")
    .eq("is_public", true)
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data ? `/survey/${data.id}` : fallback;
}
