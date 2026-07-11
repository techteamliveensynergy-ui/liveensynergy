"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateConversation } from "@/lib/data/messaging";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  return { supabase, userId: user.id };
}

/**
 * Brand starts a conversation with a listing's owner, then jumps into the
 * message thread.
 */
export async function contactOrganiser(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const listingId = String(formData.get("listing_id") ?? "");

  const { data: listing } = await supabase
    .from("event_listings")
    .select("owner_profile_id")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing) redirect("/dashboard/discover");

  const conversationId = await getOrCreateConversation({
    brandProfileId: userId,
    partnerProfileId: listing.owner_profile_id,
    listingId,
  });

  if (!conversationId) redirect("/dashboard/discover");
  redirect(`/dashboard/messages?c=${conversationId}`);
}

/** Audience registers for an open sponsored event. */
export async function registerForEvent(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const sponsoredEventId = String(formData.get("sponsored_event_id") ?? "");

  await supabase.from("participations").insert({
    sponsored_event_id: sponsoredEventId,
    audience_profile_id: userId,
    status: "registered",
  });

  revalidatePath("/dashboard/discover");
  redirect("/dashboard/participations");
}
