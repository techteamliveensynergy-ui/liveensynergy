import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { notify } from "@/lib/notifications";
import { siteUrl } from "@/lib/site-url";

/**
 * Our own "reset your password" email (Testing notes 7 Nov: the Supabase email
 * didn't mention Live·En·Synergy and its link landed on localhost).
 *
 * The Admin API makes the recovery token without sending anything; the link
 * points straight at our /auth/callback with `token_hash` (which works on any
 * device and doesn't depend on Supabase's redirect allow-list or Site URL),
 * and the email goes out through notify() like every other email we send —
 * branded, logged in the outbox, editable by admins (account.password_reset).
 *
 * Returns:
 *  - "sent"     — our email is queued (or there's no account: we say the same
 *                 thing either way, so nobody can test which addresses exist);
 *  - "fallback" — this deployment can't do it (no service key, or 0117 not
 *                 applied yet): the caller uses Supabase's own email instead.
 */
export async function sendPasswordResetEmail(email: string): Promise<"sent" | "fallback"> {
  const service = createServiceClient();
  if (!service) return "fallback";
  try {
    // The 0006 placeholder had no link; until 0117 (or an admin) gives the
    // template one, Supabase's own email is the only one that works.
    const { data: template } = await service
      .from("notification_templates")
      .select("body")
      .eq("event_key", "account.password_reset")
      .eq("channel", "email")
      .maybeSingle<{ body: string | null }>();
    if (!template?.body || !/\{\{\s*(reset_link|link)\s*\}\}/.test(template.body)) return "fallback";

    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .maybeSingle<{ id: string }>();
    if (!profile) return "sent";

    // Supabase throttled its reset emails; ours mustn't become a way to flood
    // an inbox: at most one a minute and five an hour per account (silently —
    // the screen says the same thing either way).
    const recent = (mins: number) =>
      service
        .from("email_outbox")
        .select("id", { count: "exact", head: true })
        .eq("event_key", "account.password_reset")
        .eq("recipient_profile_id", profile.id)
        .gte("created_at", new Date(Date.now() - mins * 60_000).toISOString());
    const [{ count: lastMinute }, { count: lastHour }] = await Promise.all([recent(1), recent(60)]);
    if ((lastMinute ?? 0) >= 1 || (lastHour ?? 0) >= 5) return "sent";

    const { data: link, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email });
    const tokenHash = link?.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error("[password-reset] generateLink failed", error?.message);
      return "fallback";
    }
    const resetLink = `${await siteUrl()}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=${encodeURIComponent("/auth/reset-password")}`;
    await notify(
      { eventKey: "account.password_reset", recipientProfileId: profile.id, variables: { reset_link: resetLink, link: resetLink } },
      { client: service },
    );
    return "sent";
  } catch (err) {
    console.error("[password-reset] failed", err);
    return "fallback";
  }
}
