"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/profile";

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

  const { error: settingsError } = await supabase
    .from("notification_settings")
    .update({
      in_app_enabled: String(formData.get("in_app_enabled") ?? "") === "on",
      email_enabled: String(formData.get("email_enabled") ?? "") === "on",
      email_cc: emails(formData.get("email_cc")),
      email_bcc: emails(formData.get("email_bcc")),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("event_key", eventKey);
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
