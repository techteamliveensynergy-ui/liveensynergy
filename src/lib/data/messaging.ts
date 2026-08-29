import { createClient } from "@/lib/supabase/server";

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
