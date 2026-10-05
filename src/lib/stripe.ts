import "server-only";

/**
 * Minimal Stripe REST client (no SDK — same choice as the Resend sender: one
 * dependency fewer, and full control of idempotency keys). Server-only; the
 * secret key comes from Supabase Vault via getStripeSecretKey().
 *
 * Errors carry Stripe's own message (it never contains the key) so an admin
 * sees *why* — "No such customer", "Invalid tax rate" — but nothing else from
 * the request is logged.
 */

export class StripeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Stripe wants form encoding with bracketed nesting: a[b][0]=c. */
export function encodeForm(
  params: Record<string, unknown>,
  prefix = "",
  out: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") {
          encodeForm(item as Record<string, unknown>, `${key}[${i}]`, out);
        } else {
          out.append(`${key}[${i}]`, String(item));
        }
      });
    } else if (typeof v === "object") {
      encodeForm(v as Record<string, unknown>, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

export async function stripeRequest<T>(
  secretKey: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const body = params && method !== "GET" ? encodeForm(params).toString() : undefined;
  const query = params && method === "GET" ? `?${encodeForm(params).toString()}` : "";

  let res: Response;
  try {
    res = await fetch(`https://api.stripe.com${path}${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new StripeApiError("Couldn't reach Stripe. Try again shortly.", 0);
  }

  const json = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string; code?: string } })
    | null;
  if (!res.ok) {
    const message = json?.error?.message ?? `Stripe returned ${res.status}.`;
    throw new StripeApiError(message.slice(0, 300), res.status, json?.error?.code);
  }
  return json as T;
}

// --- Shapes we use (only the fields we read) --------------------------------

export interface StripeInvoice {
  id: string;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  number: string | null;
  currency: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  due_date: number | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  livemode: boolean;
  metadata: Record<string, string>;
}
