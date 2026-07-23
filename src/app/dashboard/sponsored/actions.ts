"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";

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

/** Brand creates a sponsored-event record from one of their available matches. */
export async function createSponsoredEvent(
  _prev: SponsoredState,
  formData: FormData,
): Promise<SponsoredState> {
  const { supabase, userId } = await requireUser();

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!brand) redirect("/onboarding");

  const name = str(formData.get("name"));
  if (!name) return { error: "Event name is required." };

  const budget = num(formData.get("budget_gbp"));
  let artistProfileId: string | null = null;
  let listingId = str(formData.get("listing_id"));

  if (listingId) {
    const { data: listing } = await supabase
      .from("event_listings")
      .select("owner_profile_id")
      .eq("id", listingId)
      .maybeSingle();
    artistProfileId = listing?.owner_profile_id ?? null;
  } else {
    listingId = null;
  }

  const { data: created, error } = await supabase
    .from("sponsored_events")
    .insert({
      brand_id: brand.id,
      campaign_id: str(formData.get("campaign_id")),
      listing_id: listingId,
      artist_profile_id: artistProfileId,
      name,
      event_date: str(formData.get("event_date")),
      venue_details: str(formData.get("venue_details")),
      location: str(formData.get("location")),
      budget_gbp: budget,
      remaining_budget_gbp: budget,
      reward_rules: str(formData.get("reward_rules")),
      terms: str(formData.get("terms")),
      participation_deadline: str(formData.get("participation_deadline")),
      brand_agreed: true, // creator (brand) agrees on creation
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // The artist now has a proposal waiting on them.
  if (artistProfileId) {
    await notify({
      eventKey: "offer.proposal_received",
      recipientProfileId: artistProfileId,
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

/** Parties can edit shared terms / reward rules while in progress. */
export async function updateSponsoredEvent(formData: FormData) {
  const { supabase } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase
    .from("sponsored_events")
    .update({
      terms: str(formData.get("terms")),
      reward_rules: str(formData.get("reward_rules")),
      participation_deadline: str(formData.get("participation_deadline")),
    })
    .eq("id", id);
  revalidatePath(`/dashboard/sponsored/${id}`);
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
