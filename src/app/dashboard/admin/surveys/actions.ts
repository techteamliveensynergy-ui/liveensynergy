"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { validateQuestions, type SurveyQuestionDraft } from "@/lib/surveys";

export interface SurveyState {
  error?: string;
  success?: boolean;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

export async function createSurveyTemplate(
  _prev: SurveyState,
  formData: FormData,
): Promise<SurveyState> {
  const { supabase, userId } = await requireAdmin();
  const title = str(formData.get("title"));
  if (!title) return { error: "Title is required." };

  const { data: created, error } = await supabase
    .from("survey_templates")
    .insert({
      title,
      kind: str(formData.get("kind")) ?? "pre_event",
      campaign_id: str(formData.get("campaign_id")),
      description: str(formData.get("description")),
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/dashboard/admin/surveys");
  redirect(`/dashboard/admin/surveys/${created.id}`);
}

export async function updateSurveyTemplate(
  _prev: SurveyState,
  formData: FormData,
): Promise<SurveyState> {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const title = str(formData.get("title"));
  if (!id || !title) return { error: "Title is required." };

  const { error } = await supabase
    .from("survey_templates")
    .update({
      title,
      kind: str(formData.get("kind")) ?? "pre_event",
      campaign_id: str(formData.get("campaign_id")),
      description: str(formData.get("description")),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/admin/surveys");
  revalidatePath(`/dashboard/admin/surveys/${id}`);
  return { success: true };
}

/**
 * Delete-and-reinsert the whole question list, matching
 * `upsertRewardTiers`'s approach to the same "client-held repeatable-row
 * draft, one Save" shape. `survey_questions.unique (template_id, order_index)`
 * is non-deferrable, so an in-place reorder update can't satisfy it anyway —
 * delete-and-reinsert isn't a shortcut, it's the only option.
 *
 * Refused while `published`: the Supabase JS client can't wrap delete+insert
 * in one transaction, so a failed reinsert after a successful delete would
 * empty a live survey. Unpublish first, edit, republish.
 */
export async function saveSurveyQuestions(
  _prev: SurveyState,
  formData: FormData,
): Promise<SurveyState> {
  const { supabase } = await requireAdmin();
  const templateId = str(formData.get("template_id"));
  if (!templateId) return { error: "Missing survey." };

  const { data: tpl } = await supabase
    .from("survey_templates")
    .select("status")
    .eq("id", templateId)
    .maybeSingle<{ status: string }>();
  if (!tpl) return { error: "Survey not found." };
  if (tpl.status === "published") {
    return { error: "Unpublish this survey before editing its questions." };
  }

  // survey_answers.question_id is `on delete restrict` (migration 0033) —
  // an unpublish -> edit -> republish cycle on a survey that already has
  // responses would otherwise hit a raw foreign-key violation on the delete
  // below. Refuse in advance with a readable message instead.
  const { count: responseCount } = await supabase
    .from("survey_responses")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId);
  if (responseCount) {
    return { error: "This survey already has responses — its questions can't be changed." };
  }

  let drafts: SurveyQuestionDraft[];
  try {
    drafts = JSON.parse(String(formData.get("questions") ?? "[]"));
  } catch {
    return { error: "Could not read the question list." };
  }

  const validationError = validateQuestions(drafts);
  if (validationError) return { error: validationError };

  const rows = drafts.map((d, i) => ({
    template_id: templateId,
    order_index: i,
    type: d.type,
    prompt: d.prompt || null,
    help_text: d.help_text || null,
    options: d.options.length ? d.options : null,
    config: d.config ?? {},
    required: d.required,
  }));

  const { error: deleteError } = await supabase
    .from("survey_questions")
    .delete()
    .eq("template_id", templateId);
  if (deleteError) return { error: deleteError.message };

  const { error: insertError } = await supabase
    .from("survey_questions")
    .insert(rows);
  if (insertError) return { error: insertError.message };

  // Deleting/reinserting children doesn't fire the parent's updated_at trigger.
  await supabase
    .from("survey_templates")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", templateId);

  revalidatePath(`/dashboard/admin/surveys/${templateId}`);
  return { success: true };
}

export async function publishSurveyTemplate(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: tpl } = await supabase
    .from("survey_templates")
    .select("campaign_id, kind")
    .eq("id", id)
    .maybeSingle<{ campaign_id: string | null; kind: string }>();
  // The DB constraint would refuse this anyway; bail early with no write.
  if (!tpl?.campaign_id) return;

  const { count: questionCount } = await supabase
    .from("survey_questions")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id);
  if (!questionCount) return;

  const { count: conflicting } = await supabase
    .from("survey_templates")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", tpl.campaign_id)
    .eq("kind", tpl.kind)
    .eq("status", "published")
    .neq("id", id);
  if (conflicting) return;

  await supabase
    .from("survey_templates")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/dashboard/admin/surveys");
  revalidatePath(`/dashboard/admin/surveys/${id}`);
}

export async function unpublishSurveyTemplate(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase.from("survey_templates").update({ status: "draft" }).eq("id", id);
  revalidatePath("/dashboard/admin/surveys");
  revalidatePath(`/dashboard/admin/surveys/${id}`);
}

export async function archiveSurveyTemplate(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase.from("survey_templates").update({ status: "archived" }).eq("id", id);
  revalidatePath("/dashboard/admin/surveys");
  revalidatePath(`/dashboard/admin/surveys/${id}`);
}

export async function unarchiveSurveyTemplate(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase.from("survey_templates").update({ status: "draft" }).eq("id", id);
  revalidatePath("/dashboard/admin/surveys");
  revalidatePath(`/dashboard/admin/surveys/${id}`);
}
