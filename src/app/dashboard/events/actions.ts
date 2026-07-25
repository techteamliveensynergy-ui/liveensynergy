"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";
import { uploadImage } from "@/lib/storage";
import { assessProfile } from "@/lib/profile-completeness";

export interface ListingState {
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

async function currentContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  return { supabase, userId: user.id };
}

/** Builds the listing column payload from the submitted form. */
function listingPayload(formData: FormData) {
  return {
    name: str(formData.get("name")),
    event_date: str(formData.get("event_date")),
    venue_name: str(formData.get("venue_name")),
    city: str(formData.get("city")),
    country: str(formData.get("country")),
    category: str(formData.get("category")),
    capacity: num(formData.get("capacity")),
    ticket_price_gbp: num(formData.get("ticket_price_gbp")),
    ticket_buy_url: str(formData.get("ticket_buy_url")),
    budget_range: str(formData.get("budget_range")),
    existing_sponsors: str(formData.get("existing_sponsors")),
    sponsor_benefits: str(formData.get("sponsor_benefits")),
    // "available" checkbox → publish immediately, else keep as draft
    status: formData.get("make_available") ? "available" : "draft",
  };
}

export async function createListing(
  _prev: ListingState,
  formData: FormData,
): Promise<ListingState> {
  const { supabase, userId } = await currentContext();
  const payload = listingPayload(formData);
  if (!payload.name) return { error: "Event name is required." };

  // Link the owning artist / organiser record if it exists.
  const [{ data: artist }, { data: organiser }] = await Promise.all([
    supabase.from("artists").select("*").eq("profile_id", userId).maybeSingle(),
    supabase
      .from("event_organisers")
      .select("*")
      .eq("profile_id", userId)
      .maybeSingle(),
  ]);

  // The page hides the form when the profile is incomplete; this is the
  // matching server-side rule, so the check can't be skipped by posting
  // directly to the action.
  const role = artist ? "artist" : "event";
  const { blocking } = assessProfile(role, artist ?? organiser);
  if (blocking.length > 0) {
    return {
      error: `Complete your profile first — still missing: ${blocking
        .map((f) => f.label)
        .join(", ")}.`,
    };
  }

  const image = await uploadImage(formData.get("image"), "event");
  if (image.error) return { error: image.error };

  const { error } = await supabase.from("event_listings").insert({
    ...payload,
    image_url: image.url ?? null,
    owner_profile_id: userId,
    artist_id: artist?.id ?? null,
    organiser_id: organiser?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/events");
  redirect("/dashboard/events");
}

export async function updateListing(
  _prev: ListingState,
  formData: FormData,
): Promise<ListingState> {
  const { supabase, userId } = await currentContext();
  const id = str(formData.get("id"));
  if (!id) return { error: "Missing listing id." };

  const payload = listingPayload(formData);
  if (!payload.name) return { error: "Event name is required." };

  const image = await uploadImage(formData.get("image"), "event");
  if (image.error) return { error: image.error };

  const { error } = await supabase
    .from("event_listings")
    // Leaving the picker empty keeps the existing artwork.
    .update(image.url ? { ...payload, image_url: image.url } : payload)
    .eq("id", id)
    .eq("owner_profile_id", userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/events");
  redirect("/dashboard/events");
}

export async function deleteListing(formData: FormData) {
  const { supabase, userId } = await currentContext();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase
    .from("event_listings")
    .delete()
    .eq("id", id)
    .eq("owner_profile_id", userId);
  revalidatePath("/dashboard/events");
}

/** Toggle a listing between draft and available. */
export async function toggleListingStatus(formData: FormData) {
  const { supabase, userId } = await currentContext();
  const id = str(formData.get("id"));
  const next = str(formData.get("next_status"));
  if (!id || !next) return;
  const { data: updated } = await supabase
    .from("event_listings")
    .update({ status: next })
    .eq("id", id)
    .eq("owner_profile_id", userId)
    .select("name")
    .maybeSingle();

  if (next === "available" && updated) {
    await notify({
      eventKey: "listing.published",
      recipientProfileId: userId,
      link: `/dashboard/events/${id}`,
      variables: { event_name: updated.name },
    });
  }

  revalidatePath("/dashboard/events");
}
