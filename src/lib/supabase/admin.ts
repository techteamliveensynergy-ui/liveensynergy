import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS and Auth's normal sign-up rules
 * entirely. Server-only, and only for the one operation RLS/anon-key auth
 * genuinely can't do: creating a pre-confirmed account for the survey-to-
 * account flow (src/app/survey/[templateId]/actions.ts's startSurveyAccount,
 * migration 0043). Never import this from a Client Component or reuse it
 * for anything else. Requires SUPABASE_SERVICE_ROLE_KEY in the environment —
 * see the "Supabase client pattern" section of CLAUDE.md.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
