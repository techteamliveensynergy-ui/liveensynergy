import { headers } from "next/headers";

/**
 * The origin links in emails point at (confirm, reset password, survey sign-in).
 *
 * `NEXT_PUBLIC_SITE_URL` first — it must be the origin real users browse (L5).
 * If it's missing we use the origin of the request being handled rather than
 * falling back to localhost: before, a missing env var sent every
 * confirmation email to http://localhost:3000 (client feedback, 13 Oct).
 */
export async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  // A localhost value on a deployed site is a config slip that sends every
  // email link (and Google sign-in's return) to the tester's own machine
  // (Testing notes 7 Nov) — ignore it there and use the real origin.
  const deployed = !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development";
  if (configured && !(deployed && /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(configured))) {
    return configured.replace(/\/+$/, "");
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
