import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "@/lib/site-url";

/**
 * Clean one-time links for password reset and "email me a sign-in link"
 * (0122, client 17 Nov). The email carries `/auth/link/<token>` — a short
 * opaque token, no URL parameters. We store the token's sha-256 next to the
 * Supabase one-time token it stands for; the page only SHOWS a button, and
 * pressing it redeems the link, so an email scanner that opens every link
 * can't use it up.
 *
 * Service role only (the table has no policies).
 */

export type AccessLinkType = "recovery" | "magiclink";

/** A little under Supabase's own one-hour one-time-token lifetime. */
const LIFETIME_MS = 55 * 60_000;

const sha = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createAccessLink(input: {
  type: AccessLinkType;
  supabaseTokenHash: string;
  next: string;
  profileId: string;
}): Promise<string | null> {
  const service = createServiceClient();
  if (!service) return null;
  const token = randomBytes(32).toString("base64url");
  const { error } = await service.from("auth_links").insert({
    token_sha256: sha(token),
    link_type: input.type,
    supabase_token_hash: input.supabaseTokenHash,
    next_path: input.next,
    profile_id: input.profileId,
    expires_at: new Date(Date.now() + LIFETIME_MS).toISOString(),
  });
  if (error) {
    console.error("[access-link] could not store link", error.message);
    return null;
  }
  return `${await siteUrl()}/auth/link/${token}`;
}

export interface AccessLinkInfo {
  type: AccessLinkType;
  next: string;
}

/** What the landing page shows — does NOT use the link up. Null when it can't be used. */
export async function peekAccessLink(token: string): Promise<AccessLinkInfo | null> {
  const service = createServiceClient();
  if (!service || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data } = await service
    .from("auth_links")
    .select("link_type, next_path")
    .eq("token_sha256", sha(token))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<{ link_type: AccessLinkType; next_path: string }>();
  return data ? { type: data.link_type, next: data.next_path } : null;
}

/** Uses the link up (once, atomically) and returns what is needed to sign the person in. */
export async function redeemAccessLink(
  token: string,
): Promise<{ type: AccessLinkType; supabaseTokenHash: string; next: string } | null> {
  const service = createServiceClient();
  if (!service || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data } = await service
    .from("auth_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token_sha256", sha(token))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("link_type, supabase_token_hash, next_path")
    .maybeSingle<{ link_type: AccessLinkType; supabase_token_hash: string; next_path: string }>();
  return data ? { type: data.link_type, supabaseTokenHash: data.supabase_token_hash, next: data.next_path } : null;
}
