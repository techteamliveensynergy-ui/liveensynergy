import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { siteOrigin, verifyUnsubscribeToken } from "@/lib/marketing/unsubscribe-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unsubscribe endpoint.
 *
 * - POST with body "List-Unsubscribe=One-Click" (Gmail / Yahoo button, RFC 8058):
 *   unsubscribe from this brand at once and answer 200 — no page.
 * - POST from our confirm page (scope=brand|all): unsubscribe, then back to the
 *   page with the result.
 * - GET never changes anything (link scanners such as Outlook Safe Links open
 *   every URL): it just shows the confirm page.
 *
 * No session involved — the signed token is the proof — so this runs with the
 * service role, like the other /api machine endpoints.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(`${siteOrigin()}/u/${encodeURIComponent(token)}`, 303);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claims = verifyUnsubscribeToken(token);
  const raw = await request.text().catch(() => "");
  const form = new URLSearchParams(raw);
  const oneClick = form.get("List-Unsubscribe") === "One-Click";

  if (!claims) {
    return oneClick
      ? new NextResponse("invalid link", { status: 400 })
      : NextResponse.redirect(`${siteOrigin()}/u/${encodeURIComponent(token)}`, 303);
  }

  const supabase = createServiceClient();
  if (!supabase) return new NextResponse("not configured", { status: 503 });

  const scope = oneClick ? "brand" : form.get("scope") === "all" ? "all" : "brand";
  const { error } = await supabase.rpc("marketing_unsubscribe", {
    p_profile_id: claims.profileId,
    p_brand_id: claims.brandId,
    p_scope: scope,
    p_source: oneClick ? "one_click" : "link",
  });
  if (error) {
    console.error("[marketing] unsubscribe failed:", error.message);
    return oneClick
      ? new NextResponse("try again later", { status: 500 })
      : NextResponse.redirect(`${siteOrigin()}/u/${encodeURIComponent(token)}?error=1`, 303);
  }
  if (oneClick) return new NextResponse("unsubscribed", { status: 200 });
  return NextResponse.redirect(`${siteOrigin()}/u/${encodeURIComponent(token)}?done=${scope}`, 303);
}
