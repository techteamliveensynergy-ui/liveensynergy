import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notifications";
import { siteUrl } from "@/lib/site-url";
import { safeRedirectPath } from "@/lib/urls";

/**
 * Emails a signed-in, unverified account its welcome / confirm-your-email
 * link (0074). Only the token's sha-256 is stored; the token itself goes in
 * the link and nowhere else. Issuing a new one invalidates the previous
 * email's link. Returns false when nothing was sent (already verified, an
 * admin, or no session) — never throws, like notify().
 *
 * `supabase` must be the caller's own cookie client, signed in as the
 * account being verified.
 *
 * `next` is a same-site path to land on after the link is opened (a survey
 * respondent returns to their survey, signed in — client note, 4 Nov). It is
 * re-validated when the link is used (/auth/verify-email); anything that isn't
 * a plain site path is dropped here too.
 */
export async function sendVerificationEmail(
  supabase: SupabaseClient,
  profileId: string,
  roleLabel: string,
  next?: string | null,
): Promise<boolean> {
  try {
    const returnTo = safeRedirectPath(next, "");
    const nextQuery = returnTo ? `&next=${encodeURIComponent(returnTo)}` : "";
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data: issued, error } = await supabase.rpc("issue_email_verification", {
      p_token_hash: tokenHash,
    });
    if (error || issued !== true) return false;

    await notify(
      {
        eventKey: "account.verify_email",
        recipientProfileId: profileId,
        variables: {
          role_label: roleLabel,
          verify_link: `${await siteUrl()}/auth/verify-email?token=${token}${nextQuery}`,
        },
      },
      { client: supabase },
    );
    return true;
  } catch (err) {
    console.error("[sendVerificationEmail] failed", err);
    return false;
  }
}
