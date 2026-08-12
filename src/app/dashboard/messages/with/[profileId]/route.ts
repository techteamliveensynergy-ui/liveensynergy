import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateSupportConversation } from "@/lib/data/messaging";

/**
 * Opens the admin's thread with a given user, creating it only if there isn't
 * one yet, and redirects to it.
 *
 * A GET route rather than a server action so the caller can be an ordinary
 * link: a form driving a server action submits over fetch, so `target="_blank"`
 * on it is ignored and the thread would always steal the current tab. Raising
 * a chat from a feedback report or an enquiry shouldn't cost you the page you
 * were reading (10 Aug standup made the same point about the enquiry form).
 *
 * Creating on GET is deliberate and safe here: `getOrCreateSupportConversation`
 * is idempotent — the second visit returns the same conversation rather than a
 * second one — so re-opening the tab, refreshing, or a link prefetch can't
 * produce duplicate threads.
 *
 * Admin-only: this is the console's "get in touch with this user" affordance,
 * and the thread it opens is the user↔team one.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const { profileId } = await params;
  const supabase = await createClient();
  const origin = new URL(request.url).origin;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const url = new URL("/auth/sign-in", origin);
    url.searchParams.set("redirectTo", `/dashboard/messages/with/${profileId}`);
    return NextResponse.redirect(url);
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (me?.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard/messages", origin));
  }

  const subject =
    new URL(request.url).searchParams.get("subject")?.trim() || null;

  const conversationId = await getOrCreateSupportConversation({
    userProfileId: profileId,
    subject,
    adminProfileId: user.id,
  });

  if (!conversationId) {
    return NextResponse.redirect(
      new URL("/dashboard/messages?tab=support&notice=thread-failed", origin),
    );
  }

  return NextResponse.redirect(
    new URL(`/dashboard/messages?c=${conversationId}`, origin),
  );
}
