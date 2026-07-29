import { createClient } from "@/lib/supabase/server";

/**
 * Whether the person looking at a public profile should see the sponsor-facing
 * sections ("What sponsors get").
 *
 * Aligned 29 Jul: that section clutters the public page for a general visitor
 * and isn't aimed at them — but sponsors still need it, so it stays visible to
 * signed-in brands, to admins, and to the owner previewing their own page.
 */
export async function canSeeSponsorSections(
  ownerProfileId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged out — the plain public view.
  if (!user) return false;
  // The owner, checking their own page.
  if (user.id === ownerProfileId) return true;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  return data?.role === "brand" || data?.role === "admin";
}
