import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** How often a signed-in user's `last_seen_at` is stamped. */
const SEEN_THROTTLE_SECONDS = 5 * 60;
const SEEN_COOKIE = "les-seen";

/**
 * Refreshes the Supabase auth session on every request, enforces account
 * blocking platform-wide, and keeps `last_seen_at` roughly current.
 *
 * Blocking is enforced *here* rather than per-page so there is exactly one
 * gate: a blocked account is signed out on its next request no matter where
 * it is in the app, and cannot reach anything authenticated again.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const protectedPrefixes = ["/dashboard", "/onboarding"];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  // Redirect unauthenticated users away from protected routes.
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active, suspended_until")
      .eq("id", user.id)
      .maybeSingle();

    // An automatic (no-show) suspension lifts itself once it has run its
    // course, rather than staying blocked forever like a manual block does.
    if (
      profile &&
      profile.is_active === false &&
      profile.suspended_until &&
      new Date(profile.suspended_until) <= new Date()
    ) {
      await supabase
        .from("profiles")
        .update({
          is_active: true,
          blocked_at: null,
          blocked_reason: null,
          suspended_until: null,
        })
        .eq("id", user.id);
      profile.is_active = true;
    }

    // Blocked: tear down the session and send them to the explainer page.
    // `/auth/blocked` itself is exempt so the page can actually render.
    if (profile && profile.is_active === false) {
      if (!pathname.startsWith("/auth/blocked")) {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/auth/blocked";
        url.search = "";
        const redirectResponse = NextResponse.redirect(url);
        // Carry over the cleared auth cookies from signOut.
        supabaseResponse.cookies.getAll().forEach((c) => {
          redirectResponse.cookies.set(c);
        });
        return redirectResponse;
      }
      return supabaseResponse;
    }

    // Stamp activity at most once per throttle window (cookie-gated so this
    // costs one DB write per 5 minutes, not one per request).
    if (!request.cookies.get(SEEN_COOKIE)) {
      await supabase.rpc("touch_last_seen");
      supabaseResponse.cookies.set(SEEN_COOKIE, "1", {
        maxAge: SEEN_THROTTLE_SECONDS,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    // Redirect signed-in users away from the sign-in / sign-up pages.
    if (
      pathname.startsWith("/auth/sign-in") ||
      pathname.startsWith("/auth/sign-up")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
