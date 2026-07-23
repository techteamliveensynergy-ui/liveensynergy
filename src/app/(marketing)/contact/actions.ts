"use server";

import { createClient } from "@/lib/supabase/server";

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

  if (!name || !email || !body) {
    return { error: "Please fill in your name, email and message." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").insert({
    name,
    email,
    subject: subject || null,
    body,
  });

  if (error) {
    return { error: "Something went wrong sending your message. Please try again." };
  }

  return { message: "Thanks — we've received your message and will be in touch soon." };
}
