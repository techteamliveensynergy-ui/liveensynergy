import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Stripe credentials entered from the admin panel (docs/payments-email-
 * implementation-plan.md §1b; migrations 0050 + 0052).
 *
 * How keys stay non-leakable:
 *  - Stored in Supabase Vault (0052), which encrypts each secret with a key
 *    Supabase manages outside the database — dumps and backups hold only
 *    ciphertext, and there is nothing to configure.
 *  - Write-only: the admin screen reads masked status through
 *    payment_credentials_status(); plaintext comes back only through
 *    payment_secret_key(), which only the service role (our server) may call.
 *  - Stripe errors are mapped to fixed messages; raw errors and request
 *    headers (which carry the key) are never logged.
 */

export type PaymentMode = "test" | "live";
export const PAYMENT_MODES: PaymentMode[] = ["test", "live"];

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
 * Reads the stored secret key for `mode` out of Supabase Vault. Server-only:
 * used to re-verify now, and by Stripe invoicing later. Goes through the
 * service role because payment_secret_key() refuses every user session.
 */
export async function getStripeSecretKey(mode: PaymentMode): Promise<string | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("payment_secret_key", {
    p_mode: mode,
    p_field: "secret_key",
  });
  if (error || typeof data !== "string" || !data) return null;
  return data;
}

/** The webhook signing secret (`whsec_…`) for `mode`, from Vault. Server-only. */
export async function getStripeWebhookSecret(mode: PaymentMode): Promise<string | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("payment_secret_key", {
    p_mode: mode,
    p_field: "webhook_secret",
  });
  if (error || typeof data !== "string" || !data) return null;
  return data;
}
