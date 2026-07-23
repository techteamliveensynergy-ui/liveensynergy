"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";

export async function sendMessage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const conversationId = String(formData.get("conversation_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId || !body) return;

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_profile_id: user.id,
    body,
  });

  // Notify whichever side of the conversation didn't send this.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("brand_profile_id, partner_profile_id, event_listings(name)")
    .eq("id", conversationId)
    .maybeSingle<{
      brand_profile_id: string;
      partner_profile_id: string;
      event_listings: { name: string } | null;
    }>();

  if (conversation) {
    const recipient =
      conversation.brand_profile_id === user.id
        ? conversation.partner_profile_id
        : conversation.brand_profile_id;

    const { data: sender } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    await notify({
      eventKey: "message.received",
      recipientProfileId: recipient,
      link: `/dashboard/messages?c=${conversationId}`,
      variables: {
        sender_name: sender?.full_name ?? "Someone",
        event_name: conversation.event_listings?.name ?? undefined,
      },
    });
  }

  revalidatePath("/dashboard/messages");
}
