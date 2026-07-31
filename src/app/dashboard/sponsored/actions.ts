"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify, notifyAdmins } from "@/lib/notifications";
import { uploadImage } from "@/lib/storage";
import { DEFAULT_TIMEZONE } from "@/lib/event-time";
import { getOrCreateSupportConversation } from "@/lib/data/messaging";

export interface SponsoredState {
  error?: string;
}

/** How many branding creatives a sponsorship can carry (matches the form). */
const ASSET_SLOTS = 5;

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

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  return { supabase, userId: user.id };
}

/**
 * Uploads the `asset_0…asset_N` slots and records them against the sponsorship.
 * Best-effort: a creative that fails to upload shouldn't roll back a deal that
 * has already been written.
 */
async function saveBrandingAssets(
  formData: FormData,
  sponsoredEventId: string,
  userId: string,
) {
  const rows: {
    sponsored_event_id: string;
    url: string;
    description: string | null;
    uploaded_by: string;
  }[] = [];

  for (let i = 0; i < ASSET_SLOTS; i++) {
    const upload = await uploadImage(
      formData.get(`asset_${i}`),
      "sponsored-assets",
    );
    if (!upload.url) continue;
    rows.push({
      sponsored_event_id: sponsoredEventId,
      url: upload.url,
      description: str(formData.get(`asset_desc_${i}`)),
      uploaded_by: userId,
    });
  }

  if (rows.length === 0) return;
  const supabase = await createClient();
  await supabase.from("sponsored_event_assets").insert(rows);
}

/**
 * Creates a sponsored-event record. Either side may initiate (27 Jul standup):
 * a brand proposes against an artist's listing, or an artist proposes against a
 * brand's open campaign brief. Whoever starts it has, by definition, agreed to
 * the terms they just typed — so their agreement flag is set and the other
 * party gets a proposal to review.
 */
export async function createSponsoredEvent(
  _prev: SponsoredState,
  formData: FormData,
): Promise<SponsoredState> {
  const { supabase, userId } = await requireUser();
  const campaignId = str(formData.get("campaign_id"));

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  const initiatedByBrand = Boolean(brand);

  const name = str(formData.get("name"));
  if (!name) return { error: "Event name is required." };

  const budget = num(formData.get("budget_gbp"));
  let brandId: string | null = brand?.id ?? null;
  let brandProfileId: string | null = initiatedByBrand ? userId : null;
  let listingId = str(formData.get("listing_id"));
  let listingOwnerId: string | null = null;

  if (listingId) {
    const { data: listing } = await supabase
      .from("event_listings")
      .select("owner_profile_id")
      .eq("id", listingId)
      .maybeSingle();
    listingOwnerId = listing?.owner_profile_id ?? null;
  } else {
    listingId = null;
  }

  // Brand-initiated: the artist is whoever owns the listing being sponsored.
  // Artist-initiated: the artist is the caller, and the brand comes from the
  // chosen brief — resolved server-side so a posted brand_id can't spoof it.
  let artistProfileId = listingOwnerId;

  if (!initiatedByBrand) {
    artistProfileId = userId;

    if (listingId && listingOwnerId !== userId) {
      return { error: "You can only propose against your own event listing." };
    }
    if (!campaignId) {
      return {
        error: "Choose the brand's campaign brief you're proposing against.",
      };
    }

    const { data: campaign } = await supabase
      .from("open_campaigns")
      .select("brand_id, brand_profile_id")
      .eq("id", campaignId)
      .maybeSingle<{ brand_id: string; brand_profile_id: string }>();
    if (!campaign) {
      return { error: "That campaign is no longer open for proposals." };
    }
    brandId = campaign.brand_id;
    // Taken from the view because `brands` is owner-only under RLS — an artist
    // querying it directly gets nothing back.
    brandProfileId = campaign.brand_profile_id;
  }

  if (!brandId) redirect("/onboarding");

  const banner = await uploadImage(formData.get("banner"), "sponsored-banner");
  if (banner.error) return { error: banner.error };

  const { data: created, error } = await supabase
    .from("sponsored_events")
    .insert({
      brand_id: brandId,
      campaign_id: campaignId,
      listing_id: listingId,
      artist_profile_id: artistProfileId,
      artist_display_name: str(formData.get("artist_display_name")),
      name,
      event_date: str(formData.get("event_date")),
      start_time: str(formData.get("start_time")),
      timezone: str(formData.get("timezone")) ?? DEFAULT_TIMEZONE,
      venue_details: str(formData.get("venue_details")),
      location: str(formData.get("location")),
      budget_gbp: budget,
      remaining_budget_gbp: budget,
      reward_rules: str(formData.get("reward_rules")),
      terms: str(formData.get("terms")),
      banner_url: banner.url ?? null,
      branding_guidelines: str(formData.get("branding_guidelines")),
      attendance_method: str(formData.get("attendance_method")),
      participation_deadline: str(formData.get("participation_deadline")),
      // Whoever initiated has agreed to the terms they just wrote; the other
      // side reviews and agrees to confirm the deal.
      brand_agreed: initiatedByBrand,
      artist_agreed: !initiatedByBrand,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await saveBrandingAssets(formData, created.id, userId);

  // Notify whichever side didn't initiate — they're the one with a proposal
  // waiting on them.
  const recipientProfileId = initiatedByBrand ? artistProfileId : brandProfileId;

  if (recipientProfileId) {
    await notify({
      eventKey: "offer.proposal_received",
      recipientProfileId,
      link: `/dashboard/sponsored/${created.id}`,
      variables: {
        event_name: name,
        budget:
          budget != null ? `£${budget.toLocaleString("en-GB")}` : undefined,
      },
    });
  }

  revalidatePath("/dashboard/sponsored");
  redirect(`/dashboard/sponsored/${created.id}`);
}

/** Records the current party's agreement; confirms once both sides agree. */
export async function toggleAgreement(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: ev } = await supabase
    .from("sponsored_events")
    .select("id, artist_profile_id, brand_agreed, artist_agreed, brand_id")
    .eq("id", id)
    .maybeSingle();
  if (!ev) return;

  // Is the current user the brand or the artist on this event?
  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  const isBrand = brand && brand.id === ev.brand_id;
  const isArtist = ev.artist_profile_id === userId;

  const patch: Record<string, unknown> = {};
  if (isBrand) patch.brand_agreed = !ev.brand_agreed;
  else if (isArtist) patch.artist_agreed = !ev.artist_agreed;
  else return;

  const brandAgreed = isBrand ? !ev.brand_agreed : ev.brand_agreed;
  const artistAgreed = isArtist ? !ev.artist_agreed : ev.artist_agreed;
  if (brandAgreed && artistAgreed) patch.status = "confirmed";
  else patch.status = "in_progress";

  await supabase.from("sponsored_events").update(patch).eq("id", id);

  // Let the *other* side know, and both sides once it's fully confirmed.
  const { data: full } = await supabase
    .from("sponsored_events")
    .select("name, budget_gbp, artist_profile_id, brands(profile_id, brand_name)")
    .eq("id", id)
    .maybeSingle<{
      name: string;
      budget_gbp: number | null;
      artist_profile_id: string | null;
      brands: { profile_id: string; brand_name: string } | null;
    }>();

  if (full) {
    const brandProfileId = full.brands?.profile_id ?? null;
    const budget =
      full.budget_gbp != null
        ? `£${Number(full.budget_gbp).toLocaleString("en-GB")}`
        : undefined;

    if (patch.status === "confirmed") {
      for (const pid of [brandProfileId, full.artist_profile_id]) {
        if (pid) {
          await notify({
            eventKey: "sponsorship.confirmed",
            recipientProfileId: pid,
            link: `/dashboard/sponsored/${id}`,
            variables: { event_name: full.name, budget },
          });
        }
      }
    } else if (isArtist && artistAgreed && brandProfileId) {
      await notify({
        eventKey: "sponsorship.artist_agreed",
        recipientProfileId: brandProfileId,
        link: `/dashboard/sponsored/${id}`,
        variables: { event_name: full.name },
      });
    }
  }

  revalidatePath(`/dashboard/sponsored/${id}`);
  revalidatePath("/dashboard/sponsored");
}

/**
 * Parties can edit shared terms / reward rules while the deal is in progress.
 *
 * Once it's confirmed the terms are what both sides signed up to, so edits are
 * refused here as well as hidden in the UI — otherwise one party could change
 * the deal after the other agreed to it. Contact the team to change a
 * confirmed sponsorship.
 */
export async function updateSponsoredEvent(formData: FormData) {
  const { supabase } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: current } = await supabase
    .from("sponsored_events")
    .select("status")
    .eq("id", id)
    .maybeSingle<{ status: string }>();
  if (!current || current.status !== "in_progress") return;

  await supabase
    .from("sponsored_events")
    .update({
      terms: str(formData.get("terms")),
      reward_rules: str(formData.get("reward_rules")),
      branding_guidelines: str(formData.get("branding_guidelines")),
      attendance_method: str(formData.get("attendance_method")),
      participation_deadline: str(formData.get("participation_deadline")),
    })
    .eq("id", id);
  revalidatePath(`/dashboard/sponsored/${id}`);
}

/**
 * "Contact Live·En·Synergy" from a sponsorship — the only route to changing a
 * confirmed deal, since neither party can edit it unilaterally.
 */
export async function contactSupport(formData: FormData) {
  const { userId } = await requireUser();
  const id = str(formData.get("id"));
  const eventName = str(formData.get("event_name")) ?? "a sponsorship";

  const conversationId = await getOrCreateSupportConversation({
    userProfileId: userId,
    subject: `Sponsorship: ${eventName}`,
  });

  if (!conversationId) {
    // No admin account exists to route this to — fall back to the contact form.
    redirect("/contact");
  }

  await notifyAdmins({
    eventKey: "message.received",
    link: `/dashboard/messages?c=${conversationId}`,
    variables: { sender_name: "A user", event_name: eventName },
  });

  if (id) revalidatePath(`/dashboard/sponsored/${id}`);
  redirect(`/dashboard/messages?c=${conversationId}&notice=support`);
}

export async function markCompleted(formData: FormData) {
  const { supabase } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase
    .from("sponsored_events")
    .update({ status: "completed" })
    .eq("id", id);
  revalidatePath(`/dashboard/sponsored/${id}`);
  revalidatePath("/dashboard/sponsored");
}

// --- Organiser-side participant management --------------------------------

/** Advances a participant through the selection / verification / reward flow. */
export async function updateParticipation(formData: FormData) {
  const { supabase } = await requireUser();
  const id = str(formData.get("id"));
  const eventId = str(formData.get("event_id"));
  const op = str(formData.get("op"));
  if (!id || !op) return;

  const patch: Record<string, unknown> = {};
  switch (op) {
    case "select":
      patch.selected = true;
      patch.selected_at = new Date().toISOString();
      break;
    case "reject":
      patch.selected = false;
      patch.status = "rejected";
      break;
    case "verify":
      patch.status = "attendance_verified";
      patch.attendance_verified_at = new Date().toISOString();
      break;
    case "release": {
      patch.status = "reward_released";
      patch.reward_released_at = new Date().toISOString();
      const amount = num(formData.get("reward_amount_gbp"));
      if (amount != null) patch.reward_amount_gbp = amount;
      break;
    }
    default:
      return;
  }

  await supabase.from("participations").update(patch).eq("id", id);

  // A released reward is money actually spent — draw it down from the
  // sponsored event's remaining budget so the brand's dashboard stays honest.
  if (op === "release" && eventId) {
    const amount = num(formData.get("reward_amount_gbp"));
    if (amount != null && amount > 0) {
      const { data: ev } = await supabase
        .from("sponsored_events")
        .select("remaining_budget_gbp")
        .eq("id", eventId)
        .maybeSingle();
      if (ev?.remaining_budget_gbp != null) {
        const next = Math.max(0, Number(ev.remaining_budget_gbp) - amount);
        await supabase
          .from("sponsored_events")
          .update({ remaining_budget_gbp: next })
          .eq("id", eventId);
      }
    }
  }

  // Tell the participant what just happened to them.
  const NOTIFY_BY_OP: Record<string, string> = {
    select: "participation.selected",
    reject: "participation.rejected",
    verify: "participation.verified",
    release: "reward.released",
  };
  const eventKey = NOTIFY_BY_OP[op];
  if (eventKey) {
    const { data: participation } = await supabase
      .from("participations")
      .select("audience_profile_id, reward_amount_gbp, sponsored_events(name)")
      .eq("id", id)
      .maybeSingle<{
        audience_profile_id: string;
        reward_amount_gbp: number | null;
        sponsored_events: { name: string } | null;
      }>();

    if (participation) {
      await notify({
        eventKey,
        recipientProfileId: participation.audience_profile_id,
        link: op === "release" ? "/dashboard/rewards" : "/dashboard/participations",
        variables: {
          event_name: participation.sponsored_events?.name ?? "your event",
          amount:
            participation.reward_amount_gbp != null
              ? `£${Number(participation.reward_amount_gbp).toLocaleString("en-GB")}`
              : undefined,
        },
      });
    }
  }

  if (eventId) revalidatePath(`/dashboard/sponsored/${eventId}`);
}
