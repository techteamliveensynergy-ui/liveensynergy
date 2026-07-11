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
