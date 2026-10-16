import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notifications";
import { siteUrl } from "@/lib/site-url";

/**
 * Emails a signed-in, unverified account its welcome / confirm-your-email
 * link (0074). Only the token's sha-256 is stored; the token itself goes in
 * the link and nowhere else. Issuing a new one invalidates the previous
 * email's link. Returns false when nothing was sent (already verified, an
 * admin, or no session) — never throws, like notify().
 *
 * `supabase` must be the caller's own cookie client, signed in as the
 * account being verified.
 */
export async function sendVerificationEmail(
  supabase: SupabaseClient,
  profileId: string,
  roleLabel: string,
): Promise<boolean> {
  try {
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
          verify_link: `${await siteUrl()}/auth/verify-email?token=${token}`,
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
