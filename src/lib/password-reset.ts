import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { notify } from "@/lib/notifications";
import { createAccessLink } from "@/lib/access-links";

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
type AccessLink = {
  /** notification_events key — its email template must carry {{link}}. */
  eventKey: "account.password_reset" | "account.sign_in_link";
  /** What the Admin API mints: a recovery link (choose a new password) or a sign-in link. */
  linkType: "recovery" | "magiclink";
  /** Where /auth/callback sends the person once the link has signed them in. */
  next: string;
  /** The variable names the template reads for the address. */
  variables: (link: string) => Record<string, string>;
};

/**
 * Mints a one-time link with the Admin API (nothing is sent by Supabase) and
 * sends it as OUR email through notify(). Shared by "forgot password" and the
 * survey's "email me a sign-in link", so neither ever sends Supabase's
 * unbranded message.
 */
async function sendAccessLink(email: string, spec: AccessLink): Promise<"sent" | "unavailable"> {
  const service = createServiceClient();
  if (!service) {
    console.error("[access-link] no service client (SUPABASE_SERVICE_ROLE_KEY unset)");
    return "unavailable";
  }
  try {
    // Until the template exists and carries a link, there is nothing correct to
    // send (an unseeded event would be a silent no-op).
    const { data: template } = await service
      .from("notification_templates")
      .select("body")
      .eq("event_key", spec.eventKey)
      .eq("channel", "email")
      .maybeSingle<{ body: string | null }>();
    if (!template?.body || !/\{\{\s*(reset_link|sign_in_link|link)\s*\}\}/.test(template.body)) {
      console.error(`[access-link] ${spec.eventKey} email template is missing or has no link token`);
      return "unavailable";
    }

    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .maybeSingle<{ id: string }>();
    // No account: say the same thing either way, so nobody can test which
    // addresses exist.
    if (!profile) return "sent";

    // Supabase throttled its own emails; ours mustn't become a way to flood an
    // inbox: at most one a minute and five an hour per account (silently — the
    // screen says the same thing either way).
    const recent = (mins: number) =>
      service
        .from("email_outbox")
        .select("id", { count: "exact", head: true })
        .eq("event_key", spec.eventKey)
        .eq("recipient_profile_id", profile.id)
        .gte("created_at", new Date(Date.now() - mins * 60_000).toISOString());
    const [{ count: lastMinute }, { count: lastHour }] = await Promise.all([recent(1), recent(60)]);
    if ((lastMinute ?? 0) >= 1 || (lastHour ?? 0) >= 5) return "sent";

    const { data: link, error } = await createAdminClient().auth.admin.generateLink({ type: spec.linkType, email });
    const tokenHash = link?.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error("[access-link] generateLink failed", error?.message);
      return "unavailable";
    }
    // The link in the email is a clean /auth/link/<token> page, not a URL full
    // of parameters (and not redeemed until the person presses its button).
    const url = await createAccessLink({
      type: spec.linkType,
      supabaseTokenHash: tokenHash,
      next: spec.next,
      profileId: profile.id,
    });
    if (!url) return "unavailable";
    await notify(
      { eventKey: spec.eventKey, recipientProfileId: profile.id, variables: { link: url, ...spec.variables(url) } },
      { client: service },
    );
    return "sent";
  } catch (err) {
    console.error("[access-link] failed", err);
    return "unavailable";
  }
}

/**
 * "Forgot password": our branded email with a link that signs the person in
 * and lands on the choose-a-new-password page (they are signed in, set the new
 * password, and are taken to their dashboard). Works on any device.
 *
 * "sent" also covers "no such account" (same answer either way). "unavailable"
 * means this deployment can't send it (no service key, or the template isn't
 * set up) — the caller says so honestly instead of falling back to Supabase's
 * unbranded email.
 */
export async function sendPasswordResetEmail(email: string): Promise<"sent" | "unavailable"> {
  return sendAccessLink(email, {
    eventKey: "account.password_reset",
    linkType: "recovery",
    next: "/auth/reset-password",
    variables: (link) => ({ reset_link: link }),
  });
}

/**
 * The survey's "email me a link to sign in" (0122): our branded email whose
 * link signs the person in and returns them to the survey they were on.
 */
export async function sendSignInLinkEmail(email: string, next: string): Promise<"sent" | "unavailable"> {
  return sendAccessLink(email, {
    eventKey: "account.sign_in_link",
    linkType: "magiclink",
    next,
    variables: (link) => ({ sign_in_link: link }),
  });
}
