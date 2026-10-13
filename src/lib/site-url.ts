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
  if (configured) return configured.replace(/\/+$/, "");

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
