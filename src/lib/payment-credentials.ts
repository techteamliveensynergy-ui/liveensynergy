import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Stripe credentials entered from the admin panel (docs/payments-email-
 * implementation-plan.md §1b, migration 0050).
 *
 * How keys stay non-leakable:
 *  - Encrypted here, before they reach the database: AES-256-GCM with a
 *    master key that lives only in Vercel (PAYMENT_CREDS_ENCRYPTION_KEY). The
 *    AAD binds each ciphertext to its mode + field + key version, so a value
 *    can't be swapped into another slot.
 *  - Write-only: nothing in this module returns a key to a caller that could
 *    pass it to a browser. The admin screen reads masked status through
 *    payment_credentials_status(), which never selects ciphertext.
 *  - Stripe errors are mapped to fixed messages; raw errors and request
 *    headers (which carry the key) are never logged.
 */

export type PaymentMode = "test" | "live";
export const PAYMENT_MODES: PaymentMode[] = ["test", "live"];
export const KEY_VERSION = 1;

export function isPaymentMode(v: unknown): v is PaymentMode {
  return v === "test" || v === "live";
}

// --- Validation -------------------------------------------------------------

export type ParsedKey =
  | { ok: true; key: string; kind: "secret" | "restricted"; last4: string }
  | { ok: false; error: string };

/** Checks a pasted Stripe secret/restricted key and that it belongs to `mode`. */
export function parseStripeSecretKey(raw: string | null | undefined, mode: PaymentMode): ParsedKey {
  const key = String(raw ?? "").trim();
  if (!key) return { ok: false, error: "Paste a Stripe secret or restricted key." };

  const m = /^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/.exec(key);
  if (!m) {
    if (/^pk_/.test(key)) {
      return { ok: false, error: "That's a publishable key (pk_…). Paste the secret (sk_…) or restricted (rk_…) key." };
    }
    return { ok: false, error: "That doesn't look like a Stripe secret key — it should start with sk_ or rk_." };
  }
  const keyMode = m[2] as PaymentMode;
  if (keyMode !== mode) {
    return {
      ok: false,
      error: `That's a ${keyMode} key — paste it into the ${keyMode === "live" ? "Live" : "Test"} card instead.`,
    };
  }
  return { ok: true, key, kind: m[1] === "rk" ? "restricted" : "secret", last4: key.slice(-4) };
}

export function parseWebhookSecret(
  raw: string | null | undefined,
): { ok: true; secret: string; last4: string } | { ok: false; error: string } {
  const secret = String(raw ?? "").trim();
  if (!/^whsec_[A-Za-z0-9+/=_-]{16,}$/.test(secret)) {
    return { ok: false, error: "That doesn't look like a webhook signing secret — it should start with whsec_." };
  }
  return { ok: true, secret, last4: secret.slice(-4) };
}

/** "rk_live_••••a1b2" — the only form a key is ever shown in. */
export function maskKey(mode: PaymentMode, kind: string | null, last4: string | null): string {
  const prefix = kind === "restricted" ? "rk" : "sk";
  return `${prefix}_${mode}_••••${last4 ?? "????"}`;
}

// --- Encryption ---------------------------------------------------------------

/** The 32-byte master key, or null when it isn't configured (or is malformed). */
export function masterKey(): Buffer | null {
  const raw = process.env.PAYMENT_CREDS_ENCRYPTION_KEY;
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export const isEncryptionConfigured = () => masterKey() !== null;

export function aadFor(mode: PaymentMode, field: "secret_key" | "webhook_secret", version = KEY_VERSION) {
  return `${mode}|${field}|${version}`;
}

/** AES-256-GCM. Output: `v1:` + base64(iv(12) ‖ tag(16) ‖ ciphertext). */
export function encryptWithKey(plain: string, aad: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

/** Throws on a wrong key, wrong AAD or any tampering (GCM authenticates). */
export function decryptWithKey(blob: string, aad: string, key: Buffer): string {
  if (!blob.startsWith("v1:")) throw new Error("unknown ciphertext version");
  const buf = Buffer.from(blob.slice(3), "base64");
  if (buf.length < 12 + 16 + 1) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function encryptSecret(plain: string, aad: string): string {
  const key = masterKey();
  if (!key) throw new Error("PAYMENT_CREDS_ENCRYPTION_KEY is not configured");
  return encryptWithKey(plain, aad, key);
}

// --- Stripe ---------------------------------------------------------------------

export type VerifyResult =
  | { ok: true; accountId: string | null; accountName: string | null }
  | { ok: false; error: string };

/**
 * Proves a key is real by asking Stripe who it belongs to. Fixed messages only —
 * nothing from the request (which carries the key) is logged or returned.
 */
export async function verifyStripeKey(key: string): Promise<VerifyResult> {
  let res: Response;
  try {
    res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Couldn't reach Stripe to check the key — nothing was saved. Try again shortly." };
  }

  if (res.ok) {
    const account = (await res.json().catch(() => null)) as {
      id?: string;
      settings?: { dashboard?: { display_name?: string | null } };
      business_profile?: { name?: string | null };
    } | null;
    return {
      ok: true,
      accountId: account?.id ?? null,
      accountName:
        account?.settings?.dashboard?.display_name ?? account?.business_profile?.name ?? null,
    };
  }
  if (res.status === 401) {
    return { ok: false, error: "Stripe didn't recognise this key — nothing was saved. Check you copied all of it, and that it hasn't been rolled." };
  }
  if (res.status === 403) {
    // Fail closed. A 403 can come from something between us and Stripe (a
    // proxy or firewall answers 403 too — that's exactly what made a made-up
    // key look "verified" in testing), so it never counts as proof. Only a
    // genuine Stripe error body is explained; nothing is saved either way.
    const body = (await res.json().catch(() => null)) as { error?: { type?: string } } | null;
    if (body?.error?.type) {
      return {
        ok: false,
        error:
          "Stripe recognised this key but it isn't allowed to read account details, so it couldn't be verified — nothing was saved. Give the restricted key read access to account details, or use a key that has it.",
      };
    }
    return { ok: false, error: "Couldn't reach Stripe to check the key — nothing was saved. Try again shortly." };
  }
  if (res.status === 429) {
    return { ok: false, error: "Stripe is rate-limiting requests — nothing was saved. Try again in a minute." };
  }
  return { ok: false, error: "Stripe couldn't check the key right now — nothing was saved. Try again shortly." };
}

/**
 * Decrypts the stored secret key for `mode`. Server-only: used to re-verify
 * now, and by Stripe invoicing later. Reads through the service role because
 * the table has no policies at all — not even admin read.
 */
export async function getStripeSecretKey(mode: PaymentMode): Promise<string | null> {
  const key = masterKey();
  const supabase = createServiceClient();
  if (!key || !supabase) return null;

  const { data } = await supabase
    .from("payment_credentials")
    .select("secret_key_ct, key_version")
    .eq("mode", mode)
    .maybeSingle<{ secret_key_ct: string | null; key_version: number }>();
  if (!data?.secret_key_ct) return null;
  try {
    return decryptWithKey(data.secret_key_ct, aadFor(mode, "secret_key", data.key_version), key);
  } catch {
    // Wrong master key for this environment, or tampered data.
    return null;
  }
}
