import { createClient } from "@/lib/supabase/server";
import type { SurveyQualityStatus, SurveyTemplateKind } from "@/lib/types";

/**
 * Whether a participation may receive a reward code / release, per the
 * survey configured on its campaign. `open` and `missing` are gate-specific
 * — every other code is a `survey_responses.quality_status` value passed
 * straight through, so a `pass` here means the same thing it means on the
 * review queue.
 */
export type RewardGateCode = "open" | "pass" | "missing" | "pending" | "review" | "reject";

const GATE_NOTES: Record<RewardGateCode, string> = {
  open: "No survey on this campaign — issuing is admin discretion.",
  pass: "Survey passed.",
  missing: "No post-event survey response yet — nothing to check.",
  pending: "Survey submitted but not scored yet. Try again shortly.",
  review: "Survey is in the review queue — approve or reject it there first.",
  reject: "Survey failed the quality check — no reward code.",
};

export interface RewardGate {
  code: RewardGateCode;
  allowed: boolean;
  /** Which survey kind the verdict came from (or is still awaited for). */
  kind: SurveyTemplateKind | null;
  responseId: string | null;
  note: string;
}

interface GateResponse {
  id: string;
  kind: SurveyTemplateKind;
  quality_status: SurveyQualityStatus;
}

/**
 * Pure decision function — both `rewardGateFor()` and `rewardGatesForEvent()`
 * resolve their inputs then call this, so a page's read and an action's
 * enforcement can never disagree about what a gate means.
 */
export function decideRewardGate(args: {
  requiredKind: SurveyTemplateKind | null;
  responses: GateResponse[];
}): RewardGate {
  const { requiredKind, responses } = args;

  if (!requiredKind) {
    return { code: "open", allowed: true, kind: null, responseId: null, note: GATE_NOTES.open };
  }

  const response = responses.find((r) => r.kind === requiredKind);
  if (!response) {
    return {
      code: "missing",
      allowed: false,
      kind: requiredKind,
      responseId: null,
      note: GATE_NOTES.missing,
    };
  }

  const code = response.quality_status as RewardGateCode;
  return {
    code,
    allowed: code === "pass",
    kind: requiredKind,
    responseId: response.id,
    note: GATE_NOTES[code],
  };
}

/**
 * Post-event takes precedence over pre-event when a campaign has both — the
 * post-event survey is the reward-code instrument (build plan §03 stage 6).
 * `archived` counts alongside `published`: saveSurveyQuestions() refuses to
 * revert a responded-to survey back to draft, so archiving is the only way
 * to retire one, and not counting it would let archiving reopen unrestricted
 * issuance. A campaign with no configured survey at all gates `open` —
 * every pre-0032 sponsorship has no template, and blocking those would brick
 * issuance for every existing campaign.
 */
function requiredKindFrom(templates: { kind: SurveyTemplateKind; status: string }[]): SurveyTemplateKind | null {
  const configured = new Set(
    templates.filter((t) => t.status === "published" || t.status === "archived").map((t) => t.kind),
  );
  if (configured.has("post_event")) return "post_event";
  if (configured.has("pre_event")) return "pre_event";
  return null;
}

/** One participation — used by `issueRewardCode()` and the `release` gate. */
export async function rewardGateFor(args: {
  campaignId: string | null;
  participationId: string;
}): Promise<RewardGate> {
  const { campaignId, participationId } = args;
  if (!campaignId) return decideRewardGate({ requiredKind: null, responses: [] });

  const supabase = await createClient();

  const { data: templateRows } = await supabase
    .from("survey_templates")
    .select("id, kind, status")
    .eq("campaign_id", campaignId);
  const templates = (templateRows ?? []) as { id: string; kind: SurveyTemplateKind; status: string }[];
  const requiredKind = requiredKindFrom(templates);
  if (!requiredKind) return decideRewardGate({ requiredKind: null, responses: [] });

  const kindByTemplateId = new Map(templates.map((t) => [t.id, t.kind]));
  const { data: responseRows } = await supabase
    .from("survey_responses")
    .select("id, template_id, quality_status")
    .eq("participation_id", participationId);

  const responses: GateResponse[] = (
    (responseRows ?? []) as { id: string; template_id: string; quality_status: SurveyQualityStatus }[]
  )
    .map((r) => ({ id: r.id, kind: kindByTemplateId.get(r.template_id), quality_status: r.quality_status }))
    .filter((r): r is GateResponse => r.kind != null);

  return decideRewardGate({ requiredKind, responses });
}

/** Whole event in two queries — used by the admin sponsored-event page. */
export async function rewardGatesForEvent(args: {
  campaignId: string | null;
  participationIds: string[];
}): Promise<{ requiredKind: SurveyTemplateKind | null; gates: Map<string, RewardGate> }> {
  const { campaignId, participationIds } = args;
  const gates = new Map<string, RewardGate>();
  if (participationIds.length === 0) return { requiredKind: null, gates };

  if (!campaignId) {
    const gate = decideRewardGate({ requiredKind: null, responses: [] });
    for (const id of participationIds) gates.set(id, gate);
    return { requiredKind: null, gates };
  }

  const supabase = await createClient();

  const { data: templateRows } = await supabase
    .from("survey_templates")
    .select("id, kind, status")
    .eq("campaign_id", campaignId);
  const templates = (templateRows ?? []) as { id: string; kind: SurveyTemplateKind; status: string }[];
  const requiredKind = requiredKindFrom(templates);

  if (!requiredKind) {
    const gate = decideRewardGate({ requiredKind: null, responses: [] });
    for (const id of participationIds) gates.set(id, gate);
    return { requiredKind: null, gates };
  }

  const kindByTemplateId = new Map(templates.map((t) => [t.id, t.kind]));
  const { data: responseRows } = await supabase
    .from("survey_responses")
    .select("id, template_id, participation_id, quality_status")
    .in("participation_id", participationIds);

  const responsesByParticipation = new Map<string, GateResponse[]>();
  for (const r of (responseRows ?? []) as {
    id: string;
    template_id: string;
    participation_id: string;
    quality_status: SurveyQualityStatus;
  }[]) {
    const kind = kindByTemplateId.get(r.template_id);
    if (!kind) continue;
    const list = responsesByParticipation.get(r.participation_id) ?? [];
    list.push({ id: r.id, kind, quality_status: r.quality_status });
    responsesByParticipation.set(r.participation_id, list);
  }

  for (const id of participationIds) {
    gates.set(
      id,
      decideRewardGate({ requiredKind, responses: responsesByParticipation.get(id) ?? [] }),
    );
  }

  return { requiredKind, gates };
}
