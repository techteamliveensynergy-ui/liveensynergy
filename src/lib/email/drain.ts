import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { renderEmailHtml } from "./layout";
import { sendViaResend } from "./resend";

const MAX_ATTEMPTS = 5;

interface ClaimedRow {
  id: string;
  to_email: string;
  cc: string[] | null;
  bcc: string[] | null;
  subject: string | null;
  body: string | null;
  attempts: number;
}

export interface DrainResult {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
  /** Set when nothing was attempted, and why. */
  notRun?: string;
}

const EMPTY: DrainResult = { claimed: 0, sent: 0, failed: 0, retried: 0, skipped: 0 };

/**
 * Sends queued outbox rows. Called two ways: right after a notification is
 * queued (via `after()` in notify(), so mail goes out within seconds) and by
 * the 5-minute cron route as the retry sweeper.
 *
 * Safe to run concurrently — claim_outbox_batch() uses `for update skip
 * locked` — and safe to retry: the row id is the provider Idempotency-Key.
 */
export async function drainOutbox({ limit }: { limit: number }): Promise<DrainResult> {
  const result: DrainResult = { ...EMPTY };

  const supabase = createServiceClient();
  if (!supabase || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return { ...result, notRun: "not configured" };
  }

  // Outside production, never mail real (or invented seed) addresses: either
  // everything goes to one team inbox, or nothing is sent. Decided BEFORE
  // claiming so rows stay queued and no attempts are burned.
  const isProduction = process.env.VERCEL_ENV === "production";
  const redirectTo = process.env.EMAIL_REDIRECT_TO?.trim() || null;
  if (!isProduction && !redirectTo) {
    return { ...result, notRun: "non-production without EMAIL_REDIRECT_TO" };
  }

  const { data, error } = await supabase.rpc("claim_outbox_batch", { p_limit: limit });
  if (error) {
    console.error("[outbox] claim failed", error.message);
    return { ...result, notRun: "claim failed" };
  }
  const rows = (data ?? []) as ClaimedRow[];
  result.claimed = rows.length;
  if (rows.length === 0) return result;

  // One lookup for every address in the batch.
  const addresses = new Set<string>();
  for (const r of rows) {
    addresses.add(r.to_email.toLowerCase());
    for (const a of [...(r.cc ?? []), ...(r.bcc ?? [])]) addresses.add(a.toLowerCase());
  }
  const { data: suppressedRows } = await supabase
    .from("email_suppressions")
    .select("email, reason")
    .in("email", [...addresses]);
  const suppressed = new Map(
    ((suppressedRows ?? []) as { email: string; reason: string }[]).map((s) => [
      s.email,
      s.reason,
    ]),
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const toReason = suppressed.get(row.to_email.toLowerCase());
    if (toReason) {
      await supabase
        .from("email_outbox")
        .update({ status: "skipped", error: `suppressed: ${toReason}` })
        .eq("id", row.id);
      result.skipped++;
      continue;
    }

    const subject = row.subject ?? "(no subject)";
    const text = row.body ?? "";
    const keep = (a: string) => !suppressed.has(a.toLowerCase());

    const outcome = await sendViaResend({
      id: row.id,
      to: redirectTo && !isProduction ? redirectTo : row.to_email,
      cc: redirectTo && !isProduction ? null : (row.cc ?? []).filter(keep),
      bcc: redirectTo && !isProduction ? null : (row.bcc ?? []).filter(keep),
      subject:
        redirectTo && !isProduction ? `[preview → ${row.to_email}] ${subject}` : subject,
      text,
      html: renderEmailHtml({ subject, body: text }),
    });

    if (outcome.ok) {
      await supabase
        .from("email_outbox")
        .update({
          status: "sent",
          provider: "resend",
          provider_message_id: outcome.messageId,
          sent_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", row.id);
      result.sent++;
      continue;
    }

    if (outcome.retryable && row.attempts < MAX_ATTEMPTS) {
      // Exponential backoff: 2, 4, 8, 16 minutes (attempts was bumped by the claim).
      const delayMin = 2 ** row.attempts;
      await supabase
        .from("email_outbox")
        .update({
          status: "queued",
          error: outcome.error,
          next_attempt_at: new Date(Date.now() + delayMin * 60_000).toISOString(),
        })
        .eq("id", row.id);
      result.retried++;

      // Rate-limited: stop hammering the provider. Hand the rest of the batch
      // back untouched (undo the attempt the claim counted) for the next run.
      if (outcome.error.startsWith("resend 429")) {
        for (const rest of rows.slice(i + 1)) {
          await supabase
            .from("email_outbox")
            .update({ status: "queued", attempts: Math.max(rest.attempts - 1, 0) })
            .eq("id", rest.id);
        }
        break;
      }
      continue;
    }

    await supabase
      .from("email_outbox")
      .update({ status: "failed", error: outcome.error })
      .eq("id", row.id);
    result.failed++;
  }

  return result;
}
