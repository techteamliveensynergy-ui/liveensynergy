"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DRAFT_KINDS, type DraftKind } from "@/lib/drafts";

export interface DraftState {
  error?: string;
  draftId?: string;
  savedAt?: string;
}

// Next's own bookkeeping fields and the draft controls themselves.
const SKIP = /^(\$ACTION|draft_)/;

/** Every text value in the form, keyed by field name — repeated fields keep
 *  all their values. Files are left out on purpose (see 0092). */
function formValues(formData: FormData): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (SKIP.test(key) || typeof value !== "string") continue;
    (out[key] ??= []).push(value.slice(0, 5000));
  }
  return out;
}

/**
 * Saves a half-finished form (GitHub #79) without running its required-field
 * checks — those run in full on Submit. Called directly from the Save draft
 * button rather than as a form action, so React doesn't reset the form.
 */
export async function saveFormDraft(formData: FormData): Promise<DraftState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again to save your draft." };

  const kind = String(formData.get("draft_kind") ?? "") as DraftKind;
  if (!DRAFT_KINDS.includes(kind)) return { error: "This form can't be saved as a draft." };
  const draftId = String(formData.get("draft_id") ?? "") || null;
  const data = formValues(formData);
  const title = (data.campaign_name?.[0] ?? data.brand_name?.[0] ?? data.artist_name?.[0] ?? "").trim().slice(0, 200) || null;
  const now = new Date().toISOString();

  // A set-up form has one draft per account (partial unique index, 0092):
  // find it rather than upsert, since PostgREST can't target a partial index.
  let existingId = draftId;
  if (!existingId && kind !== "campaign_request") {
    const { data: existing } = await supabase
      .from("form_drafts")
      .select("id")
      .eq("profile_id", user.id)
      .eq("kind", kind)
      .maybeSingle<{ id: string }>();
    existingId = existing?.id ?? null;
  }

  const { data: saved, error } = existingId
    ? await supabase
        .from("form_drafts")
        .update({ data, title, updated_at: now })
        .eq("id", existingId)
        .eq("profile_id", user.id)
        .eq("kind", kind)
        .select("id")
        .maybeSingle<{ id: string }>()
    : await supabase
        .from("form_drafts")
        .insert({ profile_id: user.id, kind, data, title })
        .select("id")
        .single<{ id: string }>();
  if (error || !saved) return { error: error?.message ?? "That draft no longer exists." };

  if (kind === "campaign_request") revalidatePath("/dashboard/campaigns");
  return { draftId: saved.id, savedAt: now };
}

/** Deletes one of the caller's drafts. */
export async function deleteFormDraft(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = String(formData.get("draft_id") ?? "");
  if (!id) return;
  await supabase.from("form_drafts").delete().eq("id", id).eq("profile_id", user.id);
  revalidatePath("/dashboard/campaigns");
}
