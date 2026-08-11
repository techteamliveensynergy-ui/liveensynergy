import { createClient } from "@/lib/supabase/server";

/**
 * Returns an existing conversation between a brand and a partner (artist /
 * organiser) for an optional listing, creating one if needed. Returns the
 * conversation id, or null on failure.
 *
 * The "does one already exist?" lookup used `.is("listing_id", listingId)` for
 * both cases. PostgREST's `is.` operator only understands null / true / false,
 * so with a real listing id it sent `listing_id=is.<uuid>` and came back 400 —
 * the error was discarded, the function concluded there was no thread, and
 * fell through to the insert. The insert then hit
 * `conversations_unique_thread` (0008), returned null, and the caller bounced
 * the user back where they came from with no explanation. Which is to say:
 * clicking "Contact organiser" a second time about the same event silently did
 * nothing. `is` is only correct for the null case; a value needs `eq`.
 */
export async function getOrCreateConversation(params: {
  brandProfileId: string;
  partnerProfileId: string;
  listingId?: string | null;
}) {
  const supabase = await createClient();
  const { brandProfileId, partnerProfileId, listingId = null } = params;

  const lookup = supabase
    .from("conversations")
    .select("id")
    .eq("brand_profile_id", brandProfileId)
    .eq("partner_profile_id", partnerProfileId)
    .eq("kind", "partner");

  const { data: existing } = await (listingId
    ? lookup.eq("listing_id", listingId)
    : lookup.is("listing_id", null)
  )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      brand_profile_id: brandProfileId,
      partner_profile_id: partnerProfileId,
      listing_id: listingId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[messaging] could not open conversation", error);
    return null;
  }
  return created.id as string;
}

/**
 * Returns the user's thread with the Live-En-Synergy team, creating it if
 * needed. Support threads are stored in the same table with `kind = 'support'`;
 * the admin on the other end is whichever admin profile was created first, so
 * the thread stays stable rather than bouncing between admins.
 */
export async function getOrCreateSupportConversation(params: {
  userProfileId: string;
  subject?: string | null;
  /**
   * Which admin sits on the other end. Defaults to the oldest admin account so
   * a user-started thread doesn't bounce between admins; an admin starting the
   * conversation themselves passes their own id (10 Aug standup).
   */
  adminProfileId?: string | null;
}) {
  const supabase = await createClient();
  const { userProfileId, subject = null, adminProfileId = null } = params;

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("brand_profile_id", userProfileId)
    .eq("kind", "support")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id as string;

  let adminId = adminProfileId;
  if (!adminId) {
    const { data: admin } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    adminId = admin?.id ?? null;
  }

  // No admin seeded yet — there's nobody for the thread to be with.
  if (!adminId) return null;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      brand_profile_id: userProfileId,
      partner_profile_id: adminId,
      kind: "support",
      subject,
    })
    .select("id")
    .single();

  if (error) return null;
  return created.id as string;
}
