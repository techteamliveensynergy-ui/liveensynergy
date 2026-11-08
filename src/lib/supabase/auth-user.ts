import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * The signed-in user, from the session's verified token rather than a round
 * trip to the Auth server on every request.
 *
 * `getClaims()` checks the access token's signature locally (Supabase's
 * asymmetric signing keys, fetched once and cached) and refreshes an expired
 * session first — Supabase's own recommendation for middleware and server
 * code. On a project still on the legacy shared secret it asks the Auth server
 * itself, so it is never less safe than `getUser()`. If it errors, we fall
 * back to `getUser()`.
 *
 * QA 9 Nov: sign-in still took 7–10 s for admins and brands. Every page load
 * did two Auth-server calls (middleware + page), each a full network round
 * trip from the app's region to the database's.
 *
 * Only the fields the app reads are filled (id, email, phone, app_metadata,
 * user_metadata); code that needs the full record (identities — Google
 * sign-in) keeps calling `getUser()`.
 */
export async function sessionUser(supabase: SupabaseClient): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const c = data?.claims as
      | {
          sub?: string;
          email?: string;
          phone?: string;
          aud?: string | string[];
          role?: string;
          app_metadata?: Record<string, unknown>;
          user_metadata?: Record<string, unknown>;
          is_anonymous?: boolean;
        }
      | undefined;
    if (!error && c?.sub) {
      return {
        id: c.sub,
        email: c.email,
        phone: c.phone,
        aud: Array.isArray(c.aud) ? (c.aud[0] ?? "authenticated") : (c.aud ?? "authenticated"),
        role: c.role,
        app_metadata: c.app_metadata ?? {},
        user_metadata: c.user_metadata ?? {},
        is_anonymous: c.is_anonymous ?? false,
        created_at: "",
      } as User;
    }
    if (!error) return null; // no session
  } catch {
    // fall through to the Auth server
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
