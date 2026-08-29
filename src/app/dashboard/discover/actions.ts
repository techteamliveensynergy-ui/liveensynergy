"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateSupportConversation } from "@/lib/data/messaging";
import { notify, notifyAdmins } from "@/lib/notifications";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  return { supabase, userId: user.id };
}

/**
 * Brand raises interest in a listing with the Live·En·Synergy team, who
 * relay it to the organiser (26 Aug: brands and artists/organisers no
 * longer message each other directly — admin is the required
 * intermediary, matching how campaign matching already works).
 */
export async function contactOrganiser(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const listingId = String(formData.get("listing_id") ?? "");

  const { data: listing } = await supabase
    .from("event_listings")
    .select("owner_profile_id, name")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing) redirect("/dashboard/discover");

  const conversationId = await getOrCreateSupportConversation({
    userProfileId: userId,
    subject: `Interested in ${listing.name}`,
  });

  if (!conversationId) redirect("/dashboard/discover");

  const { data: brand } = await supabase
    .from("brands")
    .select("brand_name")
    .eq("profile_id", userId)
    .maybeSingle();

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_profile_id: userId,
    body: `Interested in sponsoring: ${listing.name}`,
  });

  // The team relays this to the organiser's own thread with us if it's
  // worth pursuing. Same event key `sendMessage()` already fires for any
  // support-thread message from a non-admin — kept consistent rather than
  // inventing a parallel one for this entry point.
  await notifyAdmins({
    eventKey: "message.received",
    link: `/dashboard/messages?c=${conversationId}`,
    variables: {
      sender_name: brand?.brand_name ?? "A brand",
      event_name: listing.name,
    },
  });

  // The match is reviewed by the team before anything is confirmed, so set the
  // expectation up front rather than leaving the brand waiting on a reply.
  redirect(`/dashboard/messages?c=${conversationId}&notice=enquiry`);
}

export interface RegistrationState {
  error?: string;
}

/**
 * Audience registers for an open sponsored event, from the details page.
 *
 * Replaces the old one-click button on Discover (aligned 29 Jul): people were
 * signing up accidentally, and without seeing the reward terms or what taking
 * part actually asks of them.
 */
export async function confirmRegistration(
  _prev: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const { supabase, userId } = await requireUser();
  const sponsoredEventId = String(formData.get("sponsored_event_id") ?? "");
  if (!sponsoredEventId) return { error: "Missing event." };

  if (formData.get("accept_terms") !== "yes") {
    return { error: "Please accept the terms & conditions to register." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const dateOfBirth = String(formData.get("date_of_birth") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const phoneCountryCode = String(formData.get("phone_country_code") ?? "+44").trim() || "+44";
  if (!fullName) return { error: "Your name is required." };
  if (!dateOfBirth) return { error: "Your date of birth is required." };
  if (!phone) return { error: "A contact phone number is required." };

  // Registration is also the moment stale profile details get corrected, so
  // write back whatever they changed on the way through.
  const { error: profileError } = await supabase
    .from("audience_members")
    .upsert(
      {
        profile_id: userId,
        full_name: fullName,
        date_of_birth: dateOfBirth,
        phone,
        phone_country_code: phoneCountryCode,
      },
      { onConflict: "profile_id" },
    );
  if (profileError) return { error: profileError.message };

  // The insert error used to be discarded, so a failed registration still ran
  // the notifications and redirected to My events — where nothing new had
  // appeared. From the outside that is indistinguishable from the button doing
  // nothing at all.
  const { error: insertError } = await supabase.from("participations").insert({
    sponsored_event_id: sponsoredEventId,
    audience_profile_id: userId,
    status: "registered",
    terms_accepted_at: new Date().toISOString(),
  });

  if (insertError) {
    // 23505 = already registered for this event; treat it as success so a
    // double submit lands them on the registration they already have.
    if (insertError.code !== "23505") {
      console.error("[confirmRegistration] insert failed", insertError);
      return { error: insertError.message };
    }
    redirect("/dashboard/participations?notice=already-registered");
  }

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
  // Landing on My events with no message read as "nothing happened" even when
  // the registration had worked.
  redirect("/dashboard/participations?notice=registered");
}
