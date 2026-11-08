import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inAppDestination } from "@/lib/notification-links";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opening an in-app notification: marks it read, then takes the person to the
 * page it is about (its stored link, or — for an older row with none — the page
 * for that kind of notification). One click does both, so the unread dot clears
 * as they go rather than staying until "Mark all read".
 *
 * Only the recipient's own row is read or changed (and RLS backs that up). The
 * destination is always a same-site path (inAppDestination → safeAppPath).
 * Linked to with a plain <a>, never next/link, so a prefetch can't mark a
 * notification read before it is clicked.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const back = new URL("/dashboard/notifications", request.url);
  if (!UUID_RE.test(id)) return NextResponse.redirect(back, 303);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/sign-in?redirectTo=/dashboard/notifications", request.url), 303);
  }

  const { data: n } = await supabase
    .from("notifications")
    .select("id, link, event_key, read_at")
    .eq("id", id)
    .eq("recipient_profile_id", user.id)
    .maybeSingle<{ id: string; link: string | null; event_key: string | null; read_at: string | null }>();
  if (!n) return NextResponse.redirect(back, 303);

  if (!n.read_at) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", n.id)
      .eq("recipient_profile_id", user.id);
  }

  return NextResponse.redirect(new URL(inAppDestination(n.link, n.event_key), request.url), 303);
}
