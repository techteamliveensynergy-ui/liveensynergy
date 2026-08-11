"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify, notifyAdmins } from "@/lib/notifications";
import { uploadImage } from "@/lib/storage";
import { assessProfile } from "@/lib/profile-completeness";
import { normaliseUrl } from "@/lib/urls";
import { getOrCreateConversation } from "@/lib/data/messaging";
import {
  computePlatformFee,
  MIN_SPONSORSHIP_BUDGET_GBP,
  PLATFORM_FEE,
} from "@/lib/constants";

export interface CampaignState {
  error?: string;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function requireBrand() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!brand) redirect("/onboarding");
  return { supabase, brandId: brand.id as string, brand };
}

function payload(formData: FormData) {
  return {
    description: str(formData.get("description")),
    budget_gbp: num(formData.get("budget_gbp")),
    category: str(formData.get("category")),
    category_other: str(formData.get("category_other")),
    preferred_location: str(formData.get("preferred_location")),
    preferred_timeline: str(formData.get("preferred_timeline")),
    target_name: str(formData.get("target_name")),
    reward_rules: str(formData.get("reward_rules")),
    expected_outcomes: str(formData.get("expected_outcomes")),
    additional_info: str(formData.get("additional_info")),
    // The sponsor's own suggestion for what to sponsor (10 Aug standup). The
    // link is normalised here rather than trusted — the same rule the profile
    // link fields use, so "eventbrite.co.uk/e/123" is accepted and stored as a
    // full https:// URL.
    suggested_event_note: str(formData.get("suggested_event_note")),
    suggested_event_url: normaliseUrl(
      formData.get("suggested_event_url"),
      "The suggested event link",
    ).url,
    manager_name: str(formData.get("manager_name")),
    manager_email: str(formData.get("manager_email")),
    manager_phone: str(formData.get("manager_phone")),
  };
}

/**
 * Campaign manager details are mandatory — the team has 48 hours to reach the
 * sponsor after a match, and can't do that without a way to contact them.
 */
function validate(
  p: ReturnType<typeof payload>,
  formData: FormData,
): string | null {
  if (!p.description) return "Campaign description is required.";
  // A link that couldn't be parsed comes back null, which would otherwise be
  // indistinguishable from an empty field and silently drop what they typed.
  const link = normaliseUrl(
    formData.get("suggested_event_url"),
    "The suggested event link",
  );
  if (link.error) return link.error;
  if (p.budget_gbp == null) return "Sponsorship budget is required.";
  // Derived from the fee itself rather than a hard-coded floor, so this guard
  // follows automatically if the pricing model ever changes.
  if (computePlatformFee(p.budget_gbp).availableForSponsorship <= 0) {
    return `Sponsorship budget must be more than £${MIN_SPONSORSHIP_BUDGET_GBP.toLocaleString("en-GB")} — at or below that, the £${PLATFORM_FEE.minFlatGbp} + VAT service fee takes the whole budget and leaves nothing to sponsor with.`;
  }
  if (!p.manager_name) return "Campaign manager's name is required.";
  if (!p.manager_email) return "Campaign manager's email is required.";
  if (!p.manager_phone) return "Campaign manager's phone number is required.";
  return null;
}

export async function createCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const { supabase, brandId, brand } = await requireBrand();
  const p = payload(formData);
  const invalid = validate(p, formData);
  if (invalid) return { error: invalid };

  // Mirrors the gate on /dashboard/campaigns/new — the team can't action a
  // campaign from a brand it has no way to contact.
  const { blocking } = assessProfile("brand", brand);
  if (blocking.length > 0) {
    return {
      error: `Complete your brand profile first — still missing: ${blocking
        .map((f) => f.label)
        .join(", ")}.`,
    };
  }

  const image = await uploadImage(formData.get("image"), "campaign");
  if (image.error) return { error: image.error };

  const { data: created, error } = await supabase
    .from("campaigns")
    .insert({ ...p, image_url: image.url ?? null, brand_id: brandId })
    .select("id, reference")
    .single();
  if (error) return { error: error.message };

  const budget = `£${Number(p.budget_gbp).toLocaleString("en-GB")}`;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await notify({
      eventKey: "campaign.created",
      recipientProfileId: user.id,
      link: `/dashboard/campaigns/${created.id}`,
      variables: { campaign_reference: created.reference, budget },
    });
  }
  // The whole model depends on the team matching this to an event.
  await notifyAdmins({
    eventKey: "admin.campaign_request",
    link: "/dashboard/admin",
    variables: { campaign_reference: created.reference, budget },
  });

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}

export async function updateCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const { supabase, brandId } = await requireBrand();
  const id = str(formData.get("id"));
  if (!id) return { error: "Missing campaign id." };
  const p = payload(formData);
  const invalid = validate(p, formData);
  if (invalid) return { error: invalid };

  const image = await uploadImage(formData.get("image"), "campaign");
  if (image.error) return { error: image.error };

  // Read the suggestion as it stands, to tell an actual change from a save
  // that happened to touch something else.
  const { data: before } = await supabase
    .from("campaigns")
    .select("reference, suggested_event_note, suggested_event_url")
    .eq("id", id)
    .eq("brand_id", brandId)
    .maybeSingle<{
      reference: string;
      suggested_event_note: string | null;
      suggested_event_url: string | null;
    }>();

  const { error } = await supabase
    .from("campaigns")
    // Leaving the picker empty keeps the existing artwork.
    .update(image.url ? { ...p, image_url: image.url } : p)
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) return { error: error.message };

  const suggestionChanged =
    p.suggested_event_note !== (before?.suggested_event_note ?? null) ||
    p.suggested_event_url !== (before?.suggested_event_url ?? null);
  if (suggestionChanged && p.suggested_event_note) {
    await shareSuggestion(id, before?.reference ?? "", p);
  }

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}

/**
 * Puts a changed suggestion into the chat with each artist working on this
 * campaign.
 *
 * `matchCampaign` relays the suggestion when the team first puts events in
 * front of a sponsor, which covers the case the standup described. It does
 * nothing for a suggestion added *afterwards*: the campaign is matched by
 * then, so it has dropped off the artist-facing browse (`open_campaigns`
 * excludes matched campaigns) and there is no second match to trigger a
 * relay — the artist would never see it. Found while testing on 11 Aug.
 *
 * Sent by the brand, from their own account, into a thread they're already a
 * party to — so this needs no new permission.
 */
async function shareSuggestion(
  campaignId: string,
  reference: string,
  p: ReturnType<typeof payload>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: events } = await supabase
    .from("sponsored_events")
    .select("artist_profile_id, listing_id")
    .eq("campaign_id", campaignId)
    .not("artist_profile_id", "is", null);

  const parties = (events ?? []) as {
    artist_profile_id: string;
    listing_id: string | null;
  }[];
  if (parties.length === 0) return;

  const body = [
    `We've updated the event we'd like to sponsor${reference ? ` for campaign ${reference}` : ""}:`,
    "",
    p.suggested_event_note,
    p.suggested_event_url ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const seen = new Set<string>();
  for (const party of parties) {
    // One message per artist, not per proposal — a campaign can carry several
    // suggested events for the same act.
    const key = `${party.artist_profile_id}:${party.listing_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const conversationId = await getOrCreateConversation({
      brandProfileId: user.id,
      partnerProfileId: party.artist_profile_id,
      listingId: party.listing_id,
    });
    if (!conversationId) continue;

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_profile_id: user.id,
      body,
    });
    await notify({
      eventKey: "message.received",
      recipientProfileId: party.artist_profile_id,
      link: `/dashboard/messages?c=${conversationId}`,
      variables: {
        sender_name: "The sponsor",
        event_name: reference || "your sponsorship",
      },
    });
  }
}

export async function deleteCampaign(formData: FormData) {
  const { supabase, brandId } = await requireBrand();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase.from("campaigns").delete().eq("id", id).eq("brand_id", brandId);
  revalidatePath("/dashboard/campaigns");
}
