"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";

export interface MarketplaceState {
  error?: string;
  success?: boolean;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");
  return { supabase, userId: user.id };
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

// --- Contact inbox ---------------------------------------------------------

export async function toggleContactHandled(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  const handled = str(formData.get("handled")) === "true";
  if (!id) return;

  await supabase
    .from("contact_messages")
    .update({
      handled_at: handled ? new Date().toISOString() : null,
      handled_by: handled ? userId : null,
    })
    .eq("id", id);

  revalidatePath("/dashboard/admin/enquiries");
}

// --- Campaign matching -----------------------------------------------------

/**
 * The core admin workflow: link a campaign to an available listing and stand
 * up the sponsored event that both sides then agree to.
 */
export async function matchCampaign(
  _prev: MarketplaceState,
  formData: FormData,
): Promise<MarketplaceState> {
  const { supabase } = await requireAdmin();
  const campaignId = str(formData.get("campaign_id"));
  const listingId = str(formData.get("listing_id"));
  if (!campaignId || !listingId) {
    return { error: "Pick a listing to match this campaign to." };
  }

  const [{ data: campaign }, { data: listing }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, reference, brand_id, budget_gbp, reward_rules, brands(profile_id)")
      .eq("id", campaignId)
      .maybeSingle<{
        id: string;
        reference: string;
        brand_id: string;
        budget_gbp: number | null;
        reward_rules: string | null;
        brands: { profile_id: string } | null;
      }>(),
    supabase
      .from("event_listings")
      .select("id, name, event_date, venue_name, city, country, owner_profile_id")
      .eq("id", listingId)
      .maybeSingle(),
  ]);

  if (!campaign) return { error: "Campaign not found." };
  if (!listing) return { error: "Listing not found." };

  const budget = campaign.budget_gbp;
  const { data: created, error } = await supabase
    .from("sponsored_events")
    .insert({
      brand_id: campaign.brand_id,
      campaign_id: campaign.id,
      listing_id: listing.id,
      artist_profile_id: listing.owner_profile_id,
      name: listing.name,
      event_date: listing.event_date,
      venue_details: listing.venue_name,
      location: [listing.city, listing.country].filter(Boolean).join(", ") || null,
      budget_gbp: budget,
      remaining_budget_gbp: budget,
      reward_rules: campaign.reward_rules,
      // Matched by the team — neither side has agreed yet.
      brand_agreed: false,
      artist_agreed: false,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await supabase
    .from("campaigns")
    .update({ matched_listing_id: listing.id })
    .eq("id", campaign.id);

  await supabase
    .from("event_listings")
    .update({ status: "matched" })
    .eq("id", listing.id);

  const budgetLabel =
    budget != null ? `£${Number(budget).toLocaleString("en-GB")}` : undefined;

  if (campaign.brands?.profile_id) {
    await notify({
      eventKey: "campaign.matched",
      recipientProfileId: campaign.brands.profile_id,
      link: `/dashboard/sponsored/${created.id}`,
      variables: {
        campaign_reference: campaign.reference,
        event_name: listing.name,
      },
    });
  }
  await notify({
    eventKey: "offer.proposal_received",
    recipientProfileId: listing.owner_profile_id,
    link: `/dashboard/sponsored/${created.id}`,
    variables: { event_name: listing.name, budget: budgetLabel },
  });

  revalidatePath("/dashboard/admin/campaigns");
  redirect(`/dashboard/admin/events/sponsored/${created.id}`);
}

// --- Status overrides ------------------------------------------------------

export async function setCampaignStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;

  await supabase.from("campaigns").update({ status }).eq("id", id);

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("reference, brands(profile_id)")
    .eq("id", id)
    .maybeSingle<{ reference: string; brands: { profile_id: string } | null }>();

  if (campaign?.brands?.profile_id) {
    await notify({
      eventKey: "campaign.status_changed",
      recipientProfileId: campaign.brands.profile_id,
      link: `/dashboard/campaigns/${id}`,
      variables: { campaign_reference: campaign.reference, status },
    });
  }

  revalidatePath("/dashboard/admin/campaigns");
}

// --- Admin-side participant management -------------------------------------

/** Mirrors the organiser controls so admin can unblock a stuck event. */
export async function adminUpdateParticipation(formData: FormData) {
  const { supabase } = await requireAdmin();
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

  if (op === "release" && eventId) {
    const amount = num(formData.get("reward_amount_gbp"));
    if (amount != null && amount > 0) {
      const { data: ev } = await supabase
        .from("sponsored_events")
        .select("remaining_budget_gbp")
        .eq("id", eventId)
        .maybeSingle();
      if (ev?.remaining_budget_gbp != null) {
        await supabase
          .from("sponsored_events")
          .update({
            remaining_budget_gbp: Math.max(
              0,
              Number(ev.remaining_budget_gbp) - amount,
            ),
          })
          .eq("id", eventId);
      }
    }
  }

  const NOTIFY_BY_OP: Record<string, string> = {
    select: "participation.selected",
    reject: "participation.rejected",
    verify: "participation.verified",
    release: "reward.released",
  };
  const eventKey = NOTIFY_BY_OP[op];
  if (eventKey) {
    const { data: p } = await supabase
      .from("participations")
      .select("audience_profile_id, reward_amount_gbp, sponsored_events(name)")
      .eq("id", id)
      .maybeSingle<{
        audience_profile_id: string;
        reward_amount_gbp: number | null;
        sponsored_events: { name: string } | null;
      }>();
    if (p) {
      await notify({
        eventKey,
        recipientProfileId: p.audience_profile_id,
        link: op === "release" ? "/dashboard/rewards" : "/dashboard/participations",
        variables: {
          event_name: p.sponsored_events?.name ?? "your event",
          amount:
            p.reward_amount_gbp != null
              ? `£${Number(p.reward_amount_gbp).toLocaleString("en-GB")}`
              : undefined,
        },
      });
    }
  }

  if (eventId) revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
}

/** A year in milliseconds — kept as a constant so the suspension length reads clearly at the call site. */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Strikes tolerated before an automatic suspension. */
const NO_SHOW_SUSPENSION_THRESHOLD = 3;

/**
 * Flags a selected participant as a no-show (selected but never followed
 * through with a ticket / attendance). Three strikes across any events
 * auto-suspends the account for a year — the admin team asked whether
 * repeat no-shows could be curbed without having to track it by hand.
 */
export async function adminMarkNoShow(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const eventId = str(formData.get("event_id"));
  if (!id) return;

  const { data: p } = await supabase
    .from("participations")
    .update({ no_show: true, no_show_marked_at: new Date().toISOString() })
    .eq("id", id)
    .select("audience_profile_id")
    .maybeSingle();

  if (p?.audience_profile_id) {
    const { count } = await supabase
      .from("participations")
      .select("id", { count: "exact", head: true })
      .eq("audience_profile_id", p.audience_profile_id)
      .eq("no_show", true);

    if ((count ?? 0) >= NO_SHOW_SUSPENSION_THRESHOLD) {
      const reason = `Automatic suspension: selected but didn't follow through (no ticket/attendance) ${count} times.`;
      const suspendedUntil = new Date(Date.now() + ONE_YEAR_MS).toISOString();
      await supabase
        .from("profiles")
        .update({
          is_active: false,
          blocked_at: new Date().toISOString(),
          blocked_reason: reason,
          suspended_until: suspendedUntil,
        })
        .eq("id", p.audience_profile_id);

      await notify({
        eventKey: "account.blocked",
        recipientProfileId: p.audience_profile_id,
        variables: { reason },
      });
    }
  }

  if (eventId) revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
  revalidatePath("/dashboard/admin/participants");
}
