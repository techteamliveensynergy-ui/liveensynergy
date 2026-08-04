"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { netSponsorshipBudget, roundMoney } from "@/lib/constants";
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
 * The core admin workflow: suggest one or more available listings against a
 * campaign and stand up a sponsored event for each, which the brand and that
 * listing's owner then agree to.
 *
 * Several suggestions per campaign is deliberate (3 Aug standup) — the team
 * puts two or three options in front of a sponsor. The first one both sides
 * agree to wins: `toggleAgreement` closes the campaign and withdraws the rest.
 */
export async function matchCampaign(
  _prev: MarketplaceState,
  formData: FormData,
): Promise<MarketplaceState> {
  const { supabase } = await requireAdmin();
  const campaignId = str(formData.get("campaign_id"));
  const listingIds = formData
    .getAll("listing_id")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!campaignId || listingIds.length === 0) {
    return { error: "Pick at least one listing to suggest for this campaign." };
  }

  const [{ data: campaign }, { data: listingRows }] = await Promise.all([
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
      .in("id", listingIds),
  ]);

  if (!campaign) return { error: "Campaign not found." };

  const listings = (listingRows ?? []) as {
    id: string;
    name: string;
    event_date: string | null;
    venue_name: string | null;
    city: string | null;
    country: string | null;
    owner_profile_id: string;
  }[];
  if (listings.length === 0) return { error: "Those listings no longer exist." };

  const budget = campaign.budget_gbp;
  const { data: created, error } = await supabase
    .from("sponsored_events")
    .insert(
      listings.map((listing) => ({
        brand_id: campaign.brand_id,
        campaign_id: campaign.id,
        listing_id: listing.id,
        artist_profile_id: listing.owner_profile_id,
        name: listing.name,
        event_date: listing.event_date,
        venue_details: listing.venue_name,
        location:
          [listing.city, listing.country].filter(Boolean).join(", ") || null,
        budget_gbp: budget,
        // Net of the platform fee inc VAT — see netSponsorshipBudget().
        remaining_budget_gbp: netSponsorshipBudget(budget),
        reward_rules: campaign.reward_rules,
        // Matched by the team — neither side has agreed yet.
        brand_agreed: false,
        artist_agreed: false,
      })),
    )
    .select("id, listing_id");

  if (error) return { error: error.message };

  // Clears "needs matching" on the first round of suggestions; the column
  // narrows to the single accepted listing once a sponsorship is confirmed, so
  // a later round mustn't overwrite it.
  await supabase
    .from("campaigns")
    .update({ matched_listing_id: listings[0].id })
    .eq("id", campaign.id)
    .is("matched_listing_id", null);

  await supabase
    .from("event_listings")
    .update({ status: "matched" })
    .in(
      "id",
      listings.map((l) => l.id),
    );

  const budgetLabel =
    budget != null ? `£${Number(budget).toLocaleString("en-GB")}` : undefined;
  const eventIdByListing = new Map(
    ((created ?? []) as { id: string; listing_id: string }[]).map((e) => [
      e.listing_id,
      e.id,
    ]),
  );

  if (campaign.brands?.profile_id) {
    await notify({
      eventKey: "campaign.matched",
      recipientProfileId: campaign.brands.profile_id,
      link: "/dashboard/sponsored",
      variables: {
        campaign_reference: campaign.reference,
        event_name:
          listings.length === 1
            ? listings[0].name
            : `${listings.length} suggested events`,
      },
    });
  }

  for (const listing of listings) {
    const eventId = eventIdByListing.get(listing.id);
    await notify({
      eventKey: "offer.proposal_received",
      recipientProfileId: listing.owner_profile_id,
      link: eventId ? `/dashboard/sponsored/${eventId}` : "/dashboard/sponsored",
      variables: { event_name: listing.name, budget: budgetLabel },
    });
  }

  revalidatePath("/dashboard/admin/campaigns");

  const firstId = eventIdByListing.get(listings[0].id);
  redirect(
    listings.length === 1 && firstId
      ? `/dashboard/admin/events/sponsored/${firstId}`
      : "/dashboard/admin/campaigns",
  );
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

/**
 * Selection, verification and reward release. Releasing money is admin-only
 * (3 Aug standup) — the brand/artist copy of this action deliberately has no
 * `release` branch at all.
 */
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
      if (amount != null) patch.reward_amount_gbp = roundMoney(amount);
      break;
    }
    default:
      return;
  }

  await supabase.from("participations").update(patch).eq("id", id);

  // A released reward is money actually spent — draw it down from the
  // sponsored event's remaining budget, which already excludes the platform
  // fee, so what's left is genuinely available to pay out.
  if (op === "release" && eventId) {
    const amount = num(formData.get("reward_amount_gbp"));
    if (amount != null && amount > 0) {
      const { data: ev } = await supabase
        .from("sponsored_events")
        .select("budget_gbp, remaining_budget_gbp")
        .eq("id", eventId)
        .maybeSingle<{
          budget_gbp: number | null;
          remaining_budget_gbp: number | null;
        }>();

      // Rows created before the net-budget fix still hold the gross figure as
      // "remaining"; fall back to recomputing it so the drawdown starts from
      // the right number either way.
      const current =
        ev?.remaining_budget_gbp != null
          ? Number(ev.remaining_budget_gbp)
          : netSponsorshipBudget(ev?.budget_gbp ?? null);

      if (current != null) {
        await supabase
          .from("sponsored_events")
          .update({
            remaining_budget_gbp: roundMoney(
              Math.max(0, current - roundMoney(amount)),
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
