import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";
import {
  describeTierValue,
  generateCodes,
  MAX_CODES_PER_BATCH,
  type ParsedCode,
} from "@/lib/discount-codes";
import type { SponsoredEventRewardTier } from "@/lib/types";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Why issuing failed. The admin page maps each to a sentence
 * (GATE_NOTICES there + ISSUE_REFUSALS in lib/discount-codes).
 */
export type IssueRefusal =
  | "not_confirmed"
  | "pool_empty"
  | "shared_missing"
  | "cap"
  | "already"
  | "failed";

export type IssueResult = { ok: true; code: string } | { ok: false; reason: IssueRefusal };

/**
 * Hands one participant one code from `tier`, according to its pattern:
 *
 *   shared (A/B) — the tier's shared_code, while the cap (if any) lasts
 *   unique (C)   — the oldest unassigned code in the tier's pool
 *
 * A code is never invented here: it has to already exist on the brand's
 * ticketing platform, so a unique tier with an empty pool refuses rather than
 * making one up. The caller has already checked ownership, attendance status,
 * the survey gate and the artist's consent.
 */
export async function issueCodeFromTier(
  supabase: Client,
  args: {
    eventId: string;
    eventName: string;
    participationId: string;
    recipientProfileId: string;
    tier: SponsoredEventRewardTier;
    issuedBy: string;
  },
): Promise<IssueResult> {
  const { tier } = args;

  if (tier.participant_cap != null) {
    // Void doesn't count against the cap — a voided code shouldn't
    // permanently consume a capped slot.
    const { count } = await supabase
      .from("reward_codes")
      .select("id", { count: "exact", head: true })
      .eq("tier_id", tier.id)
      .neq("status", "void");
    if ((count ?? 0) >= tier.participant_cap) return { ok: false, reason: "cap" };
  }

  const snapshot = {
    sponsored_event_id: args.eventId,
    participation_id: args.participationId,
    tier_id: tier.id,
    code_type: tier.code_type ?? "discount",
    value_label: describeTierValue(tier),
    value_gbp: tier.value_gbp,
    redemption_platform: tier.redemption_platform,
    redemption_url: tier.redemption_url,
    redemption_instructions: tier.redemption_instructions,
    // valid_until is a calendar date; the code is good through the end of it.
    expires_at: tier.valid_until ? `${tier.valid_until}T23:59:59Z` : null,
    issued_by: args.issuedBy,
  };

  let code: string | null = null;

  if (tier.distribution_model === "shared") {
    if (!tier.shared_code) return { ok: false, reason: "shared_missing" };
    const { error } = await supabase
      .from("reward_codes")
      .insert({ ...snapshot, code: tier.shared_code, is_shared: true });
    if (error) return { ok: false, reason: error.code === "23505" ? "already" : "failed" };
    code = tier.shared_code;
  } else {
    // Claim-then-insert. The claim is a conditional update (only if nobody
    // has claimed it yet), so two admins issuing at once can't both take the
    // same code — the loser sees zero rows and moves to the next candidate.
    // Claiming first also means a failed insert can simply release the claim;
    // reward_codes has no delete policy to undo an insert with.
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const { data: candidate } = await supabase
        .from("reward_code_pool")
        .select("id, code, external_ref")
        .eq("tier_id", tier.id)
        .is("assigned_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle<{ id: string; code: string; external_ref: string | null }>();
      if (!candidate) return { ok: false, reason: "pool_empty" };

      const { data: claimed } = await supabase
        .from("reward_code_pool")
        .update({ assigned_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .is("assigned_at", null)
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      const { data: created, error } = await supabase
        .from("reward_codes")
        .insert({ ...snapshot, code: candidate.code, external_ref: candidate.external_ref })
        .select("id")
        .single<{ id: string }>();
      if (error) {
        await supabase.from("reward_code_pool").update({ assigned_at: null }).eq("id", candidate.id);
        if (error.code === "23505" && error.message.includes("one_live_per_participation")) {
          return { ok: false, reason: "already" };
        }
        return { ok: false, reason: "failed" };
      }

      await supabase
        .from("reward_code_pool")
        .update({ assigned_code_id: created.id })
        .eq("id", candidate.id);
      code = candidate.code;
    }
    if (!code) return { ok: false, reason: "failed" };
  }

  await notify({
    eventKey: "reward.code_issued",
    recipientProfileId: args.recipientProfileId,
    link: "/dashboard/rewards",
    variables: {
      event_name: args.eventName,
      code,
      value_label: describeTierValue(tier),
    },
  });

  return { ok: true, code };
}

/**
 * Adds codes to a unique tier's pool. `rows` is either a parsed upload or a
 * freshly generated batch. Duplicates of codes already on the event are
 * skipped, not errors — re-pasting the same export shouldn't fail.
 */
export async function insertPoolCodes(
  supabase: Client,
  args: {
    eventId: string;
    tierId: string;
    source: "generated" | "uploaded";
    rows: ParsedCode[];
    createdBy: string;
  },
): Promise<{ added: number; skipped: number; error?: string }> {
  if (args.rows.length === 0) return { added: 0, skipped: 0 };
  if (args.rows.length > MAX_CODES_PER_BATCH) {
    return { added: 0, skipped: 0, error: `At most ${MAX_CODES_PER_BATCH} codes at a time.` };
  }
  const { data, error } = await supabase
    .from("reward_code_pool")
    .upsert(
      args.rows.map((r) => ({
        sponsored_event_id: args.eventId,
        tier_id: args.tierId,
        code: r.code,
        external_ref: r.external_ref,
        source: args.source,
        created_by: args.createdBy,
      })),
      { onConflict: "sponsored_event_id,code", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return { added: 0, skipped: 0, error: friendlyDbError(error.message) };
  const added = data?.length ?? 0;
  return { added, skipped: args.rows.length - added };
}

/** A fresh batch of `count` codes for a unique tier, avoiding every code
 * already on the event. */
export async function generatePoolBatch(
  supabase: Client,
  args: { eventId: string; tier: SponsoredEventRewardTier; count: number },
): Promise<ParsedCode[]> {
  const { data } = await supabase
    .from("reward_code_pool")
    .select("code")
    .eq("sponsored_event_id", args.eventId);
  const existing = new Set((data ?? []).map((r: { code: string }) => r.code));
  return generateCodes(args.count, args.tier.code_prefix, args.tier.code_random_length, existing).map(
    (code) => ({ code, external_ref: null }),
  );
}

/** The freeze trigger's message is already user-facing; anything else is not. */
export function friendlyDbError(message: string): string {
  if (message.includes("confirmed by the artist")) {
    return "The artist has already confirmed these discount codes — reopen them before editing.";
  }
  if (message.includes("row-level security")) {
    return "You can't change the codes on this tier.";
  }
  return message;
}

/** A pasted batch plus, optionally, an uploaded .csv/.txt — both accepted so
 * a platform export can be dropped in whole. */
export async function codeBatchText(formData: FormData): Promise<string> {
  const pasted = String(formData.get("codes") ?? "");
  const file = formData.get("codes_file");
  let fromFile = "";
  if (file && typeof file !== "string" && file.size > 0) {
    // 1 MB is ~40,000 codes — far past MAX_CODES_PER_BATCH, so anything
    // larger is the wrong file.
    if (file.size <= 1024 * 1024) fromFile = await file.text();
  }
  return [pasted, fromFile].filter(Boolean).join("\n");
}

export function invalidCodesMessage(invalid: string[]): string {
  const n = invalid.length;
  return `${n} line${n === 1 ? " isn't a valid code" : "s aren't valid codes"} (letters, numbers, - and _ only, 3–40 characters): ${invalid
    .slice(0, 5)
    .join(", ")}${n > 5 ? "…" : ""}`;
}
