"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { redeemAccessLink } from "@/lib/access-links";
import { safeRedirectPath } from "@/lib/urls";

/**
 * Pressing "Continue" on /auth/link/<token>: uses the link up, signs the
 * person in with the one-time token behind it, and sends them on (the
 * choose-a-new-password page for a reset; back to where they were for a
 * sign-in link). A link that is expired, already used or refused goes to the
 * "link expired" page, where they can ask for a new one.
 */
export async function continueWithLink(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const link = await redeemAccessLink(token);
  if (!link) redirect("/auth/link-expired?reason=expired");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: link.supabaseTokenHash, type: link.type });
  if (error) redirect("/auth/link-expired?reason=expired");

  // Opening a link from our email proves the person owns the address.
  await supabase.rpc("mark_email_verified").then(
    () => undefined,
    () => undefined,
  );
  const next = safeRedirectPath(link.next, "/dashboard");
  redirect(next.startsWith("/onboarding") ? `${next}${next.includes("?") ? "&" : "?"}confirmed=1` : next);
}
