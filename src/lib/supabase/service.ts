import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for machine callers that have no signed-in user: the
 * email outbox drain, the cron route and the provider webhook routes. It
 * bypasses RLS entirely — never import it from a page, a Client Component or
 * an ordinary server action. (The sign-up-only client in ./admin.ts is a
 * separate, deliberately narrower helper.)
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY isn't set so callers can skip
 * their work quietly — a dev machine without the key behaves as before.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
