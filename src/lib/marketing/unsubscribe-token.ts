import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Unsubscribe tokens for marketing email (plan: "Unsubscribe and suppression").
 *
 * token = base64url("<profileId>.<brandId>.<campaignId|test>") + "." + base64url(HMAC-SHA256)
 *
 * - No login and no email address in the URL.
 * - No expiry: people unsubscribe from months-old emails, and that must work.
 * - Tampering with any part breaks the signature; a bad token gets a friendly
 *   page and changes nothing.
 *
 * MARKETING_UNSUBSCRIBE_SECRET signs them. Rotating it invalidates every link
 * already sent — don't, unless it has leaked.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UnsubscribeClaims {
  profileId: string;
  brandId: string;
  /** The campaign the email came from, or "test" for a test send. */
  campaignId: string;
}

function secret(): string | null {
  const s = process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim();
  return s && s.length >= 32 ? s : null;
}

/** True when tokens can be made — sending refuses to start without it. */
export function unsubscribeConfigured(): boolean {
  return secret() !== null;
}

const b64url = (b: Buffer) => b.toString("base64url");

export function signUnsubscribeToken(c: UnsubscribeClaims): string {
  const key = secret();
  if (!key) throw new Error("MARKETING_UNSUBSCRIBE_SECRET is not set (32+ characters)");
  if (!UUID.test(c.profileId) || !UUID.test(c.brandId) || !(c.campaignId === "test" || UUID.test(c.campaignId))) {
    throw new Error("bad unsubscribe claims");
  }
  const payload = `${c.profileId.toLowerCase()}.${c.brandId.toLowerCase()}.${c.campaignId.toLowerCase()}`;
  const mac = createHmac("sha256", key).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(mac)}`;
}

/** The claims, or null for anything malformed, tampered with or unsigned. */
export function verifyUnsubscribeToken(token: string | null | undefined): UnsubscribeClaims | null {
  const key = secret();
  if (!key || !token || token.length > 300) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  let payload: string;
  let mac: Buffer;
  try {
    payload = Buffer.from(parts[0], "base64url").toString("utf8");
    mac = Buffer.from(parts[1], "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", key).update(payload).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  const [profileId, brandId, campaignId, extra] = payload.split(".");
  if (extra !== undefined || !UUID.test(profileId ?? "") || !UUID.test(brandId ?? "")) return null;
  if (!(campaignId === "test" || UUID.test(campaignId ?? ""))) return null;
  return { profileId, brandId, campaignId };
}

/** The site address the links point at (the public origin, never a preview URL). */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Footer link → the confirm page (GET shows, never changes anything). */
export function unsubscribePageUrl(token: string): string {
  return `${siteOrigin()}/u/${token}`;
}

/** List-Unsubscribe target → the one-click endpoint (POST only changes data). */
export function oneClickUrl(token: string): string {
  return `${siteOrigin()}/api/marketing/unsubscribe/${token}`;
}
