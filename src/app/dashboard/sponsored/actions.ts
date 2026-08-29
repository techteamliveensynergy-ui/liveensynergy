"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { netForCampaign, SPONSORED_ASSET_SLOTS } from "@/lib/constants";
import { notify, notifyAdmins } from "@/lib/notifications";
import { uploadImage, uploadPrivateFile } from "@/lib/storage";
import { DEFAULT_TIMEZONE, eventStartInstant } from "@/lib/event-time";
import { getOrCreateSupportConversation } from "@/lib/data/messaging";

export interface SponsoredState {
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

  for (let i = 0; i < SPONSORED_ASSET_SLOTS; i++) {
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
  let packagePlatformMarginGbp: number | null = null;

  if (initiatedByBrand && campaignId) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("package_platform_margin_gbp")
      .eq("id", campaignId)
      .eq("brand_id", brandId)
      .maybeSingle<{ package_platform_margin_gbp: number | null }>();
    packagePlatformMarginGbp = campaign?.package_platform_margin_gbp ?? null;
  }

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
      .select("brand_id, brand_profile_id, package_platform_margin_gbp")
      .eq("id", campaignId)
      .maybeSingle<{
        brand_id: string;
        brand_profile_id: string;
        package_platform_margin_gbp: number | null;
      }>();
    if (!campaign) {
      return { error: "That campaign is no longer open for proposals." };
    }
    brandId = campaign.brand_id;
    // Taken from the view because `brands` is owner-only under RLS — an artist
    // querying it directly gets nothing back.
    brandProfileId = campaign.brand_profile_id;
    packagePlatformMarginGbp = campaign.package_platform_margin_gbp;
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
      // Net of the package margin if this came from one, otherwise the
      // global platform fee inc VAT — the gross budget is never what's
      // available to pay out in rewards (3 Aug standup).
      remaining_budget_gbp: netForCampaign({
        budget_gbp: budget,
        package_platform_margin_gbp: packagePlatformMarginGbp,
      }),
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
    .select("id, reference")
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
        // Templates quote the reference (0023). Tokens that don't resolve are
        // left visible as "{{budget}}", so every one gets a real fallback
        // rather than being left undefined.
        reference: created.reference,
        budget:
          budget != null
            ? `£${budget.toLocaleString("en-GB")}`
            : "to be agreed",
      },
    });
  }

  revalidatePath("/dashboard/sponsored");
  redirect(`/dashboard/sponsored/${created.id}`);
}

/**
 * Records the current party's agreement; confirms once both sides agree.
 *
 * Confirmation is final (3 Aug standup): there's no undo, so the button is
 * hidden once the deal locks and this refuses to act on anything that isn't
 * still in progress. Accepting also closes the campaign behind the deal and
 * withdraws the other events that were suggested alongside it.
 */
export async function toggleAgreement(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;

  // The whole decision — authorise, record the agreement, and settle the
  // campaign if that was the second one — happens inside one locked
  // transaction (0022). Doing it here meant two people agreeing to sibling
  // proposals at the same moment could both read "in progress" and both
  // confirm, leaving one campaign with two live sponsorships.
  const { data, error } = await supabase.rpc("agree_to_sponsorship", {
    p_event_id: id,
  });

  if (error) {
    console.error("[sponsored] agreement failed", error);
    redirect(`/dashboard/sponsored/${id}?notice=agree-failed`);
  }

  const result = (data ?? {}) as {
    outcome?: string;
    reason?: string | null;
    withdrawn?: {
      id: string;
      name: string;
      /** Added by 0023; absent until that migration is applied. */
      reference?: string | null;
      artist_profile_id: string | null;
    }[];
  };

  // Refused — tell them why rather than silently doing nothing.
  if (result.outcome === "conflict" || result.outcome === "locked") {
    revalidatePath(`/dashboard/sponsored/${id}`);
    redirect(
      `/dashboard/sponsored/${id}?notice=${
        result.outcome
      }&reason=${encodeURIComponent(result.reason ?? "")}`,
    );
  }
  if (result.outcome === "not_party") return;

  const { data: full } = await supabase
    .from("sponsored_events")
    .select(
      "name, reference, budget_gbp, artist_profile_id, brands(profile_id, brand_name)",
    )
    .eq("id", id)
    .maybeSingle<{
      name: string;
      reference: string;
      budget_gbp: number | null;
      artist_profile_id: string | null;
      brands: { profile_id: string; brand_name: string } | null;
    }>();

  if (full) {
    const brandProfileId = full.brands?.profile_id ?? null;
    // Fallbacks matter: an unresolved token renders as literal "{{budget}}".
    const budget =
      full.budget_gbp != null
        ? `£${Number(full.budget_gbp).toLocaleString("en-GB")}`
        : "to be agreed";

    if (result.outcome === "confirmed") {
      for (const pid of [brandProfileId, full.artist_profile_id]) {
        if (pid) {
          await notify({
            eventKey: "sponsorship.confirmed",
            recipientProfileId: pid,
            link: `/dashboard/sponsored/${id}`,
            variables: {
              event_name: full.name,
              reference: full.reference,
              budget,
            },
          });
        }
      }

      // Whoever else was in the running for this campaign. Their references
      // come back from the RPC (0023) rather than being looked up here — the
      // withdrawn proposals belong to *other* artists, so under RLS this
      // caller reads nothing for them.
      for (const loser of result.withdrawn ?? []) {
        if (!loser.artist_profile_id) continue;
        await notify({
          eventKey: "sponsorship.withdrawn",
          recipientProfileId: loser.artist_profile_id,
          link: `/dashboard/sponsored/${loser.id}`,
          variables: {
            event_name: loser.name,
            reference: loser.reference ?? "—",
          },
        });
      }
    } else if (
      result.outcome === "agreed" &&
      full.artist_profile_id === userId &&
      brandProfileId
    ) {
      await notify({
        eventKey: "sponsorship.artist_agreed",
        recipientProfileId: brandProfileId,
        link: `/dashboard/sponsored/${id}`,
        variables: { event_name: full.name, reference: full.reference },
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

/**
 * Verifies a participant's attendance.
 *
 * Two things are deliberately absent. Releasing the reward is admin-only
 * (3 Aug standup). And so, now, is *selection*: who gets a reward is settled by
 * a random draw the team runs, not by a brand or an artist picking names
 * (10 Aug standup) — so `select` and `reject` have no branch here at all.
 * Posting either does nothing, because the control being hidden in the UI isn't
 * authorisation.
 */
export async function updateParticipation(formData: FormData) {
  const { supabase } = await requireUser();
  const id = str(formData.get("id"));
  const eventId = str(formData.get("event_id"));
  const op = str(formData.get("op"));
  if (!id || !op) return;

  const patch: Record<string, unknown> = {};
  switch (op) {
    case "verify":
      patch.status = "attendance_verified";
      patch.attendance_verified_at = new Date().toISOString();
      break;
    default:
      return;
  }

  await supabase.from("participations").update(patch).eq("id", id);

  // Tell the participant what just happened to them.
  const NOTIFY_BY_OP: Record<string, string> = {
    verify: "participation.verified",
  };
  const eventKey = NOTIFY_BY_OP[op];
  if (eventKey) {
    const { data: participation } = await supabase
      .from("participations")
      .select("audience_profile_id, sponsored_events(name)")
      .eq("id", id)
      .maybeSingle<{
        audience_profile_id: string;
        sponsored_events: { name: string } | null;
      }>();

    if (participation) {
      await notify({
        eventKey,
        recipientProfileId: participation.audience_profile_id,
        link: "/dashboard/participations",
        variables: {
          event_name: participation.sponsored_events?.name ?? "your event",
        },
      });
    }
  }

  if (eventId) revalidatePath(`/dashboard/sponsored/${eventId}`);
}

// --- New-model additions: proofs, change requests, artist reports, rewards -

interface PartyRow {
  name: string;
  event_date: string | null;
  start_time: string | null;
  timezone: string;
  brand_id: string | null;
  artist_profile_id: string | null;
}

/** Confirms the caller is one of the two parties on this sponsorship. */
async function loadPartyEvent(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  eventId: string,
  userId: string,
) {
  const [{ data: event }, { data: brand }] = await Promise.all([
    supabase
      .from("sponsored_events")
      .select("name, event_date, start_time, timezone, brand_id, artist_profile_id")
      .eq("id", eventId)
      .maybeSingle<PartyRow>(),
    supabase.from("brands").select("id").eq("profile_id", userId).maybeSingle(),
  ]);
  if (!event) return null;
  const isBrand = brand && event.brand_id === brand.id;
  const isArtist = event.artist_profile_id === userId;
  if (!isBrand && !isArtist) return null;
  return { event, isBrand, isArtist };
}

const PROOF_PURPOSE: Record<string, string> = {
  social_mention: "sponsored-proof-social",
  onsite_branding: "sponsored-proof-branding",
};

export async function uploadEventProof(
  _prev: SponsoredState,
  formData: FormData,
): Promise<SponsoredState> {
  const { supabase, userId } = await requireUser();
  const eventId = str(formData.get("id"));
  const proofType = str(formData.get("proof_type"));
  if (!eventId || !proofType || !PROOF_PURPOSE[proofType]) {
    return { error: "Missing sponsorship or proof type." };
  }

  const party = await loadPartyEvent(supabase, eventId, userId);
  if (!party) return { error: "You're not a party to this sponsorship." };

  const upload = await uploadImage(formData.get("file"), PROOF_PURPOSE[proofType]);
  if (upload.error) return { error: upload.error };
  if (!upload.url) return { error: "Choose a file to upload." };

  const { error } = await supabase.from("sponsored_event_proofs").insert({
    sponsored_event_id: eventId,
    proof_type: proofType,
    url: upload.url,
    description: str(formData.get("description")),
    uploaded_by: userId,
  });
  if (error) return { error: error.message };

  await notifyAdmins({
    eventKey: "admin.sponsored_proof_submitted",
    link: `/dashboard/admin/events/sponsored/${eventId}`,
    variables: {
      event_name: party.event.name,
      proof_type: proofType === "social_mention" ? "social mention" : "onsite branding",
    },
  });

  revalidatePath(`/dashboard/sponsored/${eventId}`);
  return {};
}

const CHANGE_REQUEST_CUTOFF_MS = 2 * 24 * 60 * 60 * 1000;

export async function requestEventChange(
  _prev: SponsoredState,
  formData: FormData,
): Promise<SponsoredState> {
  const { supabase, userId } = await requireUser();
  const eventId = str(formData.get("id"));
  const summary = str(formData.get("summary"));
  if (!eventId || !summary) return { error: "Describe the change you're asking for." };

  const party = await loadPartyEvent(supabase, eventId, userId);
  if (!party) return { error: "You're not a party to this sponsorship." };

  const instant = eventStartInstant({
    date: party.event.event_date,
    time: party.event.start_time,
    timeZone: party.event.timezone,
  });
  if (instant && Date.now() > instant.getTime() - CHANGE_REQUEST_CUTOFF_MS) {
    return {
      error: "This event is within 2 days — changes this close in need to go through Contact Live·En·Synergy instead.",
    };
  }

  const { error } = await supabase.from("sponsored_event_change_requests").insert({
    sponsored_event_id: eventId,
    requested_by: userId,
    summary,
  });
  if (error) return { error: error.message };

  await notifyAdmins({
    eventKey: "admin.sponsored_change_requested",
    link: `/dashboard/admin/events/sponsored/${eventId}`,
    variables: { event_name: party.event.name, summary },
  });

  revalidatePath(`/dashboard/sponsored/${eventId}`);
  return {};
}

export async function submitTicketSalesReport(
  _prev: SponsoredState,
  formData: FormData,
): Promise<SponsoredState> {
  const { supabase, userId } = await requireUser();
  const eventId = str(formData.get("id"));
  if (!eventId) return { error: "Missing sponsorship." };

  const party = await loadPartyEvent(supabase, eventId, userId);
  if (!party?.isArtist) {
    return { error: "Only the artist on this sponsorship can submit a sales report." };
  }

  const upload = await uploadPrivateFile(
    formData.get("file"),
    "artist-sales-report",
  );
  if (upload.error) return { error: upload.error };

  const { error } = await supabase.from("ticket_sales_reports").insert({
    sponsored_event_id: eventId,
    submitted_by: userId,
    tickets_sold: num(formData.get("tickets_sold")),
    gross_revenue_gbp: num(formData.get("gross_revenue_gbp")),
    report_file_path: upload.path ?? null,
    notes: str(formData.get("notes")),
  });
  if (error) return { error: error.message };

  await notifyAdmins({
    eventKey: "admin.ticket_sales_report_submitted",
    link: `/dashboard/admin/events/sponsored/${eventId}`,
    variables: { event_name: party.event.name, artist_name: "The artist" },
  });

  revalidatePath(`/dashboard/sponsored/${eventId}`);
  return {};
}

/** Participant marks their own reward code redeemed — via the narrow
 * redeem_reward_code() RPC, not a direct table write (see 0027). */
export async function selfReportRewardCodeRedeemed(formData: FormData) {
  const { supabase } = await requireUser();
  const codeId = str(formData.get("code_id"));
  if (!codeId) return;

  const { data: ok } = await supabase.rpc("redeem_reward_code", {
    p_code_id: codeId,
  });
  if (!ok) return;

  const { data: reward } = await supabase
    .from("reward_codes")
    .select("code, sponsored_events(name)")
    .eq("id", codeId)
    .maybeSingle<{ code: string; sponsored_events: { name: string } | null }>();

  if (reward) {
    await notifyAdmins({
      eventKey: "admin.reward_code_redeemed",
      link: "/dashboard/admin/participants",
      variables: {
        event_name: reward.sponsored_events?.name ?? "an event",
        reference: reward.code,
        code: reward.code,
      },
    });
  }

  revalidatePath("/dashboard/rewards");
}
