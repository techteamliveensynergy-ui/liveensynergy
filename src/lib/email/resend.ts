import "server-only";

export interface SendEmailInput {
  /** The outbox row id — sent as the Idempotency-Key so a retry never double-sends. */
  id: string;
  to: string;
  cc?: string[] | null;
  bcc?: string[] | null;
  subject: string;
  text: string;
  html: string;
}

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; retryable: boolean; error: string };

/**
 * Sends one email through Resend's REST API. Plain fetch (no SDK) so the
 * Idempotency-Key header is under our control: Resend dedupes on it for 24h,
 * which is what makes "worker died after the send, before the DB write → the
 * row is retried" safe.
 *
 * Never logs request headers (they carry the API key) and clips error text.
 */
export async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, retryable: true, error: "email provider not configured" };
  }

  const replyTo = process.env.EMAIL_REPLY_TO;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.id,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        ...(input.cc?.length ? { cc: input.cc } : {}),
        ...(input.bcc?.length ? { bcc: input.bcc } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { id?: string } | null;
      if (json?.id) return { ok: true, messageId: json.id };
      return { ok: false, retryable: true, error: "provider returned no message id" };
    }

    const detail = (await res.text().catch(() => "")).slice(0, 500);
    // 429 and 5xx are transient. 409 means the idempotency key is mid-flight
    // (a concurrent attempt) — also worth retrying later. Everything else
    // (400/401/403/422: bad address, unverified domain, bad key) won't fix
    // itself, so don't burn retries on it.
    const retryable = res.status === 429 || res.status === 409 || res.status >= 500;
    return { ok: false, retryable, error: `resend ${res.status}: ${detail}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    return { ok: false, retryable: true, error: `resend request failed: ${msg}`.slice(0, 500) };
  }
}
