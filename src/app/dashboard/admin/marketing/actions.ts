"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ukLocalInputToIso } from "@/lib/format";
import { campaignProblems, emptyContent, parseContent } from "@/lib/marketing/blocks";
import { loadBrandTokens, marketingConfig, runMarketingWorker, sendTestEmail } from "@/lib/marketing/send";
import { generateCampaignDraft, GenerateError, type GeneratedDraft } from "@/lib/marketing/generate";

export interface MarketingState {
  error?: string;
  message?: string;
  problems?: string[];
  /** "Generate with AI": words for the editor to load as unsaved changes. */
  draft?: GeneratedDraft;
}

const BASE = "/dashboard/admin/marketing";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const { profile } = await requireRole(["admin"]);
  const supabase = await createClient();
  return { profile, supabase };
}

type CampaignRow = {
  id: string;
  brand_id: string;
  name: string;
  subject: string;
  preview_text: string;
  content: unknown;
  segment: { type: "all" | "events"; event_ids?: string[] };
  status: string;
  started_at: string | null;
};

async function loadCampaign(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await supabase
    .from("marketing_campaigns")
    .select("id, brand_id, name, subject, preview_text, content, segment, status, started_at")
    .eq("id", id)
    .maybeSingle<CampaignRow>();
  return data;
}

/** Run the worker after the response, so "Send now" starts within seconds. */
function kickWorker() {
  after(async () => {
    const service = createServiceClient();
    if (service) await runMarketingWorker(service, 50_000);
  });
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function createMarketingCampaign(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const { profile, supabase } = await requireAdmin();
  const brandId = String(formData.get("brand_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!UUID.test(brandId)) return { error: "Choose the brand this email is from." };
  if (!name) return { error: "Give the campaign a name (only the team sees it)." };
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert({ brand_id: brandId, name: name.slice(0, 200), content: emptyContent(), created_by: profile.id })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { error: `Couldn't create the campaign: ${error?.message ?? "unknown error"}` };
  revalidatePath(BASE);
  redirect(`${BASE}/campaigns/${data.id}`);
}

function readSegment(formData: FormData): { type: "all" } | { type: "events"; event_ids: string[] } {
  if (formData.get("segment_type") !== "events") return { type: "all" };
  const ids = formData.getAll("event_ids").map(String).filter((v) => UUID.test(v));
  return { type: "events", event_ids: [...new Set(ids)].slice(0, 200) };
}

/** Save the draft (blocks arrive as JSON from the editor). */
export async function saveMarketingCampaign(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("campaign_id") ?? "");
  const campaign = await loadCampaign(supabase, id);
  if (!campaign) return { error: "That campaign no longer exists." };
  if (campaign.status !== "draft") return { error: "Only a draft can be edited — unschedule it first." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("content") ?? "{}"));
  } catch {
    return { error: "The email content couldn't be read — reload the page and try again." };
  }
  const segment = readSegment(formData);
  if (segment.type === "events" && segment.event_ids.length === 0) {
    return { error: "Pick at least one event, or send to everyone subscribed to the brand." };
  }
  const { error } = await supabase
    .from("marketing_campaigns")
    .update({
      name: String(formData.get("name") ?? campaign.name).trim().slice(0, 200) || campaign.name,
      subject: String(formData.get("subject") ?? "").trim().slice(0, 200),
      preview_text: String(formData.get("preview_text") ?? "").trim().slice(0, 200),
      content: parseContent(raw),
      segment,
    })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { error: `Couldn't save: ${error.message}` };
  revalidatePath(`${BASE}/campaigns/${id}`);
  revalidatePath(BASE);
  return { message: "Saved." };
}

/**
 * "Generate with AI": the model writes the words; the code, worth, expiry and
 * link are the admin's own. Returns a draft for the editor — saves nothing.
 */
export async function generateMarketingDraft(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const { supabase } = await requireAdmin();
  const campaign = await loadCampaign(supabase, String(formData.get("campaign_id") ?? ""));
  if (!campaign) return { error: "That campaign no longer exists." };
  if (campaign.status !== "draft") return { error: "Only a draft can be rewritten." };

  const brief = String(formData.get("brief") ?? "").trim().slice(0, 2000);
  if (brief.length < 15) return { error: "Describe what the email is about in a sentence or two (who it's for, what's on offer)." };
  const tone = (["friendly", "premium", "energetic"] as const).find((t) => t === formData.get("tone")) ?? "friendly";

  const code = String(formData.get("promo_code") ?? "").trim().toUpperCase();
  const discount = String(formData.get("promo_discount") ?? "").trim().slice(0, 80);
  const expiry = String(formData.get("promo_expiry") ?? "").trim().slice(0, 80);
  if (code && !/^[A-Z0-9_-]{3,40}$/.test(code)) return { error: "The promo code can use letters, numbers, - and _ only (3–40)." };
  if (code && !discount) return { error: "Say what the code is worth, e.g. \"20% off\"." };
  if (!code && discount) return { error: "Add the promo code too, or clear what it's worth." };

  const url = String(formData.get("link_url") ?? "").trim();
  if (url) {
    try {
      if (new URL(url).protocol !== "https:") return { error: "The link must start with https://." };
    } catch {
      return { error: "The link doesn't look like a web address (https://…)." };
    }
  }

  const { data: allowed } = await supabase.rpc("rate_limit_hit", { p_action: "marketing_generate", p_window_seconds: 3600, p_max: 30 });
  if (allowed !== true) return { error: "That's a lot of drafts this hour — wait a few minutes and try again." };

  const tokens = await loadBrandTokens(supabase, campaign.brand_id);
  if (!tokens) return { error: "The brand no longer exists." };
  const eventIds = formData.getAll("event_ids").map(String).filter((v) => UUID.test(v)).slice(0, 20);
  let events: string[] = [];
  if (eventIds.length) {
    const { data } = await supabase.from("sponsored_events").select("name, event_date").in("id", eventIds).eq("brand_id", campaign.brand_id);
    events = (data ?? []).map((e) => `${e.name as string}${e.event_date ? ` (${e.event_date as string})` : ""}`);
  }

  try {
    const draft = await generateCampaignDraft({
      brandName: tokens.brand_name,
      partnerName: String(formData.get("partner_name") ?? "").trim().slice(0, 80) || null,
      brief,
      tone,
      events,
      promo: code ? { code, discount, expiry } : null,
      link: url ? { url, label: String(formData.get("link_label") ?? "").trim().slice(0, 60) } : null,
    });
    return { draft, message: "Draft written — review it in the preview, edit anything, then save." };
  } catch (e) {
    return { error: e instanceof GenerateError ? e.message : "The draft couldn't be written — try again." };
  }
}

/** Everything that must be true before a campaign can be scheduled or tested. */
async function readiness(supabase: Awaited<ReturnType<typeof createClient>>, c: CampaignRow): Promise<string[]> {
  const tokens = await loadBrandTokens(supabase, c.brand_id);
  if (!tokens) return ["The brand no longer exists."];
  const problems = campaignProblems({ subject: c.subject, content: parseContent(c.content) }, tokens);
  const { missing } = marketingConfig();
  if (missing) problems.push(`Sending isn't set up yet: ${missing}`);
  return problems;
}

export async function sendMarketingTest(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const { profile, supabase } = await requireAdmin();
  const id = String(formData.get("campaign_id") ?? "");
  const campaign = await loadCampaign(supabase, id);
  if (!campaign) return { error: "That campaign no longer exists." };

  const raw = String(formData.get("to") ?? "").trim() || profile.email || "";
  const to = raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (to.length === 0) return { error: "Add an address to send the test to." };
  if (to.length > 5) return { error: "Send a test to at most 5 addresses." };
  if (to.some((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))) return { error: "One of those addresses doesn't look right." };

  const { data: allowed } = await supabase.rpc("rate_limit_hit", { p_action: "marketing_test", p_window_seconds: 3600, p_max: 20 });
  if (allowed !== true) return { error: "That's a lot of test sends — wait a few minutes and try again." };

  const problems = await readiness(supabase, campaign);
  if (problems.length) return { error: "Fix these first (save the draft after editing):", problems };

  const res = await sendTestEmail(
    supabase,
    campaign,
    { profileId: profile.id, firstName: (profile.full_name ?? "").split(" ")[0] || null },
    to,
  );
  if (!res.ok) return { error: res.error ?? "The test didn't send." };
  await supabase.from("marketing_campaigns").update({ test_sent_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`${BASE}/campaigns/${id}`);
  return { message: `Test sent to ${res.sentTo?.join(", ")}. Check the inbox, the dark-mode look and the unsubscribe link.` };
}

/** Schedule for later, or send now ("when" = "now"). */
export async function scheduleMarketingCampaign(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("campaign_id") ?? "");
  const campaign = await loadCampaign(supabase, id);
  if (!campaign) return { error: "That campaign no longer exists." };
  if (campaign.status !== "draft") return { error: "This campaign is already scheduled or sending." };

  const now = formData.get("when") === "now";
  const at = now ? new Date().toISOString() : ukLocalInputToIso(String(formData.get("scheduled_at") ?? ""));
  if (!at) return { error: "Pick a date and time (UK time), or send now." };
  if (!now && new Date(at).getTime() < Date.now() - 60_000) return { error: "That time has passed — pick a later one, or send now." };

  const problems = await readiness(supabase, campaign);
  if (problems.length) return { error: "Fix these first (save the draft after editing):", problems };

  const { data: brandPause } = await supabase
    .from("brand_marketing_settings")
    .select("paused_at, paused_reason")
    .eq("brand_id", campaign.brand_id)
    .maybeSingle<{ paused_at: string | null; paused_reason: string | null }>();
  if (brandPause?.paused_at) {
    return { error: `This brand's sending is paused (${brandPause.paused_reason ?? "by an admin"}). Resume it in Brand settings first.` };
  }

  const { count } = await countAudience(supabase, campaign);
  if (!count) return { error: "Nobody would receive this — no one subscribed to this brand (in this segment) can be emailed." };

  const { error } = await supabase
    .from("marketing_campaigns")
    .update({ status: "scheduled", scheduled_at: at })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { error: `Couldn't schedule: ${error.message}` };
  if (now) kickWorker();
  revalidatePath(`${BASE}/campaigns/${id}`);
  revalidatePath(BASE);
  return { message: now ? `Sending to about ${count} people — progress shows below.` : `Scheduled. About ${count} people right now; the list is taken when it starts.` };
}

async function countAudience(supabase: Awaited<ReturnType<typeof createClient>>, c: Pick<CampaignRow, "brand_id" | "segment">) {
  const { data, error } = await supabase.rpc("marketing_audience_count", { p_brand_id: c.brand_id, p_segment: c.segment });
  return { count: typeof data === "number" ? data : 0, error };
}

/** Pause / resume / unschedule / cancel. */
export async function changeMarketingCampaign(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("campaign_id") ?? "");
  const op = String(formData.get("op") ?? "");
  const campaign = await loadCampaign(supabase, id);
  if (!campaign) return { error: "That campaign no longer exists." };

  const set = async (patch: Record<string, unknown>, from: string[]) => {
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .update(patch)
      .eq("id", id)
      .in("status", from)
      .select("id");
    if (error) return error.message;
    if (!data?.length) return "The campaign changed meanwhile — reload the page.";
    return null;
  };

  let err: string | null = null;
  let message = "";
  switch (op) {
    case "unschedule":
      if (campaign.status !== "scheduled") return { error: "Only a scheduled campaign can be unscheduled." };
      err = await set({ status: "draft", scheduled_at: null }, ["scheduled"]);
      message = "Back to draft — edit it and schedule again.";
      break;
    case "pause":
      if (!["scheduled", "sending"].includes(campaign.status)) return { error: "Only a scheduled or sending campaign can be paused." };
      err = await set({ status: "paused", paused_reason: "Paused by an admin." }, ["scheduled", "sending"]);
      message = "Paused. Nothing more goes out until you resume.";
      break;
    case "resume": {
      if (campaign.status !== "paused") return { error: "Only a paused campaign can be resumed." };
      const { data: brandPause } = await supabase
        .from("brand_marketing_settings")
        .select("paused_at")
        .eq("brand_id", campaign.brand_id)
        .maybeSingle<{ paused_at: string | null }>();
      if (brandPause?.paused_at) return { error: "The brand's sending is paused — review and resume it in Brand settings first." };
      const problems = await readiness(supabase, campaign);
      if (problems.length) return { error: "Fix these first:", problems };
      // Not started yet → back to the schedule (now); started → carry on sending.
      err = await set(
        campaign.started_at
          ? { status: "sending", paused_reason: null }
          : { status: "scheduled", scheduled_at: new Date().toISOString(), paused_reason: null },
        ["paused"],
      );
      if (!err) kickWorker();
      message = "Resumed — sending continues where it stopped.";
      break;
    }
    case "cancel":
      if (!["draft", "scheduled", "paused"].includes(campaign.status)) {
        return { error: "Pause the campaign before cancelling it." };
      }
      err = await set({ status: "cancelled", finished_at: new Date().toISOString() }, ["draft", "scheduled", "paused"]);
      message = "Cancelled. Anyone not yet emailed won't be.";
      break;
    default:
      return { error: "Choose what to do." };
  }
  if (err) return { error: err };
  revalidatePath(`${BASE}/campaigns/${id}`);
  revalidatePath(BASE);
  return { message };
}

/** Duplicate any campaign (e.g. a sent one) into a new draft. */
export async function duplicateMarketingCampaign(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const { profile, supabase } = await requireAdmin();
  const campaign = await loadCampaign(supabase, String(formData.get("campaign_id") ?? ""));
  if (!campaign) return { error: "That campaign no longer exists." };
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert({
      brand_id: campaign.brand_id,
      name: `${campaign.name} (copy)`.slice(0, 200),
      subject: campaign.subject,
      preview_text: campaign.preview_text,
      content: parseContent(campaign.content),
      segment: campaign.segment,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { error: `Couldn't copy: ${error?.message ?? "unknown error"}` };
  revalidatePath(BASE);
  redirect(`${BASE}/campaigns/${data.id}`);
}

// ---------------------------------------------------------------------------
// Brand settings
// ---------------------------------------------------------------------------

const httpsOrNull = (v: FormDataEntryValue | null): string | null | "bad" => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  try {
    return new URL(s).protocol === "https:" ? s : "bad";
  } catch {
    return "bad";
  }
};

export async function saveBrandMarketingSettings(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const { profile, supabase } = await requireAdmin();
  const brandId = String(formData.get("brand_id") ?? "");
  if (!UUID.test(brandId)) return { error: "Choose a brand." };

  const logo = httpsOrNull(formData.get("logo_url"));
  if (logo === "bad") return { error: "The logo must be an https:// image address (leave blank to use the brand's profile logo)." };
  const accent = String(formData.get("accent_color") ?? "").trim();
  if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) return { error: "The accent colour must look like #ed9a4e." };
  const replyTo = String(formData.get("reply_to") ?? "").trim();
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) return { error: "The reply-to address doesn't look right." };
  const background = formData.get("background") === "dark" ? "dark" : "light";

  const { error } = await supabase.from("brand_marketing_settings").upsert(
    {
      brand_id: brandId,
      logo_url: logo,
      accent_color: accent || null,
      background,
      font_stack: String(formData.get("font_stack") ?? "").trim().slice(0, 200) || null,
      footer_legal: String(formData.get("footer_legal") ?? "").trim().slice(0, 500) || null,
      physical_address: String(formData.get("physical_address") ?? "").trim().slice(0, 300) || null,
      reply_to: replyTo || null,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: "brand_id" },
  );
  if (error) return { error: `Couldn't save: ${error.message}` };
  revalidatePath(`${BASE}/brands`);
  return { message: "Brand settings saved." };
}

export async function setBrandMarketingPause(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const { profile, supabase } = await requireAdmin();
  const brandId = String(formData.get("brand_id") ?? "");
  if (!UUID.test(brandId)) return { error: "Choose a brand." };
  const pause = formData.get("op") === "pause";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (pause && !reason) return { error: "Say why sending is paused (other admins will see it)." };

  const { error } = await supabase.from("brand_marketing_settings").upsert(
    {
      brand_id: brandId,
      paused_at: pause ? new Date().toISOString() : null,
      paused_reason: pause ? reason : null,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: "brand_id" },
  );
  if (error) return { error: `Couldn't update: ${error.message}` };
  if (pause) {
    // Stop anything in flight for this brand too.
    await supabase
      .from("marketing_campaigns")
      .update({ status: "paused", paused_reason: `Brand paused: ${reason}` })
      .eq("brand_id", brandId)
      .in("status", ["scheduled", "sending"]);
  }
  await supabase.rpc("log_admin_action", {
    p_action: pause ? "marketing.brand_paused" : "marketing.brand_resumed",
    p_target_type: "brand",
    p_target_id: brandId,
    p_detail: { reason: reason || null },
  });
  revalidatePath(`${BASE}/brands`);
  revalidatePath(BASE);
  return {
    message: pause
      ? "Sending paused for this brand. Its scheduled and sending campaigns are paused too."
      : "Sending resumed for this brand. Paused campaigns stay paused until you resume each one.",
  };
}
