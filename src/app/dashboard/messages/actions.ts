"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify, notifyAdmins } from "@/lib/notifications";
import { uploadPrivateFile } from "@/lib/storage";
import { getOrCreateSupportConversation } from "@/lib/data/messaging";

export interface MessageState {
  error?: string;
}

/**
 * Sends a chat message.
 *
 * Previously this swallowed every failure — an RLS rejection, a bad
 * conversation id or an oversized attachment all produced the same silent
 * no-op, which is what made messages look like they sporadically vanished.
 * Every exit now reports why.
 */
export async function sendMessage(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const conversationId = String(formData.get("conversation_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId) return { error: "No conversation selected." };

  // Attachments live in the private bucket — chat can carry unreleased
  // creatives and contract drafts, so they're signed on read, not public.
  const attachment = await uploadPrivateFile(
    formData.get("attachment"),
    "chat",
  );
  if (attachment.error) return { error: attachment.error };

  // A file on its own is a valid message; an empty message with no file is not.
  if (!body && !attachment.path) {
    return { error: "Type a message or attach a file." };
  }

  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_profile_id: user.id,
    body: body || (attachment.name ? `Sent ${attachment.name}` : "Sent a file"),
    attachment_url: attachment.path ?? null,
    attachment_name: attachment.name ?? null,
    attachment_type: attachment.type ?? null,
  });

  if (insertError) {
    return {
      error: `Your message didn't send: ${insertError.message}. Please try again.`,
    };
  }

  // Notify whichever side of the conversation didn't send this.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("brand_profile_id, partner_profile_id, kind, event_listings(name)")
    .eq("id", conversationId)
    .maybeSingle<{
      brand_profile_id: string;
      partner_profile_id: string;
      kind: string;
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

    const variables = {
      sender_name: sender?.full_name ?? "Someone",
      event_name: conversation.event_listings?.name ?? undefined,
    };

    // Support threads go to the whole admin team, not just the one admin who
    // happens to be on the other end of the row.
    if (conversation.kind === "support" && conversation.brand_profile_id === user.id) {
      await notifyAdmins({
        eventKey: "message.received",
        link: `/dashboard/messages?c=${conversationId}`,
        variables,
      });
    } else {
      await notify({
        eventKey: "message.received",
        recipientProfileId: recipient,
        link: `/dashboard/messages?c=${conversationId}`,
        variables,
      });
    }
  }

  revalidatePath("/dashboard/messages");
  return {};
}

/** Opens (or reuses) the user's thread with the Live·En·Synergy team. */
export async function startSupportThread() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const conversationId = await getOrCreateSupportConversation({
    userProfileId: user.id,
  });

  if (!conversationId) redirect("/contact");

  revalidatePath("/dashboard/messages");
  redirect(`/dashboard/messages?c=${conversationId}&tab=support`);
}
