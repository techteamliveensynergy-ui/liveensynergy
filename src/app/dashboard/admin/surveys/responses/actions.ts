"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/profile";
import { notify } from "@/lib/notifications";

export interface ResponseActionState {
  error?: string;
}

const DECISIONS = new Set(["pass", "review", "reject"]);

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

interface DecidedRow {
  id: string;
  participation_id: string;
  participations: {
    audience_profile_id: string;
    sponsored_events: { name: string } | null;
  } | null;
}

/** Notifies the respondent only on reject — pass/review carry no reward
 * consequence of their own yet (Step 6 wires the actual gate). */
async function notifyRejected(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  responseIds: string[],
  reason: string | null,
) {
  if (responseIds.length === 0) return;
  const { data } = await supabase
    .from("survey_responses")
    .select("id, participation_id, participations(audience_profile_id, sponsored_events(name))")
    .in("id", responseIds);

  for (const row of (data ?? []) as unknown as DecidedRow[]) {
    const audienceProfileId = row.participations?.audience_profile_id;
    if (!audienceProfileId) continue;
    await notify({
      eventKey: "survey.rejected",
      recipientProfileId: audienceProfileId,
      link: "/dashboard/participations",
      variables: {
        event_name: row.participations?.sponsored_events?.name ?? "your event",
        reason: reason ?? undefined,
      },
    });
  }
}

/** Single-row decision from the response detail screen. */
export async function decideSurveyResponse(
  _prev: ResponseActionState,
  formData: FormData,
): Promise<ResponseActionState> {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  const decision = str(formData.get("decision"));
  const reason = str(formData.get("reason"));
  if (!id || !decision || !DECISIONS.has(decision)) {
    return { error: "Missing or invalid decision." };
  }

  const { error } = await supabase
    .from("survey_responses")
    .update({
      quality_status: decision,
      decided_by: userId,
      decided_at: new Date().toISOString(),
      decision_reason: reason,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  if (decision === "reject") await notifyRejected(supabase, [id], reason);

  revalidatePath("/dashboard/admin/surveys/responses");
  revalidatePath(`/dashboard/admin/surveys/responses/${id}`);
  return {};
}

/** Bulk decision from the list screen's row checkboxes. */
export async function bulkDecideSurveyResponses(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const decision = str(formData.get("decision"));
  if (ids.length === 0 || !decision || !DECISIONS.has(decision)) return;

  await supabase
    .from("survey_responses")
    .update({
      quality_status: decision,
      decided_by: userId,
      decided_at: new Date().toISOString(),
      decision_reason: null,
    })
    .in("id", ids);

  if (decision === "reject") await notifyRejected(supabase, ids, null);

  revalidatePath("/dashboard/admin/surveys/responses");
}

/**
 * Manual re-run for a response stuck on `pending` — the automatic call in
 * submitSurveyResponse() is best-effort and never blocks the submission, so
 * a transient failure there needs a recovery path that isn't "wait forever".
 */
export async function scoreSurveyResponseNow(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase.rpc("score_survey_response", { p_response_id: id });
  revalidatePath("/dashboard/admin/surveys/responses");
  revalidatePath(`/dashboard/admin/surveys/responses/${id}`);
}
