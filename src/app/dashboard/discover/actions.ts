"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateConversation } from "@/lib/data/messaging";
import { notify } from "@/lib/notifications";

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

  // The organiser has a new sponsor enquiry sitting in their offers inbox.
  const { data: brand } = await supabase
    .from("brands")
    .select("brand_name")
    .eq("profile_id", userId)
    .maybeSingle();

  await notify({
    eventKey: "offer.received",
    recipientProfileId: listing.owner_profile_id,
    link: `/dashboard/messages?c=${conversationId}`,
    variables: { brand_name: brand?.brand_name ?? "A brand" },
  });

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

  const { data: ev } = await supabase
    .from("sponsored_events")
    .select("name, reward_rules, artist_profile_id")
    .eq("id", sponsoredEventId)
    .maybeSingle();

  if (ev) {
    // Confirm to the audience member…
    await notify({
      eventKey: "participation.registered",
      recipientProfileId: userId,
      link: "/dashboard/participations",
      variables: {
        event_name: ev.name,
        reward_rules: ev.reward_rules ?? undefined,
      },
    });
    // …and let the organiser know someone signed up.
    if (ev.artist_profile_id) {
      await notify({
        eventKey: "participant.registered",
        recipientProfileId: ev.artist_profile_id,
        link: `/dashboard/sponsored/${sponsoredEventId}`,
        variables: { event_name: ev.name },
      });
    }
  }

  revalidatePath("/dashboard/discover");
  redirect("/dashboard/participations");
}
