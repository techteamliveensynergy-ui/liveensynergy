import { createClient } from "@/lib/supabase/server";

/**
 * Returns an existing conversation between a brand and a partner (artist /
 * organiser) for an optional listing, creating one if needed. Returns the
 * conversation id, or null on failure.
 */
export async function getOrCreateConversation(params: {
  brandProfileId: string;
  partnerProfileId: string;
  listingId?: string | null;
}) {
  const supabase = await createClient();
  const { brandProfileId, partnerProfileId, listingId = null } = params;

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("brand_profile_id", brandProfileId)
    .eq("partner_profile_id", partnerProfileId)
    .is("listing_id", listingId)
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

  if (error) return null;
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
}) {
  const supabase = await createClient();
  const { userProfileId, subject = null } = params;

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("brand_profile_id", userProfileId)
    .eq("kind", "support")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: admin } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // No admin seeded yet — there's nobody for the thread to be with.
  if (!admin) return null;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      brand_profile_id: userProfileId,
      partner_profile_id: admin.id,
      kind: "support",
      subject,
    })
    .select("id")
    .single();

  if (error) return null;
  return created.id as string;
}
