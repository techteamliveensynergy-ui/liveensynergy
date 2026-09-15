"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { uploadImage } from "@/lib/storage";
import {
  validateQuestions,
  validContradictionRules,
  type ContradictionRuleDraft,
  type SurveyQuestionDraft,
} from "@/lib/surveys";

export interface SurveyState {
  error?: string;
  success?: boolean;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

// layout_mode gates which branding fields are meaningful: cover media and
// the shared background image only render in single_page mode
// (SurveyForm.tsx/PublicSurveyForm.tsx only read them there — a stepped
// survey uses per-question config.media_url/background_image_url instead),
// so a switch to 'stepped' clears both rather than leaving an orphaned
// upload nothing will ever show. Footer (name/tagline/logo) and accent
// color apply to both modes and are never cleared.
function brandingFields(formData: FormData) {
  const layoutMode = str(formData.get("layout_mode")) ?? "single_page";
  const coverMediaType = str(formData.get("cover_media_type"));
  return {
    layout_mode: layoutMode,
    cover_media_url: layoutMode === "single_page" ? str(formData.get("cover_media_url")) : null,
    cover_media_type: layoutMode === "single_page" ? coverMediaType : null,
    background_image_url:
      layoutMode === "single_page" ? str(formData.get("background_image_url")) : null,
    footer_brand_name: str(formData.get("footer_brand_name")),
    footer_tagline: str(formData.get("footer_tagline")),
    footer_logo_url: str(formData.get("footer_logo_url")),
    accent_color: str(formData.get("accent_color")),
  };
}

export async function createSurveyTemplate(
  _prev: SurveyState,
  formData: FormData,
): Promise<SurveyState> {
  const { supabase, userId } = await requireAdmin();
  const title = str(formData.get("title"));
  if (!title) return { error: "Title is required." };
  const kind = str(formData.get("kind")) ?? "pre_event";
  const isPublic = formData.get("is_public") === "on";
  if (isPublic && kind !== "pre_event") {
    return { error: "Only pre-event surveys can be made public." };
  }

  const { data: created, error } = await supabase
    .from("survey_templates")
    .insert({
      title,
      kind,
      campaign_id: str(formData.get("campaign_id")),
      description: str(formData.get("description")),
      is_public: isPublic,
      intro_message: str(formData.get("intro_message")),
      thank_you_message: str(formData.get("thank_you_message")),
      created_by: userId,
      ...brandingFields(formData),
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
  const kind = str(formData.get("kind")) ?? "pre_event";
  const isPublic = formData.get("is_public") === "on";
  if (isPublic && kind !== "pre_event") {
    return { error: "Only pre-event surveys can be made public." };
  }

  const { error } = await supabase
    .from("survey_templates")
    .update({
      title,
      kind,
      campaign_id: str(formData.get("campaign_id")),
      description: str(formData.get("description")),
      is_public: isPublic,
      intro_message: str(formData.get("intro_message")),
      thank_you_message: str(formData.get("thank_you_message")),
      ...brandingFields(formData),
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
 *
 * Also reinserts `survey_contradiction_rules` (0035). The delete above
 * cascades to any existing rules (they reference the old question rows), so
 * there's nothing to explicitly delete — only the reinsert, remapped from
 * the draft's stable `key` to the freshly-generated question id, since a
 * fresh insert of N rows in one statement isn't guaranteed to come back in
 * the same order (`order_index` is what's actually reliable).
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
  let ruleDrafts: ContradictionRuleDraft[];
  try {
    drafts = JSON.parse(String(formData.get("questions") ?? "[]"));
    ruleDrafts = JSON.parse(String(formData.get("contradiction_rules") ?? "[]"));
  } catch {
    return { error: "Could not read the question list." };
  }

  const validationError = validateQuestions(drafts);
  if (validationError) return { error: validationError };

  const questionKeys = new Set(drafts.map((d) => d.key));
  const rules = validContradictionRules(ruleDrafts, questionKeys);

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

  const { data: inserted, error: insertError } = await supabase
    .from("survey_questions")
    .insert(rows)
    .select("id, order_index");
  if (insertError) return { error: insertError.message };

  if (rules.length && inserted) {
    const idByOrderIndex = new Map<number, string>(
      inserted.map((r: { id: string; order_index: number }) => [r.order_index, r.id]),
    );
    const idByKey = new Map(drafts.map((d, i) => [d.key, idByOrderIndex.get(i)]));

    const ruleRows = rules
      .map((r) => ({
        template_id: templateId,
        question_a_id: idByKey.get(r.questionAKey),
        value_a: r.valueA.trim(),
        question_b_id: idByKey.get(r.questionBKey),
        value_b: r.valueB.trim(),
      }))
      .filter(
        (r): r is typeof r & { question_a_id: string; question_b_id: string } =>
          !!r.question_a_id && !!r.question_b_id,
      );

    if (ruleRows.length) {
      const { error: rulesError } = await supabase
        .from("survey_contradiction_rules")
        .insert(ruleRows);
      if (rulesError) return { error: rulesError.message };
    }
  }

  // Deleting/reinserting children doesn't fire the parent's updated_at trigger.
  await supabase
    .from("survey_templates")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", templateId);

  revalidatePath(`/dashboard/admin/surveys/${templateId}`);
  return { success: true };
}

export interface UploadState {
  url?: string;
  error?: string;
}

/**
 * Called directly (not via <form action>) from QuestionInspector's file
 * input — the builder's own "Save" is a single JSON-serialised question
 * list (saveSurveyQuestions above), which can't carry a File. An image
 * uploads immediately on selection instead, into the same `media` bucket
 * onboarding/profile pickers use, and the returned URL is written straight
 * into that question's draft.config.media_url in the builder's client state.
 * Video stays a plain link field (4 Sep standup) — no upload path for it.
 */
export async function uploadQuestionMedia(formData: FormData): Promise<UploadState> {
  const authed = await requireAdmin();
  const { url, error } = await uploadImage(formData.get("file"), "survey-question", authed);
  if (error) return { error };
  if (!url) return { error: "Choose an image to upload." };
  return { url };
}

/**
 * Same shape as uploadQuestionMedia above, for a template's single
 * single_page-mode cover image instead of a per-question one — kept as its
 * own action (rather than reused) so the storage path segment
 * ("survey-cover") tells the two kinds of upload apart in the bucket.
 */
export async function uploadSurveyCoverMedia(formData: FormData): Promise<UploadState> {
  const authed = await requireAdmin();
  const { url, error } = await uploadImage(formData.get("file"), "survey-cover", authed);
  if (error) return { error };
  if (!url) return { error: "Choose an image to upload." };
  return { url };
}

/** Footer logo — shown next to the brand name/tagline, both layout modes. */
export async function uploadSurveyLogo(formData: FormData): Promise<UploadState> {
  const authed = await requireAdmin();
  const { url, error } = await uploadImage(formData.get("file"), "survey-logo", authed);
  if (error) return { error };
  if (!url) return { error: "Choose an image to upload." };
  return { url };
}

/** Template-wide decorative background — single_page layout only, same
 *  "one for the whole survey" scope as uploadSurveyCoverMedia. */
export async function uploadSurveyBackground(formData: FormData): Promise<UploadState> {
  const authed = await requireAdmin();
  const { url, error } = await uploadImage(formData.get("file"), "survey-background", authed);
  if (error) return { error };
  if (!url) return { error: "Choose an image to upload." };
  return { url };
}

/** Per-question decorative background — stepped layout only, one per step
 *  instead of the template-wide one uploadSurveyBackground sets. */
export async function uploadQuestionBackground(formData: FormData): Promise<UploadState> {
  const authed = await requireAdmin();
  const { url, error } = await uploadImage(formData.get("file"), "survey-question-background", authed);
  if (error) return { error };
  if (!url) return { error: "Choose an image to upload." };
  return { url };
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
