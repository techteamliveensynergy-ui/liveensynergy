"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyAdmins } from "@/lib/notifications";

export interface ContactState {
  error?: string;
  message?: string;
}

export async function submitContactMessage(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("message") ?? "").trim();
  // Set by the link that opened the form (e.g. from a sponsorship page), so an
  // enquiry arrives already attached to the thing it's about (10 Aug standup).
  const reference = String(formData.get("reference") ?? "").trim();

  if (!name || !email || !body) {
    return { error: "Please fill in your name, email and message." };
  }

  const supabase = await createClient();
  // Taken from the session, never from the form — this endpoint is public, and
  // a posted profile_id would let anyone file an enquiry as someone else.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("contact_messages").insert({
    name,
    email,
    subject: subject || null,
    body,
    reference: reference || null,
    profile_id: user?.id ?? null,
  });

  if (error) {
    return { error: "Something went wrong sending your message. Please try again." };
  }

  // Contact submissions are invisible without this — there's no inbox screen yet.
  await notifyAdmins({
    eventKey: "admin.contact_message",
    variables: {
      name,
      email,
      subject: subject || "(no subject)",
      // The template quotes this, and an unresolved token would render as a
      // literal "{{reference}}" in the bell.
      reference: reference || "no reference",
    },
  });

  return { message: "Thanks — we've received your message and will be in touch soon." };
}
