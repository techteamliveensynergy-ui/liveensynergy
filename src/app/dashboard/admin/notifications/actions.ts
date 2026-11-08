"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { drainOutbox } from "@/lib/email/drain";

export interface NotificationAdminState {
  error?: string;
  success?: boolean;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

/** Comma / newline separated addresses → array. */
function emails(v: FormDataEntryValue | null): string[] | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const list = s
    .split(/[,\n;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

/** Flips one channel on/off straight from the catalogue list. */
export async function toggleChannel(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const eventKey = str(formData.get("event_key"));
  const channel = str(formData.get("channel"));
  const next = str(formData.get("next")) === "true";
  if (!eventKey || !channel) return;

  const column = channel === "email" ? "email_enabled" : "in_app_enabled";
  await supabase
    .from("notification_settings")
    .update({ [column]: next, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("event_key", eventKey);

  revalidatePath("/dashboard/admin/notifications");
  revalidatePath(`/dashboard/admin/notifications/${eventKey}`);
}

/** Saves channel settings, CC/BCC and both templates from the editor. */
export async function saveNotification(
  _prev: NotificationAdminState,
  formData: FormData,
): Promise<NotificationAdminState> {
  const { supabase, userId } = await requireAdmin();
  const eventKey = str(formData.get("event_key"));
  if (!eventKey) return { error: "Missing event key." };

  const base = {
    in_app_enabled: String(formData.get("in_app_enabled") ?? "") === "on",
    email_enabled: String(formData.get("email_enabled") ?? "") === "on",
    email_cc: emails(formData.get("email_cc")),
    email_bcc: emails(formData.get("email_bcc")),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  // The email's action button (0113). Before that migration the columns don't
  // exist, so the rest of the settings still save.
  const label = str(formData.get("email_button_label"));
  let { error: settingsError } = await supabase
    .from("notification_settings")
    .update({
      ...base,
      email_button: String(formData.get("email_button") ?? "") === "on",
      email_button_label: label ? label.slice(0, 40) : null,
    })
    .eq("event_key", eventKey);
  if (settingsError && /email_button/.test(settingsError.message)) {
    ({ error: settingsError } = await supabase.from("notification_settings").update(base).eq("event_key", eventKey));
  }
  if (settingsError) return { error: settingsError.message };

  const templates = [
    {
      event_key: eventKey,
      channel: "in_app",
      subject: str(formData.get("in_app_subject")),
      body: str(formData.get("in_app_body")),
    },
    {
      event_key: eventKey,
      channel: "email",
      subject: str(formData.get("email_subject")),
      body: str(formData.get("email_body")),
    },
  ];

  const { error: templateError } = await supabase
    .from("notification_templates")
    .upsert(templates, { onConflict: "event_key,channel" });
  if (templateError) return { error: templateError.message };

  revalidatePath("/dashboard/admin/notifications");
  revalidatePath(`/dashboard/admin/notifications/${eventKey}`);
  return { success: true };
}

const OUTBOX_PAGE = "/dashboard/admin/notifications/outbox";

/**
 * Puts a failed/skipped email back in the queue and sends it now. The outbox
 * has no admin write policy (admins only read it), so the reset goes through
 * the service client — after requireAdmin() has vouched for the caller.
 * A suppressed (bounced/complained) address stays blocked until it is removed
 * from the suppression list.
 */
export async function retryOutboxEmail(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  const service = createServiceClient();
  if (!service) return;

  const { data: row } = await supabase
    .from("email_outbox")
    .select("to_email, status")
    .eq("id", id)
    .maybeSingle();
  if (!row || !["failed", "skipped"].includes(row.status)) return;

  const { data: blocked } = await supabase
    .from("email_suppressions")
    .select("email")
    .eq("email", String(row.to_email).toLowerCase())
    .maybeSingle();
  if (blocked) {
    revalidatePath(OUTBOX_PAGE);
    return;
  }

  await service
    .from("email_outbox")
    .update({
      status: "queued",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", id)
    .in("status", ["failed", "skipped"]);

  await drainOutbox({ limit: 5 });
  revalidatePath(OUTBOX_PAGE);
}

/**
 * Re-queues every failed email in one go (skipping suppressed addresses) and
 * sends a first batch straight away; the 5-minute sweeper picks up the rest.
 */
export async function retryAllFailedEmails() {
  const { supabase } = await requireAdmin();
  const service = createServiceClient();
  if (!service) return;

  const { data: failed } = await supabase
    .from("email_outbox")
    .select("id, to_email")
    .eq("status", "failed")
    .limit(500);
  const rows = (failed ?? []) as { id: string; to_email: string }[];
  if (rows.length === 0) {
    revalidatePath(OUTBOX_PAGE);
    return;
  }

  const { data: blocked } = await supabase
    .from("email_suppressions")
    .select("email")
    .in("email", [...new Set(rows.map((r) => r.to_email.toLowerCase()))]);
  const blockedSet = new Set(((blocked ?? []) as { email: string }[]).map((b) => b.email));
  const ids = rows.filter((r) => !blockedSet.has(r.to_email.toLowerCase())).map((r) => r.id);

  if (ids.length > 0) {
    await service
      .from("email_outbox")
      .update({
        status: "queued",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        error: null,
      })
      .in("id", ids)
      .eq("status", "failed");
    await drainOutbox({ limit: 10 });
  }
  revalidatePath(OUTBOX_PAGE);
}

/** Removes an address from the suppression list so it can be mailed again. */
export async function unsuppressEmail(formData: FormData) {
  const { supabase } = await requireAdmin();
  const email = str(formData.get("email"));
  if (!email) return;
  await supabase.from("email_suppressions").delete().eq("email", email.toLowerCase());
  revalidatePath(OUTBOX_PAGE);
}
