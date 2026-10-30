import { NextResponse } from "next/server";

/**
 * Deployment self-check (QA 30 Oct, #1: sign-up 500ed on live and preview,
 * and nobody could see why without Vercel log access). Open it in a browser:
 *
 *   https://www.liveensynergy.com/api/health
 *
 * Reports which required settings are present — true/false only, never a
 * value — whether Supabase answers, and which commit is live, so "is it the
 * config, the database or the code?" is one page load. /api/* skips the
 * session middleware, so this answers even when that is what's failing.
 */
export const dynamic = "force-dynamic";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const OPTIONAL = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "SURVEY_IP_SALT",
] as const;

const present = (name: string) => Boolean(process.env[name]?.trim());

async function supabaseStatus(): Promise<{ ok: boolean; detail: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return { ok: false, detail: "not configured" };
  try {
    new URL(url);
  } catch {
    return { ok: false, detail: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL" };
  }
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok
      ? { ok: true, detail: "auth service answered" }
      : { ok: false, detail: `auth service returned ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.name : "unreachable" };
  }
}

export async function GET() {
  const supabase = await supabaseStatus();
  const missing = REQUIRED.filter((n) => !present(n));
  const ok = missing.length === 0 && supabase.ok;
  return NextResponse.json(
    {
      ok,
      missing_required: missing,
      optional: Object.fromEntries(OPTIONAL.map((n) => [n, present(n)])),
      supabase,
      deployment: {
        environment: process.env.VERCEL_ENV ?? "local",
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
