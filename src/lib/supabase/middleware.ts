import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Before an account has confirmed its email (0074) it can finish onboarding
 * and answer a survey, and it sees /dashboard — covered by the "confirm your
 * email" overlay (dashboard/layout.tsx). Every other dashboard page, and QR
 * check-in, waits for the link (client, 16 Oct: "he cannot click anything,
 * he has to verify his account first, but we let him complete onboarding").
 */
function needsVerifiedEmail(pathname: string) {
  if (pathname === "/dashboard") return false;
  return pathname.startsWith("/dashboard/") || pathname.startsWith("/attend/");
}

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
  // An email link whose redirect Supabase didn't recognise falls back to the
  // bare Site URL, i.e. "/?code=…" — hand it to the callback that knows what
  // to do with it rather than showing the home page with the person still
  // signed out (13 Oct: confirmation links "went nowhere").
  if (request.nextUrl.pathname === "/") {
    const params = request.nextUrl.searchParams;
    if (params.has("code") || params.has("token_hash") || params.has("error_code")) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/callback";
      if (!params.has("next")) url.searchParams.set("next", "/onboarding");
      return NextResponse.redirect(url);
    }
  }

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
    // email_verified_at arrives with 0069; until the column exists the
    // select errors, so fall back rather than lose the blocking check below.
    let { data: profile } = await supabase
      .from("profiles")
      .select("is_active, suspended_until, role, email_verified_at")
      .eq("id", user.id)
      .maybeSingle<{
        is_active: boolean;
        suspended_until: string | null;
        role: string;
        email_verified_at?: string | null;
      }>();
    if (!profile) {
      ({ data: profile } = await supabase
        .from("profiles")
        .select("is_active, suspended_until, role")
        .eq("id", user.id)
        .maybeSingle());
    }

    // An automatic (no-show) suspension lifts itself once it has run its
    // course, rather than staying blocked forever like a manual block does.
    // Done by lift_expired_suspension() (0061): users can no longer write
    // their own is_active, and the function only ever lifts the caller's own
    // expired suspension.
    if (
      profile &&
      profile.is_active === false &&
      profile.suspended_until &&
      new Date(profile.suspended_until) <= new Date()
    ) {
      const { data: active } = await supabase.rpc("lift_expired_suspension");
      if (active === true) profile.is_active = true;
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

    // Email not yet proved (0069/0074): everything past the dashboard home
    // waits for the link in our welcome email (client, 13 Oct: all
    // communication is by email, so the address must be real first).
    if (
      profile &&
      profile.role !== "admin" &&
      "email_verified_at" in profile &&
      !profile.email_verified_at &&
      needsVerifiedEmail(pathname)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "?verify=required";
      return NextResponse.redirect(url);
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
