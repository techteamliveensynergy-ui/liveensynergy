import type { SupabaseClient } from "@supabase/supabase-js";

/** Forms that can be saved half-finished (GitHub #79, migration 0092). */
export const DRAFT_KINDS = ["campaign_request", "onboarding_brand", "onboarding_artist", "onboarding_event"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export interface FormDraft {
  id: string;
  kind: DraftKind;
  title: string | null;
  data: Record<string, string[]>;
  updated_at: string;
}

/** The caller's draft of a form — by id, or their one set-up draft. RLS
 *  keeps it to the owner; a missing table (0092 not applied) reads as none. */
export async function loadDraft(
  supabase: SupabaseClient,
  profileId: string,
  kind: DraftKind,
  id?: string | null,
): Promise<FormDraft | null> {
  let query = supabase
    .from("form_drafts")
    .select("id, kind, title, data, updated_at")
    .eq("profile_id", profileId)
    .eq("kind", kind);
  if (id) query = query.eq("id", id);
  const { data } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle<FormDraft>();
  return data ?? null;
}

/** Removes a draft once its form has been submitted for real. Best-effort. */
export async function clearDraft(
  supabase: SupabaseClient,
  profileId: string,
  kind: DraftKind,
  id?: string | null,
): Promise<void> {
  let query = supabase.from("form_drafts").delete().eq("profile_id", profileId).eq("kind", kind);
  if (id) query = query.eq("id", id);
  await query.then(
    () => undefined,
    () => undefined,
  );
}
