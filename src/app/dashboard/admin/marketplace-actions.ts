"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CAMPAIGN_STATUSES,
  netSponsorshipBudget,
  netForCampaign,
  roundMoney,
} from "@/lib/constants";
import { notify } from "@/lib/notifications";
import { getOrCreateSupportConversation } from "@/lib/data/messaging";
import { rewardGateFor, rewardGatesForEvent } from "@/lib/data/reward-gate";
import {
  codeBatchText,
  friendlyDbError,
  generatePoolBatch,
  insertPoolCodes,
  invalidCodesMessage,
  issueCodeFromTier,
} from "@/lib/data/reward-codes";
import {
  CODE_PATTERN,
  MAX_CODES_PER_BATCH,
  normalisePrefix,
  parseCodeBatch,
  REDEMPTION_PLATFORMS,
} from "@/lib/discount-codes";
import { requireAdmin } from "@/lib/profile";
import { normaliseUrl } from "@/lib/urls";
import { isBillingComplete, type BillingFields } from "@/lib/billing";
import { draftCampaignInvoice, redraftCampaignInvoice } from "@/lib/billing-server";
import { notifyCampaignOpened } from "@/lib/campaign-payment";
import type { SponsoredEventRewardTier } from "@/lib/types";

export interface MarketplaceState {
  error?: string;
  success?: boolean;
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
  const { supabase, userId } = await requireAdmin();
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
      .select(
        "id, reference, status, brand_id, budget_gbp, package_platform_margin_gbp, reward_rules, suggested_event_note, suggested_event_url, brands(profile_id, brand_name)",
      )
      .eq("id", campaignId)
      .maybeSingle<{
        id: string;
        reference: string;
        status: string;
        brand_id: string;
        budget_gbp: number | null;
        package_platform_margin_gbp: number | null;
        reward_rules: string | null;
        suggested_event_note: string | null;
        suggested_event_url: string | null;
        brands: { profile_id: string; brand_name: string } | null;
      }>(),
    supabase
      .from("event_listings")
      .select("id, name, event_date, venue_name, city, country, owner_profile_id")
      .in("id", listingIds),
  ]);

  if (!campaign) return { error: "Campaign not found." };
  // The database refuses this too (sponsored_events trigger, 0049) — this is the
  // friendly version of the same rule.
  if (campaign.status === "awaiting_payment") {
    return {
      error:
        "This campaign is awaiting payment, so it can't be matched yet. Mark its invoice paid or waive payment first.",
    };
  }

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
        // Net of the package margin if this campaign came from one,
        // otherwise the global platform fee inc VAT — see netForCampaign().
        remaining_budget_gbp: netForCampaign({
          budget_gbp: budget,
          package_platform_margin_gbp: campaign.package_platform_margin_gbp,
        }),
        reward_rules: campaign.reward_rules,
        // Matched by the team — neither side has agreed yet.
        brand_agreed: false,
        artist_agreed: false,
      })),
    )
    .select("id, listing_id, reference");

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
  const createdByListing = new Map(
    (
      (created ?? []) as {
        id: string;
        listing_id: string;
        reference: string;
      }[]
    ).map((e) => [e.listing_id, e]),
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
    const proposal = createdByListing.get(listing.id);
    await notify({
      eventKey: "offer.proposal_received",
      recipientProfileId: listing.owner_profile_id,
      link: proposal
        ? `/dashboard/sponsored/${proposal.id}`
        : "/dashboard/sponsored",
      variables: {
        event_name: listing.name,
        // The proposal's own reference, not the campaign's — that's the number
        // the artist will quote back at us.
        reference: proposal?.reference ?? campaign.reference,
        budget: budgetLabel ?? "to be agreed",
      },
    });
  }

  // Relay the sponsor's suggested event, if they gave one (10 Aug standup) —
  // through admin-mediated support threads rather than opening a direct
  // brand↔artist line (26 Aug: direct chat between the two parties is
  // removed; admin is the required intermediary). Posted once into the
  // brand's own thread with us and once into each candidate artist's thread
  // with us, not a shared thread between the two of them.
  if (campaign.brands?.profile_id && campaign.suggested_event_note) {
    const suggestion = [
      `${campaign.brands.brand_name} has an event in mind for campaign ${campaign.reference}:`,
      "",
      campaign.suggested_event_note,
      campaign.suggested_event_url ?? "",
    ]
      .filter(Boolean)
      .join("\n");

    const brandThreadId = await getOrCreateSupportConversation({
      userProfileId: campaign.brands.profile_id,
      adminProfileId: userId,
    });
    if (brandThreadId) {
      await supabase.from("messages").insert({
        conversation_id: brandThreadId,
        sender_profile_id: userId,
        body: `Passing this on to the artists/organisers we think fit: ${suggestion}`,
      });
    }

    for (const listing of listings) {
      const conversationId = await getOrCreateSupportConversation({
        userProfileId: listing.owner_profile_id,
        adminProfileId: userId,
      });
      if (!conversationId) continue;

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_profile_id: userId,
        body: suggestion,
      });
      await notify({
        eventKey: "message.received",
        recipientProfileId: listing.owner_profile_id,
        link: `/dashboard/messages?c=${conversationId}`,
        variables: {
          sender_name: "The Live·En·Synergy team",
          event_name: listing.name,
        },
      });
    }
  }

  revalidatePath("/dashboard/admin/campaigns");

  const firstId = createdByListing.get(listings[0].id)?.id;
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
  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(status)) return;

  // The payment gate can't be opened from here. awaiting_payment is only ever
  // entered at creation, and only left through the invoice being paid or a
  // reasoned waiver (mark_invoice_paid / waive_campaign_payment) — or by
  // closing the campaign outright.
  if (status === "awaiting_payment") return;
  const { data: current } = await supabase
    .from("campaigns")
    .select("status")
    .eq("id", id)
    .maybeSingle<{ status: string }>();
  if (!current) return;
  if (current.status === "awaiting_payment" && status !== "closed") return;

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
  revalidatePath("/dashboard/campaigns");
}

/**
 * Opens an awaiting_payment campaign without payment — a comp or internal
 * campaign. Requires a written reason; the database function records who and
 * when on the campaign and cancels its live invoice, all in one transaction.
 */
export async function waiveCampaignPayment(formData: FormData) {
  const { supabase } = await requireAdmin();
  const campaignId = str(formData.get("campaign_id"));
  const reason = str(formData.get("reason"));
  if (!campaignId) return;

  const fail = (message: string): never =>
    redirect(
      `/dashboard/admin/campaigns?action_error=${encodeURIComponent(message.slice(0, 200))}`,
    );
  if (!reason) fail("A reason is required to waive payment.");

  const { error } = await supabase.rpc("waive_campaign_payment", {
    p_campaign_id: campaignId,
    p_reason: reason,
  });
  if (error) fail(error.message);

  await notifyCampaignOpened(supabase, campaignId);

  revalidatePath("/dashboard/admin/campaigns");
  revalidatePath("/dashboard/admin/invoices");
  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard/discover-campaigns");
  redirect("/dashboard/admin/campaigns");
}

// --- Campaign intake (26 Aug: campaigns are now admin-created) -------------

export async function reviewCampaignIntake(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  const op = str(formData.get("op")); // "approve" | "decline"
  if (!id || !op) return;

  if (op === "approve") {
    await supabase
      .from("campaign_intake_requests")
      .update({ status: "in_review", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "submitted");
    redirect(`/dashboard/admin/campaigns/new?from_intake=${id}`);
  }

  if (op === "decline") {
    const reason = str(formData.get("decline_reason"));
    const { data: updated } = await supabase
      .from("campaign_intake_requests")
      .update({
        status: "declined",
        decline_reason: reason,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "submitted")
      .select("reference, brands(profile_id)")
      .maybeSingle<{ reference: string; brands: { profile_id: string } | null }>();

    if (updated?.brands?.profile_id) {
      await notify({
        eventKey: "campaign_intake.declined",
        recipientProfileId: updated.brands.profile_id,
        link: "/dashboard/campaigns",
        variables: { reference: updated.reference, reason: reason ?? "no reason given" },
      });
    }
    revalidatePath("/dashboard/admin/campaigns/intake");
  }
}

interface CampaignPackageRow {
  id: string;
  price_gbp: number | null;
  is_custom_price: boolean;
  min_price_gbp: number | null;
  price_increment_gbp: number | null;
  platform_margin_gbp: number;
  participant_count: number | null;
}

function campaignPayload(formData: FormData) {
  return {
    description: str(formData.get("description")),
    category: str(formData.get("category")),
    category_other: str(formData.get("category_other")),
    preferred_location: str(formData.get("preferred_location")),
    preferred_timeline: str(formData.get("preferred_timeline")),
    target_name: str(formData.get("target_name")),
    reward_rules: str(formData.get("reward_rules")),
    expected_outcomes: str(formData.get("expected_outcomes")),
    additional_info: str(formData.get("additional_info")),
    suggested_event_note: str(formData.get("suggested_event_note")),
    suggested_event_url: str(formData.get("suggested_event_url")),
    manager_name: str(formData.get("manager_name")),
    manager_email: str(formData.get("manager_email")),
    manager_phone: str(formData.get("manager_phone")),
    image_url: str(formData.get("image_url")),
  };
}

/**
 * Resolves what a submitted package + budget actually mean for the money
 * columns, re-deriving rather than trusting the client: a fixed-price
 * package's budget is the package's own price regardless of what was
 * posted; a custom-price package's budget must land on one of its allowed
 * increments; no package at all keeps today's free-entry budget.
 */
async function resolveCampaignMoney(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  packageId: string | null,
  submittedBudget: number | null,
  submittedMarginOverride: number | null,
) {
  if (!packageId) {
    if (submittedBudget == null) {
      return { error: "Budget is required when no package is selected." };
    }
    return {
      budget_gbp: submittedBudget,
      campaign_package_id: null,
      package_platform_margin_gbp: null,
      package_participant_count: null,
    };
  }

  const { data: pkg } = await supabase
    .from("campaign_packages")
    .select("id, price_gbp, is_custom_price, min_price_gbp, price_increment_gbp, platform_margin_gbp, participant_count")
    .eq("id", packageId)
    .maybeSingle<CampaignPackageRow>();
  if (!pkg) return { error: "Selected package no longer exists." };

  const margin = submittedMarginOverride ?? pkg.platform_margin_gbp;

  if (!pkg.is_custom_price) {
    return {
      budget_gbp: pkg.price_gbp as number,
      campaign_package_id: pkg.id,
      package_platform_margin_gbp: margin,
      package_participant_count: pkg.participant_count,
    };
  }

  // Custom-price (Enterprise): budget must be admin-entered and land on an
  // allowed increment above the package's minimum.
  const min = pkg.min_price_gbp ?? 0;
  const step = pkg.price_increment_gbp ?? 0;
  if (submittedBudget == null || submittedBudget < min) {
    return { error: `Budget must be at least £${min.toLocaleString("en-GB")} for this package.` };
  }
  if (step > 0) {
    const diff = roundMoney(submittedBudget - min);
    const remainder = roundMoney(diff % step);
    if (remainder !== 0) {
      return {
        error: `Budget must be a multiple of £${step.toLocaleString("en-GB")} above £${min.toLocaleString("en-GB")}.`,
      };
    }
  }
  return {
    budget_gbp: submittedBudget,
    campaign_package_id: pkg.id,
    package_platform_margin_gbp: margin,
    package_participant_count: null,
  };
}

export async function createCampaignFromAdmin(
  _prev: MarketplaceState,
  formData: FormData,
): Promise<MarketplaceState> {
  const { supabase } = await requireAdmin();

  const fromIntakeId = str(formData.get("from_intake_id"));
  let brandId = str(formData.get("brand_id"));

  if (fromIntakeId && !brandId) {
    const { data: intake } = await supabase
      .from("campaign_intake_requests")
      .select("brand_id")
      .eq("id", fromIntakeId)
      .maybeSingle<{ brand_id: string }>();
    brandId = intake?.brand_id ?? null;
  }
  if (!brandId) return { error: "Select a brand for this campaign." };

  const p = campaignPayload(formData);
  if (!p.description) return { error: "Campaign description is required." };
  if (!p.manager_name || !p.manager_email || !p.manager_phone) {
    return { error: "Campaign manager name, email and phone are required." };
  }

  const money = await resolveCampaignMoney(
    supabase,
    str(formData.get("campaign_package_id")),
    num(formData.get("budget_gbp")),
    num(formData.get("package_platform_margin_gbp")),
  );
  if ("error" in money) return { error: money.error };

  // Technical floor regardless of package — a campaign that leaves nothing
  // for the reward pool isn't viable, package price or not.
  const net = netForCampaign(money);
  if (net == null || net <= 0) {
    return { error: "This budget leaves nothing available for sponsorship after the platform margin." };
  }

  const { data: created, error } = await supabase
    .from("campaigns")
    // Starts hidden from artists: it opens when its invoice is paid, or an
    // admin waives payment (0048/0049). Failing closed is deliberate — if the
    // invoice couldn't be drafted the campaign simply waits, visibly, for the
    // Draft invoice button rather than going live unbilled.
    .insert({ ...p, brand_id: brandId, ...money, status: "awaiting_payment" })
    .select("id, reference")
    .single();
  if (error) return { error: error.message };

  // Draft the invoice for an admin to review and send. A failure here must not
  // fail the campaign (it exists now); it is logged, and the campaign list
  // shows "No invoice" with a Draft invoice button — see draftCampaignInvoice.
  const drafted = await draftCampaignInvoice(supabase, created.id);
  if (!drafted.ok) {
    console.error("[campaign] invoice draft failed", created.reference, drafted.error);
  } else {
    // Tell the brand now if we can't invoice them yet, rather than discovering
    // it when an admin tries to send.
    const { data: billing } = await supabase
      .from("brands")
      .select(
        "profile_id, billing_legal_name, billing_email, billing_address_line1, billing_city, billing_postcode, billing_country",
      )
      .eq("id", brandId)
      .maybeSingle<{ profile_id: string } & Partial<BillingFields>>();
    if (billing && !isBillingComplete(billing)) {
      await notify({
        eventKey: "brand.billing_details_needed",
        recipientProfileId: billing.profile_id,
        link: "/dashboard/profile",
        variables: { campaign_reference: created.reference },
      });
    }
  }

  if (fromIntakeId) {
    const { data: intake } = await supabase
      .from("campaign_intake_requests")
      .update({ status: "converted", converted_campaign_id: created.id })
      .eq("id", fromIntakeId)
      .select("reference, brands(profile_id)")
      .maybeSingle<{ reference: string; brands: { profile_id: string } | null }>();

    if (intake?.brands?.profile_id) {
      await notify({
        eventKey: "campaign_intake.converted",
        recipientProfileId: intake.brands.profile_id,
        link: `/dashboard/campaigns`,
        variables: { reference: intake.reference, campaign_reference: created.reference },
      });
    }
  }

  revalidatePath("/dashboard/admin/campaigns");
  revalidatePath("/dashboard/admin/campaigns/intake");
  revalidatePath("/dashboard/admin/invoices");
  redirect("/dashboard/admin/campaigns");
}

export async function updateCampaignAdmin(
  _prev: MarketplaceState,
  formData: FormData,
): Promise<MarketplaceState> {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return { error: "Missing campaign id." };

  const p = campaignPayload(formData);
  if (!p.description) return { error: "Campaign description is required." };

  const money = await resolveCampaignMoney(
    supabase,
    str(formData.get("campaign_package_id")),
    num(formData.get("budget_gbp")),
    num(formData.get("package_platform_margin_gbp")),
  );
  if ("error" in money) return { error: money.error };

  // Money fields are locked once an invoice has been issued: the brand holds a
  // document for the old figures, so the campaign must not drift away from it.
  // (Cancel the invoice first, then edit and re-draft.) A DRAFT is rebuilt below.
  const { data: current } = await supabase
    .from("campaigns")
    .select("budget_gbp, campaign_package_id, package_platform_margin_gbp")
    .eq("id", id)
    .maybeSingle<{
      budget_gbp: number;
      campaign_package_id: string | null;
      package_platform_margin_gbp: number | null;
    }>();
  const asNum = (v: number | string | null | undefined) =>
    v == null ? null : Number(v);
  const moneyChanged =
    !!current &&
    (asNum(current.budget_gbp) !== asNum(money.budget_gbp) ||
      (current.campaign_package_id ?? null) !== (money.campaign_package_id ?? null) ||
      asNum(current.package_platform_margin_gbp) !==
        asNum(money.package_platform_margin_gbp));

  if (moneyChanged) {
    const { data: issued } = await supabase
      .from("invoices")
      .select("reference, status")
      .eq("campaign_id", id)
      .eq("kind", "campaign_package")
      .in("status", ["sent", "overdue", "paid"])
      .limit(1)
      .maybeSingle<{ reference: string; status: string }>();
    if (issued) {
      return {
        error:
          issued.status === "paid"
            ? `Invoice ${issued.reference} has been paid, so the budget and package are locked.`
            : `Invoice ${issued.reference} has already been sent. Cancel it before changing the budget or package, then draft a new one.`,
      };
    }
  }

  const { error } = await supabase
    .from("campaigns")
    .update({ ...p, ...money })
    .eq("id", id);
  if (error) return { error: error.message };

  if (moneyChanged) {
    const redrafted = await redraftCampaignInvoice(supabase, id);
    if (!redrafted.ok) {
      return {
        error: `Campaign saved, but its draft invoice couldn't be rebuilt (${redrafted.error}). Cancel the draft and press Draft invoice.`,
      };
    }
  }

  revalidatePath("/dashboard/admin/campaigns");
  revalidatePath("/dashboard/admin/invoices");
  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/admin/campaigns");
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

  // Same gate as issueRewardCode() — this is the *other* reward-release
  // path (the pre-event ticket subsidy, admin-typed amount), and it moves
  // real money out of remaining_budget_gbp below, so it needs the same
  // check, not just the discount/merch-code path.
  if (op === "release") {
    if (!eventId) return;
    const { data: ev } = await supabase
      .from("sponsored_events")
      .select("campaign_id")
      .eq("id", eventId)
      .maybeSingle<{ campaign_id: string | null }>();
    const gate = await rewardGateFor({ campaignId: ev?.campaign_id ?? null, participationId: id });
    if (!gate.allowed) refuseGate(eventId, gate.code, id);
  }

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

// --- Random selection draw --------------------------------------------------

/**
 * Only carries failures — a successful draw redirects with a notice instead,
 * so the result survives the draw form unmounting.
 */
export interface DrawState {
  error?: string;
}

/**
 * Fisher–Yates. Every ordering equally likely, which is the whole point — a
 * `sort(() => Math.random() - 0.5)` is neither uniform nor stable and would
 * quietly bias the draw towards whoever registered first.
 */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draws the reward places at random from everyone still waiting.
 *
 * Selection used to be a Select button next to each name on the brand's and
 * artist's own page. It isn't any more (10 Aug standup): who gets a
 * sponsor-funded reward is decided by a random draw the team runs, so neither
 * party can favour their own people, and the audience-facing promise that
 * "selection is carried out within a week of the deadline" means something.
 *
 * Anyone not drawn is left alone rather than rejected — places free up when
 * someone doesn't upload a ticket in time, and the draw can simply be run again
 * for the remainder.
 */
export async function runSelectionDraw(
  _prev: DrawState,
  formData: FormData,
): Promise<DrawState> {
  const { supabase } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  const requested = num(formData.get("places"));
  if (!eventId) return { error: "Missing event." };
  if (requested == null || requested < 1) {
    return { error: "Enter how many places the draw is for." };
  }

  const { data: pool } = await supabase
    .from("participations")
    .select("id, audience_profile_id")
    .eq("sponsored_event_id", eventId)
    .eq("selected", false)
    .eq("status", "registered");

  const waiting = (pool ?? []) as {
    id: string;
    audience_profile_id: string;
  }[];
  if (waiting.length === 0) {
    return { error: "Nobody is waiting in the draw for this event." };
  }

  const drawn = shuffle(waiting).slice(0, Math.floor(requested));

  const { error } = await supabase
    .from("participations")
    .update({ selected: true, selected_at: new Date().toISOString() })
    .in(
      "id",
      drawn.map((p) => p.id),
    );
  if (error) return { error: error.message };

  const { data: event } = await supabase
    .from("sponsored_events")
    .select("name")
    .eq("id", eventId)
    .maybeSingle<{ name: string }>();

  for (const p of drawn) {
    await notify({
      eventKey: "participation.selected",
      recipientProfileId: p.audience_profile_id,
      link: "/dashboard/participations",
      variables: { event_name: event?.name ?? "your event" },
    });
  }

  revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);

  // The result is reported through the URL, not through this action's return
  // value. Drawing the last of the pool takes `waiting` to zero, which hides
  // the draw panel — and the panel is what renders the returned message, so it
  // unmounts before anyone can read it. The admin was left with a form that
  // silently vanished and no statement of what had happened (L6 all over
  // again). A notice on the page survives the panel going away.
  redirect(
    `/dashboard/admin/events/sponsored/${eventId}?notice=draw&drawn=${
      drawn.length
    }&pool=${waiting.length}`,
  );
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

// --- Sponsored-event proofs -------------------------------------------------

export async function reviewEventProof(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  const op = str(formData.get("op")); // "approve" | "reject"
  const eventId = str(formData.get("event_id"));
  if (!id || !op) return;

  const { data: updated } = await supabase
    .from("sponsored_event_proofs")
    .update({
      status: op === "approve" ? "approved" : "rejected",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      review_note: str(formData.get("review_note")),
    })
    .eq("id", id)
    .select("proof_type, uploaded_by, sponsored_events(name)")
    .maybeSingle<{
      proof_type: string;
      uploaded_by: string;
      sponsored_events: { name: string } | null;
    }>();

  if (updated) {
    await notify({
      eventKey: "sponsored.proof_reviewed",
      recipientProfileId: updated.uploaded_by,
      link: eventId ? `/dashboard/sponsored/${eventId}` : "/dashboard/sponsored",
      variables: {
        event_name: updated.sponsored_events?.name ?? "your sponsorship",
        proof_type: updated.proof_type === "social_mention" ? "social mention" : "onsite branding",
        status: op === "approve" ? "approved" : "rejected",
      },
    });
  }

  if (eventId) revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
}

// --- Reward engine / discount codes ----------------------------------------
//
// Tiers carry the discount-code setup (0045): which of the three patterns
// (shared uncapped / shared capped / unique per person), the value, and where
// the code is redeemed. Pattern C's codes live in reward_code_pool. The whole
// setup is editable until the artist confirms it, then frozen (a DB trigger
// enforces that too) until an admin reopens it. See docs/discount-codes.md.

type AdminClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function rewardConfigFrozen(supabase: AdminClient, eventId: string): Promise<boolean> {
  const { data } = await supabase
    .from("sponsored_events")
    .select("reward_codes_confirmed_at")
    .eq("id", eventId)
    .maybeSingle<{ reward_codes_confirmed_at: string | null }>();
  return !!data?.reward_codes_confirmed_at;
}

function revalidateRewardPages(eventId: string) {
  revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
  revalidatePath(`/dashboard/sponsored/${eventId}`);
}

async function tierFor(supabase: AdminClient, eventId: string, tierId: string) {
  const { data } = await supabase
    .from("sponsored_event_reward_tiers")
    .select("*")
    .eq("id", tierId)
    .eq("sponsored_event_id", eventId)
    .maybeSingle<SponsoredEventRewardTier>();
  return data;
}

/**
 * Saves a sponsorship's tiers. Updates rows in place by id rather than the
 * old delete-and-reinsert, because pattern C's pool hangs off the tier id —
 * reinserting would cascade-delete every uploaded code. Removed tiers are
 * deleted (taking their pool with them); issued codes keep their snapshot and
 * just lose the tier link.
 */
export async function upsertRewardTiers(
  _prev: MarketplaceState,
  formData: FormData,
): Promise<MarketplaceState> {
  const { supabase } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  if (!eventId) return { error: "Missing sponsorship." };
  if (await rewardConfigFrozen(supabase, eventId)) {
    return { error: "The artist has already confirmed these discount codes — reopen them before editing." };
  }

  const all = (k: string) => formData.getAll(k).map((v) => str(v as FormDataEntryValue));
  const ids = all("tier_id");
  const labels = all("tier_label");
  const caps = all("tier_cap");
  const codeTypes = all("tier_code_type");
  const valueLabels = all("tier_value_label");
  const models = all("tier_model");
  const prefixes = all("tier_prefix");
  const lengths = all("tier_random_length");
  const sharedCodes = all("tier_shared_code");
  const percents = all("tier_discount_percent");
  const pounds = all("tier_value_gbp");
  const platforms = all("tier_platform");
  const urls = all("tier_url");
  const instructions = all("tier_instructions");
  const validUntil = all("tier_valid_until");

  const rows: (Record<string, unknown> & { id: string | null })[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (!label) continue;
    const model = models[i] === "shared" ? "shared" : "unique";
    const cap = caps[i] != null ? Number(caps[i]) : null;
    if (cap != null && !(Number.isInteger(cap) && cap >= 1)) {
      return { error: `“${label}”: the cap must be a whole number of at least 1, or blank.` };
    }
    const percent = percents[i] != null ? Number(percents[i]) : null;
    if (percent != null && !(percent > 0 && percent <= 100)) {
      return { error: `“${label}”: a percentage discount must be between 0 and 100.` };
    }
    const gbp = pounds[i] != null ? Number(pounds[i]) : null;
    if (gbp != null && !(gbp > 0)) return { error: `“${label}”: the £ value must be more than 0.` };
    if (percent != null && gbp != null) {
      return { error: `“${label}”: give either a percentage or a £ amount, not both.` };
    }
    const shared = model === "shared" ? sharedCodes[i] : null;
    if (shared && !CODE_PATTERN.test(shared)) {
      return { error: `“${label}”: a code can only use letters, numbers, - and _ (3–40 characters).` };
    }
    const len = lengths[i] != null ? Math.floor(Number(lengths[i])) : 8;
    const platform = platforms[i];
    const url = normaliseUrl(urls[i], `“${label}”: the redemption link`);
    if (url.error) return { error: url.error };
    rows.push({
      id: ids[i],
      sponsored_event_id: eventId,
      label,
      rank: rows.length,
      participant_cap: cap,
      code_type: codeTypes[i] === "merch" ? "merch" : "discount",
      value_label: valueLabels[i],
      distribution_model: model,
      code_prefix: normalisePrefix(prefixes[i]),
      code_random_length: Math.min(16, Math.max(6, Number.isFinite(len) ? len : 8)),
      shared_code: shared,
      discount_percent: percent,
      value_gbp: gbp != null ? roundMoney(gbp) : null,
      redemption_platform: REDEMPTION_PLATFORMS.some((p) => p.value === platform) ? platform : null,
      redemption_url: url.url,
      redemption_instructions: instructions[i],
      valid_until: validUntil[i],
    });
  }
  if (rows.length === 0) return { error: "Add at least one tier." };

  const { data: existingRows } = await supabase
    .from("sponsored_event_reward_tiers")
    .select("id")
    .eq("sponsored_event_id", eventId);
  const existing = new Set((existingRows ?? []).map((r: { id: string }) => r.id));
  const kept = new Set(rows.map((r) => r.id).filter((id): id is string => !!id && existing.has(id)));

  const removed = [...existing].filter((id) => !kept.has(id));
  if (removed.length > 0) {
    const { error } = await supabase
      .from("sponsored_event_reward_tiers")
      .delete()
      .eq("sponsored_event_id", eventId)
      .in("id", removed);
    if (error) return { error: friendlyDbError(error.message) };
  }

  // Ascending rank order: tiers only ever shift down (removals) or append,
  // so no update ever lands on a rank another row still holds.
  for (const { id, ...row } of rows) {
    const { error } =
      id && kept.has(id)
        ? await supabase
            .from("sponsored_event_reward_tiers")
            .update(row)
            .eq("id", id)
            .eq("sponsored_event_id", eventId)
        : await supabase.from("sponsored_event_reward_tiers").insert(row);
    if (error) return { error: friendlyDbError(error.message) };
  }

  revalidateRewardPages(eventId);
  return { success: true };
}

/** Pattern C: the platform generates PREFIX-XXXX-XXXX codes for the artist to
 * download and load into their ticketing platform. */
export async function generatePoolCodes(
  _prev: MarketplaceState,
  formData: FormData,
): Promise<MarketplaceState> {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  const tierId = str(formData.get("tier_id"));
  const count = num(formData.get("count")) ?? 0;
  if (!eventId || !tierId) return { error: "Missing tier." };
  if (!Number.isInteger(count) || count < 1 || count > MAX_CODES_PER_BATCH) {
    return { error: `Generate between 1 and ${MAX_CODES_PER_BATCH} codes at a time.` };
  }
  const tier = await tierFor(supabase, eventId, tierId);
  if (!tier) return { error: "That tier no longer exists — save the tiers first." };
  if (tier.distribution_model !== "unique") {
    return { error: "Only a “unique code per person” tier has a code pool." };
  }

  const batch = await generatePoolBatch(supabase, { eventId, tier, count });
  const res = await insertPoolCodes(supabase, {
    eventId,
    tierId,
    source: "generated",
    rows: batch,
    createdBy: userId,
  });
  if (res.error) return { error: res.error };
  revalidateRewardPages(eventId);
  return { success: true };
}

/** Pattern C, Phase 1: the admin pastes (or uploads a CSV of) the codes they
 * created on the brand's own platform. */
export async function uploadPoolCodes(
  _prev: MarketplaceState,
  formData: FormData,
): Promise<MarketplaceState> {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  const tierId = str(formData.get("tier_id"));
  if (!eventId || !tierId) return { error: "Missing tier." };
  const tier = await tierFor(supabase, eventId, tierId);
  if (!tier) return { error: "That tier no longer exists — save the tiers first." };
  if (tier.distribution_model !== "unique") {
    return { error: "Only a “unique code per person” tier has a code pool." };
  }

  const parsed = parseCodeBatch(await codeBatchText(formData));
  if (parsed.invalid.length > 0) return { error: invalidCodesMessage(parsed.invalid) };
  if (parsed.codes.length === 0) return { error: "Paste at least one code, or choose a CSV file." };

  const res = await insertPoolCodes(supabase, {
    eventId,
    tierId,
    source: "uploaded",
    rows: parsed.codes,
    createdBy: userId,
  });
  if (res.error) return { error: res.error };
  revalidateRewardPages(eventId);
  return { success: true };
}

export async function removePoolCode(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  const id = str(formData.get("id"));
  if (!eventId || !id) return;
  await supabase
    .from("reward_code_pool")
    .delete()
    .eq("id", id)
    .eq("sponsored_event_id", eventId)
    .is("assigned_at", null);
  revalidateRewardPages(eventId);
}

/** Asks the artist to review and consent — the setup stays editable until
 * they do. */
export async function sendRewardCodesForReview(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  if (!eventId) return;
  const { data: ev } = await supabase
    .from("sponsored_events")
    .select("name, reference, artist_profile_id")
    .eq("id", eventId)
    .maybeSingle<{ name: string; reference: string; artist_profile_id: string | null }>();
  if (ev?.artist_profile_id) {
    await notify({
      eventKey: "reward.codes_ready_for_review",
      recipientProfileId: ev.artist_profile_id,
      link: `/dashboard/sponsored/${eventId}#discount-codes`,
      variables: { event_name: ev.name, reference: ev.reference },
    });
  }
  revalidateRewardPages(eventId);
  redirect(`/dashboard/admin/events/sponsored/${eventId}?notice=codes_sent#discount-codes`);
}

/** Withdraws the artist's consent so the setup can be edited again. */
export async function reopenRewardCodes(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  if (!eventId) return;
  await supabase
    .from("sponsored_events")
    .update({ reward_codes_confirmed_at: null, reward_codes_confirmed_by: null })
    .eq("id", eventId);
  revalidateRewardPages(eventId);
  redirect(`/dashboard/admin/events/sponsored/${eventId}?notice=codes_reopened#discount-codes`);
}

/** Refuses issuance/release with a reason the admin page renders as a banner
 * — the same redirect-with-notice shape as `runSelectionDraw()`, needed for
 * the same reason (L6): the form that would show a returned error unmounts
 * on the read that follows a redirect, since these are plain server-component
 * `<form action={fn}>`s with no client state of their own. */
function refuseGate(eventId: string, code: string, who: string): never {
  redirect(
    `/dashboard/admin/events/sponsored/${eventId}?notice=gate&gate=${encodeURIComponent(code)}&who=${encodeURIComponent(who)}`,
  );
}

interface IssueEventRow {
  id: string;
  name: string;
  campaign_id: string | null;
  artist_profile_id: string | null;
  reward_codes_confirmed_at: string | null;
}

async function loadIssueEvent(supabase: AdminClient, eventId: string) {
  const { data } = await supabase
    .from("sponsored_events")
    .select("id, name, campaign_id, artist_profile_id, reward_codes_confirmed_at")
    .eq("id", eventId)
    .maybeSingle<IssueEventRow>();
  return data;
}

/** Codes only go out once the artist — who absorbs the discount — has
 * consented to the setup (25 Sep standup). A sponsorship with no artist
 * attached has nobody to consent, so it isn't held up. */
function needsConsent(ev: IssueEventRow) {
  return !!ev.artist_profile_id && !ev.reward_codes_confirmed_at;
}

export async function issueRewardCode(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  const participationId = str(formData.get("participation_id"));
  const tierId = str(formData.get("tier_id"));
  if (!eventId || !participationId) return;

  // Scoped to this event — a hand-posted participation_id from another event
  // must not produce a mismatched-parent reward_codes row (CLAUDE.md's
  // "mutations always additionally scoped by owner id").
  const { data: participation } = await supabase
    .from("participations")
    .select("id, status, sponsored_event_id, audience_profile_id")
    .eq("id", participationId)
    .maybeSingle<{
      id: string;
      status: string;
      sponsored_event_id: string;
      audience_profile_id: string;
    }>();
  if (!participation || participation.sponsored_event_id !== eventId) {
    refuseGate(eventId, "mismatch", participationId);
  }
  if (!["attendance_verified", "reward_released"].includes(participation.status)) {
    refuseGate(eventId, "status", participationId);
  }

  const ev = await loadIssueEvent(supabase, eventId);
  if (!ev) refuseGate(eventId, "mismatch", participationId);
  if (needsConsent(ev)) refuseGate(eventId, "not_confirmed", participationId);

  const tier = tierId ? await tierFor(supabase, eventId, tierId) : null;
  if (!tier) refuseGate(eventId, "tier", participationId);

  const gate = await rewardGateFor({ campaignId: ev.campaign_id, participationId });
  if (!gate.allowed) refuseGate(eventId, gate.code, participationId);

  const result = await issueCodeFromTier(supabase, {
    eventId,
    eventName: ev.name,
    participationId,
    recipientProfileId: participation.audience_profile_id,
    tier,
    issuedBy: userId,
  });
  if (!result.ok) refuseGate(eventId, result.reason, participationId);

  revalidateRewardPages(eventId);
}

/**
 * Issues a code to everyone eligible who hasn't got one yet, in registration
 * order, filling tiers in rank order ("first 50 get X, everyone after gets
 * Y"). Skips anyone the survey gate holds back. Saves the admin 50 clicks;
 * every result still shows per person on the page.
 */
export async function issueRewardCodesToEligible(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  if (!eventId) return;

  const ev = await loadIssueEvent(supabase, eventId);
  if (!ev) return;
  if (needsConsent(ev)) refuseGate(eventId, "not_confirmed", "");

  const [{ data: tierRows }, { data: partRows }, { data: codeRows }] = await Promise.all([
    supabase
      .from("sponsored_event_reward_tiers")
      .select("*")
      .eq("sponsored_event_id", eventId)
      .order("rank"),
    supabase
      .from("participations")
      .select("id, audience_profile_id")
      .eq("sponsored_event_id", eventId)
      .in("status", ["attendance_verified", "reward_released"])
      .order("created_at", { ascending: true }),
    supabase
      .from("reward_codes")
      .select("participation_id")
      .eq("sponsored_event_id", eventId)
      .neq("status", "void"),
  ]);
  const tiers = (tierRows ?? []) as SponsoredEventRewardTier[];
  if (tiers.length === 0) refuseGate(eventId, "tier", "");

  const haveCode = new Set(
    (codeRows ?? []).map((c: { participation_id: string | null }) => c.participation_id),
  );
  const pending = ((partRows ?? []) as { id: string; audience_profile_id: string }[]).filter(
    (p) => !haveCode.has(p.id),
  );
  const { gates } = await rewardGatesForEvent({
    campaignId: ev.campaign_id,
    participationIds: pending.map((p) => p.id),
  });

  let issued = 0;
  let held = 0;
  let unplaced = 0;
  // A tier that refuses (cap reached / pool empty / no shared code) is
  // skipped for the rest of the run rather than retried per person.
  const exhausted = new Set<string>();
  for (const p of pending) {
    const gate = gates.get(p.id);
    if (gate && !gate.allowed) {
      held++;
      continue;
    }
    let placed = false;
    for (const tier of tiers) {
      if (exhausted.has(tier.id)) continue;
      const res = await issueCodeFromTier(supabase, {
        eventId,
        eventName: ev.name,
        participationId: p.id,
        recipientProfileId: p.audience_profile_id,
        tier,
        issuedBy: userId,
      });
      if (res.ok || res.reason === "already") {
        if (res.ok) issued++;
        placed = true;
        break;
      }
      exhausted.add(tier.id);
    }
    if (!placed) unplaced++;
  }

  revalidateRewardPages(eventId);
  redirect(
    `/dashboard/admin/events/sponsored/${eventId}?notice=bulk&issued=${issued}&held=${held}&unplaced=${unplaced}#discount-codes`,
  );
}

/** Admin records a redemption the brand reported from their own platform. */
export async function markRewardCodeRedeemed(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  const eventId = str(formData.get("event_id"));
  if (!id || !eventId) return;
  await supabase
    .from("reward_codes")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString(), redeemed_by: userId })
    .eq("id", id)
    .eq("sponsored_event_id", eventId)
    .eq("status", "issued");
  revalidateRewardPages(eventId);
}

/** Voids an issued code. The pool code is *not* returned for reuse — the
 * participant has already been shown it and could still use it. */
export async function voidRewardCode(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const eventId = str(formData.get("event_id"));
  if (!id || !eventId) return;
  await supabase
    .from("reward_codes")
    .update({ status: "void" })
    .eq("id", id)
    .eq("sponsored_event_id", eventId)
    .eq("status", "issued");
  revalidateRewardPages(eventId);
}

// --- Artist payment split ----------------------------------------------------

export async function setArtistPaymentSplit(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  const fee = num(formData.get("artist_fee_gbp"));
  const upfront = num(formData.get("artist_upfront_gbp"));
  if (!eventId || fee == null || upfront == null) return;
  if (upfront > fee) return;

  const { data: updated } = await supabase
    .from("sponsored_events")
    .update({
      artist_fee_gbp: fee,
      artist_upfront_gbp: upfront,
      artist_remainder_gbp: roundMoney(fee - upfront),
    })
    .eq("id", eventId)
    .select("name, artist_profile_id")
    .maybeSingle<{ name: string; artist_profile_id: string | null }>();

  if (updated?.artist_profile_id) {
    await notify({
      eventKey: "sponsorship.artist_split_set",
      recipientProfileId: updated.artist_profile_id,
      link: `/dashboard/sponsored/${eventId}`,
      variables: {
        event_name: updated.name,
        upfront: `£${upfront.toLocaleString("en-GB")}`,
        remainder: `£${roundMoney(fee - upfront).toLocaleString("en-GB")}`,
      },
    });
  }

  revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
  revalidatePath(`/dashboard/sponsored/${eventId}`);
}

export async function markArtistUpfrontPaid(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  if (!eventId) return;

  const { data: updated } = await supabase
    .from("sponsored_events")
    .update({ artist_upfront_paid_at: new Date().toISOString() })
    .eq("id", eventId)
    .select("name, artist_profile_id, artist_upfront_gbp")
    .maybeSingle<{ name: string; artist_profile_id: string | null; artist_upfront_gbp: number | null }>();

  if (updated?.artist_profile_id) {
    await notify({
      eventKey: "sponsorship.upfront_paid",
      recipientProfileId: updated.artist_profile_id,
      link: `/dashboard/sponsored/${eventId}`,
      variables: {
        event_name: updated.name,
        upfront: updated.artist_upfront_gbp != null
          ? `£${Number(updated.artist_upfront_gbp).toLocaleString("en-GB")}`
          : "your upfront amount",
      },
    });
  }

  revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
  revalidatePath(`/dashboard/sponsored/${eventId}`);
}

export async function reviewTicketSalesReport(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  const eventId = str(formData.get("event_id"));
  if (!id) return;
  await supabase
    .from("ticket_sales_reports")
    .update({ status: "reviewed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (eventId) revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
}

export async function releaseArtistRemainder(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  if (!eventId) return;

  const { data: updated } = await supabase
    .from("sponsored_events")
    .update({
      artist_remainder_released_at: new Date().toISOString(),
      artist_remainder_released_by: userId,
    })
    .eq("id", eventId)
    .select("name, artist_profile_id, artist_remainder_gbp")
    .maybeSingle<{ name: string; artist_profile_id: string | null; artist_remainder_gbp: number | null }>();

  if (updated?.artist_profile_id) {
    await notify({
      eventKey: "sponsorship.remainder_released",
      recipientProfileId: updated.artist_profile_id,
      link: `/dashboard/sponsored/${eventId}`,
      variables: {
        event_name: updated.name,
        remainder: updated.artist_remainder_gbp != null
          ? `£${Number(updated.artist_remainder_gbp).toLocaleString("en-GB")}`
          : "the remainder",
      },
    });
  }

  revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
  revalidatePath(`/dashboard/sponsored/${eventId}`);
}

// --- Event change requests ---------------------------------------------------

export async function resolveEventChangeRequest(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  const eventId = str(formData.get("event_id"));
  const op = str(formData.get("op")); // "approve" | "decline"
  if (!id || !op) return;

  const { data: updated } = await supabase
    .from("sponsored_event_change_requests")
    .update({
      status: op === "approve" ? "approved" : "declined",
      admin_response: str(formData.get("admin_response")),
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("requested_by, sponsored_events(name)")
    .maybeSingle<{ requested_by: string; sponsored_events: { name: string } | null }>();

  if (updated) {
    await notify({
      eventKey: "sponsored.change_resolved",
      recipientProfileId: updated.requested_by,
      link: eventId ? `/dashboard/sponsored/${eventId}` : "/dashboard/sponsored",
      variables: {
        event_name: updated.sponsored_events?.name ?? "your sponsorship",
        status: op === "approve" ? "approved" : "declined",
      },
    });
  }

  if (eventId) revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
}
