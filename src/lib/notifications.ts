import { createClient } from "@/lib/supabase/server";

/**
 * Notification dispatch.
 *
 * One entry point (`notify`) used by every call site. It resolves the admin's
 * per-event channel settings, renders the stored templates, and writes an
 * in-app row and/or an `email_outbox` row.
 *
 * Two rules matter here:
 *  1. **Never throw.** A notification failing must not fail the sponsorship,
 *     registration or sign-up that triggered it. Everything is best-effort.
 *  2. **No provider yet.** Email is queued to the outbox; draining it is a
 *     separate worker we'll add when a provider is wired. The outbox doubles
 *     as the audit log admin previews.
 */

export type NotificationEventKey = string;

export interface NotifyInput {
  eventKey: NotificationEventKey;
  /** Profile that receives it. */
  recipientProfileId: string;
  /** Values substituted into {{tokens}} in the templates. */
  variables?: Record<string, string | number | null | undefined>;
  /** In-app deep link. */
  link?: string;
  /**
   * Overrides the recipient's stored email. Used for the admin fan-out and
   * anywhere the recipient isn't a normal profile.
   */
  toEmail?: string;
}

interface TemplateRow {
  channel: "in_app" | "email";
  subject: string | null;
  body: string | null;
}

/** Replaces {{token}} with its value, leaving unknown tokens visible. */
export function renderTemplate(
  template: string | null | undefined,
  variables: Record<string, string | number | null | undefined> = {},
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const v = variables[key];
    return v === undefined || v === null || v === "" ? match : String(v);
  });
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const supabase = await createClient();
    const { eventKey, recipientProfileId, variables = {}, link } = input;

    const [{ data: settings }, { data: templateRows }, { data: profile }] =
      await Promise.all([
        supabase
          .from("notification_settings")
          .select("in_app_enabled, email_enabled, email_cc, email_bcc")
          .eq("event_key", eventKey)
          .maybeSingle(),
        supabase
          .from("notification_templates")
          .select("channel, subject, body")
          .eq("event_key", eventKey),
        supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", recipientProfileId)
          .maybeSingle(),
      ]);

    // Unknown event key — nothing seeded, so nothing to send.
    if (!settings) return;

    const templates = (templateRows ?? []) as TemplateRow[];
    const inApp = templates.find((t) => t.channel === "in_app");
    const email = templates.find((t) => t.channel === "email");

    // `user_name` is so commonly used it's worth defaulting.
    const vars = {
      user_name: profile?.full_name ?? "there",
      ...variables,
    };

    const wantsInApp = settings.in_app_enabled && inApp;
    const toEmail = input.toEmail ?? profile?.email ?? null;
    const wantsEmail = settings.email_enabled && email && toEmail;

    if (!wantsInApp && !wantsEmail) return;

    await supabase.rpc("enqueue_notification", {
      p_event_key: eventKey,
      p_recipient: recipientProfileId,
      p_in_app_title: wantsInApp
        ? renderTemplate(inApp!.subject, vars) || eventKey
        : null,
      p_in_app_body: wantsInApp ? renderTemplate(inApp!.body, vars) : null,
      p_link: wantsInApp ? (link ?? null) : null,
      p_email_to: wantsEmail ? toEmail : null,
      p_email_cc: wantsEmail ? (settings.email_cc ?? null) : null,
      p_email_bcc: wantsEmail ? (settings.email_bcc ?? null) : null,
      p_email_subject: wantsEmail ? renderTemplate(email!.subject, vars) : null,
      p_email_body: wantsEmail ? renderTemplate(email!.body, vars) : null,
    });
  } catch (err) {
    // Deliberately swallowed — see rule 1 above.
    console.error("[notify] failed", input.eventKey, err);
  }
}

/** Fans an event out to every admin (e.g. "a new campaign needs matching"). */
export async function notifyAdmins(
  input: Omit<NotifyInput, "recipientProfileId">,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true);

    for (const admin of (data ?? []) as { id: string }[]) {
      await notify({ ...input, recipientProfileId: admin.id });
    }
  } catch (err) {
    console.error("[notifyAdmins] failed", input.eventKey, err);
  }
}
