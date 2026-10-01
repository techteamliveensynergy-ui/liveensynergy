"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/profile";
import { notifyAdmins } from "@/lib/notifications";
import { callerIpHash } from "@/lib/survey-abuse";
import {
  aadFor,
  encryptSecret,
  getStripeSecretKey,
  isEncryptionConfigured,
  isPaymentMode,
  parseStripeSecretKey,
  parseWebhookSecret,
  verifyStripeKey,
  type PaymentMode,
} from "@/lib/payment-credentials";

/**
 * Stripe credentials screen. Every action:
 *   requireAdmin → rate limit → validate → (verify with Stripe) → encrypt →
 *   admin-checked DB function (writes the audit row in the same transaction)
 *   → tell every admin → revalidate.
 *
 * The returned state is ONLY a fixed message. Nothing an admin typed is ever
 * echoed back, logged, or returned — React resets the form after submit.
 */
export interface PaymentSettingsState {
  error?: string;
  message?: string;
}

const PAGE = "/dashboard/admin/settings/payments";
const NOT_CONFIGURED =
  "Encryption isn't configured on this deployment (PAYMENT_CREDS_ENCRYPTION_KEY), so keys can't be saved.";
const RATE_LIMITED = "Too many changes in a short time — wait a few minutes and try again.";

const modeLabel = (m: PaymentMode) => (m === "live" ? "Live" : "Test");

async function adminContext(throttleAction: string) {
  const { supabase, userId } = await requireAdmin();
  // 5 per admin per 10 minutes, keyed on the caller's own id in the database.
  const { data: allowed } = await supabase.rpc("rate_limit_hit", {
    p_action: throttleAction,
    p_window_seconds: 600,
    p_max: 5,
  });
  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle<{ full_name: string | null; email: string | null }>();
  return {
    supabase,
    allowed: allowed === true,
    adminName: me?.full_name || me?.email || "An admin",
    ipHash: await callerIpHash(),
  };
}

function readMode(formData: FormData): PaymentMode | null {
  const m = String(formData.get("mode") ?? "");
  return isPaymentMode(m) ? m : null;
}

export async function saveSecretKey(
  _prev: PaymentSettingsState,
  formData: FormData,
): Promise<PaymentSettingsState> {
  const mode = readMode(formData);
  if (!mode) return { error: "Unknown mode." };
  if (!isEncryptionConfigured()) return { error: NOT_CONFIGURED };

  const parsed = parseStripeSecretKey(formData.get("secret_key") as string | null, mode);
  if (!parsed.ok) return { error: parsed.error };

  const ctx = await adminContext("payment_credentials");
  if (!ctx.allowed) return { error: RATE_LIMITED };

  // Prove the key is real before anything is stored.
  const verified = await verifyStripeKey(parsed.key);
  if (!verified.ok) return { error: verified.error };

  const { error } = await ctx.supabase.rpc("save_payment_secret_key", {
    p_mode: mode,
    p_ciphertext: encryptSecret(parsed.key, aadFor(mode, "secret_key")),
    p_last4: parsed.last4,
    p_kind: parsed.kind,
    p_account_id: verified.accountId,
    p_account_name: verified.accountName,
    p_ip_hash: ctx.ipHash,
  });
  if (error) {
    console.error("[payment-settings] save secret key failed", error.code);
    return { error: "Couldn't save the key — nothing was changed. Try again." };
  }

  await notifyAdmins({
    eventKey: "admin.payment_credentials_changed",
    link: PAGE,
    variables: { admin_name: ctx.adminName, mode: modeLabel(mode), what: "secret key" },
  });
  revalidatePath(PAGE);
  const account = verified.accountName ?? verified.accountId;
  return {
    message: `${modeLabel(mode)} key saved and verified${account ? ` — Stripe account ${account}` : ""}.`,
  };
}

export async function saveWebhookSecret(
  _prev: PaymentSettingsState,
  formData: FormData,
): Promise<PaymentSettingsState> {
  const mode = readMode(formData);
  if (!mode) return { error: "Unknown mode." };
  if (!isEncryptionConfigured()) return { error: NOT_CONFIGURED };

  const parsed = parseWebhookSecret(formData.get("webhook_secret") as string | null);
  if (!parsed.ok) return { error: parsed.error };

  const ctx = await adminContext("payment_credentials");
  if (!ctx.allowed) return { error: RATE_LIMITED };

  const { error } = await ctx.supabase.rpc("save_payment_webhook_secret", {
    p_mode: mode,
    p_ciphertext: encryptSecret(parsed.secret, aadFor(mode, "webhook_secret")),
    p_last4: parsed.last4,
    p_ip_hash: ctx.ipHash,
  });
  if (error) {
    console.error("[payment-settings] save webhook secret failed", error.code);
    return { error: "Couldn't save the webhook secret — nothing was changed. Try again." };
  }

  await notifyAdmins({
    eventKey: "admin.payment_credentials_changed",
    link: PAGE,
    variables: { admin_name: ctx.adminName, mode: modeLabel(mode), what: "webhook signing secret" },
  });
  revalidatePath(PAGE);
  return { message: `${modeLabel(mode)} webhook signing secret saved.` };
}

export async function reverifySecretKey(
  _prev: PaymentSettingsState,
  formData: FormData,
): Promise<PaymentSettingsState> {
  const mode = readMode(formData);
  if (!mode) return { error: "Unknown mode." };

  const ctx = await adminContext("payment_credentials");
  if (!ctx.allowed) return { error: RATE_LIMITED };

  const key = await getStripeSecretKey(mode);
  if (!key) {
    return {
      error:
        "No key is saved for this mode, or it can't be decrypted with this deployment's encryption key.",
    };
  }
  const verified = await verifyStripeKey(key);
  if (!verified.ok) return { error: verified.error };

  const { error } = await ctx.supabase.rpc("record_payment_verification", {
    p_mode: mode,
    p_account_id: verified.accountId,
    p_account_name: verified.accountName,
    p_ip_hash: ctx.ipHash,
  });
  if (error) {
    console.error("[payment-settings] record verification failed", error.code);
    return { error: "The key works, but the check couldn't be recorded. Try again." };
  }
  revalidatePath(PAGE);
  return { message: `${modeLabel(mode)} key re-verified with Stripe.` };
}

export async function setPaymentMode(
  _prev: PaymentSettingsState,
  formData: FormData,
): Promise<PaymentSettingsState> {
  const mode = readMode(formData);
  if (!mode) return { error: "Choose Test or Live." };

  // Deliberate friction: type the mode name to confirm.
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== mode.toUpperCase()) {
    return { error: `Type ${mode.toUpperCase()} to confirm.` };
  }

  const ctx = await adminContext("payment_mode");
  if (!ctx.allowed) return { error: RATE_LIMITED };

  // The database refuses Live without a saved, verified live key.
  const { error } = await ctx.supabase.rpc("set_payment_mode", {
    p_mode: mode,
    p_ip_hash: ctx.ipHash,
  });
  if (error) {
    return {
      error: /verify a live secret key/i.test(error.message)
        ? "Save and verify a live secret key before switching to Live."
        : "Couldn't change the mode — nothing was changed. Try again.",
    };
  }

  await notifyAdmins({
    eventKey: "admin.payment_mode_changed",
    link: PAGE,
    variables: { admin_name: ctx.adminName, mode: modeLabel(mode) },
  });
  revalidatePath(PAGE);
  return { message: `Payments are now in ${modeLabel(mode)} mode.` };
}
