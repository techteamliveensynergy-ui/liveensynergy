import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { campaignProblems, fillMergeFields, DEFAULT_ACCENT, DEFAULT_FONT_STACK, parseContent, type BrandTokens } from "./blocks";
import { renderCampaignEmail } from "./render";
import { oneClickUrl, signUnsubscribeToken, unsubscribeConfigured, unsubscribePageUrl } from "./unsubscribe-token";

/**
 * The marketing send worker (plan: "Send pipeline").
 *
 * Runs from /api/cron/marketing-send (every minute or five, Supabase pg_cron)
 * and straight after an admin presses "Send now". Each run:
 *   1. starts scheduled campaigns whose time has come (snapshot the audience);
 *   2. for each campaign that is sending, claims batches of up to 100, renders
 *      each person's email with their own unsubscribe link, and sends the batch
 *      through Resend's batch API with the batch key as the Idempotency-Key;
 *   3. records message ids (or schedules a retry with backoff), checks the
 *      campaign's complaint/bounce health, and marks it sent when nothing is left.
 *
 * A worker that dies mid-batch is safe: the next run re-claims the same batch
 * with the same key and Resend returns the original result instead of sending
 * again (within its 24-hour idempotency window).
 *
 * Outside production nothing reaches real people: each email goes to
 * EMAIL_REDIRECT_TO (subject marked), at most PREVIEW_CAP per campaign, and the
 * rest are skipped; with no redirect address the worker doesn't send at all.
 */

const BATCH_SIZE = 100;
const PREVIEW_CAP = 10;
const RESEND = "https://api.resend.com";

export interface MarketingConfig {
  apiKey: string;
  fromAddress: string;
}

/** Sending config, or the reason it's missing. */
export function marketingConfig(): { config?: MarketingConfig; missing?: string } {
  const apiKey = (process.env.MARKETING_RESEND_API_KEY || process.env.RESEND_API_KEY || "").trim();
  const fromAddress = (process.env.MARKETING_EMAIL_FROM || "").trim();
  if (!fromAddress || !/^[^\s@<>]+@[^\s@<>]+$/.test(fromAddress)) {
    return { missing: "MARKETING_EMAIL_FROM is not set (e.g. offers@mail.yourdomain.com on the verified marketing subdomain)." };
  }
  if (!apiKey) return { missing: "No Resend API key (MARKETING_RESEND_API_KEY, or RESEND_API_KEY)." };
  if (!unsubscribeConfigured()) return { missing: "MARKETING_UNSUBSCRIBE_SECRET is not set (32+ random characters)." };
  return { config: { apiKey, fromAddress } };
}

const isProduction = () => process.env.VERCEL_ENV === "production";
const redirectTo = () => process.env.EMAIL_REDIRECT_TO?.trim() || null;

/** "Brand Name" <offers@mail.x> — quotes and angle brackets stripped from the name. */
function fromHeader(brandName: string, address: string): string {
  const name = brandName.replace(/["<>\r\n]/g, "").trim().slice(0, 70) || "Live·En·Synergy partner";
  return `"${name}" <${address}>`;
}

/** The brand's tokens: its marketing settings, falling back to its profile. */
export async function loadBrandTokens(supabase: SupabaseClient, brandId: string): Promise<BrandTokens | null> {
  const [{ data: brand }, { data: s }] = await Promise.all([
    supabase
      .from("brands")
      .select("brand_name, logo_url, company_address, manager_email, billing_email")
      .eq("id", brandId)
      .maybeSingle<{ brand_name: string; logo_url: string | null; company_address: string | null; manager_email: string | null; billing_email: string | null }>(),
    supabase.from("brand_marketing_settings").select("*").eq("brand_id", brandId).maybeSingle<{
      logo_url: string | null;
      accent_color: string | null;
      background: "light" | "dark";
      font_stack: string | null;
      footer_legal: string | null;
      physical_address: string | null;
      reply_to: string | null;
    }>(),
  ]);
  if (!brand) return null;
  return {
    brand_name: brand.brand_name,
    logo_url: s?.logo_url || brand.logo_url || null,
    accent_color: s?.accent_color || DEFAULT_ACCENT,
    background: s?.background ?? "light",
    font_stack: s?.font_stack || DEFAULT_FONT_STACK,
    footer_legal: s?.footer_legal || null,
    physical_address: s?.physical_address || brand.company_address || null,
    reply_to: s?.reply_to || brand.manager_email || brand.billing_email || null,
  };
}

interface OutEmail {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
}

type SendResult = { ok: true; ids: string[] } | { ok: false; retryable: boolean; status: number; error: string };

async function resendPost(path: string, body: unknown, apiKey: string, idempotencyKey: string): Promise<SendResult> {
  try {
    const res = await fetch(`${RESEND}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { id?: string; data?: { id: string }[] } | null;
      const ids = json?.data ? json.data.map((d) => d.id) : json?.id ? [json.id] : [];
      return { ok: true, ids };
    }
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    const retryable = res.status === 429 || res.status === 409 || res.status >= 500;
    return { ok: false, retryable, status: res.status, error: `resend ${res.status}: ${detail}` };
  } catch (e) {
    return { ok: false, retryable: true, status: 0, error: `resend request failed: ${e instanceof Error ? e.message : "network"}` };
  }
}

function buildEmail(
  c: { id: string; brand_id: string; subject: string; preview_text: string; content: unknown },
  tokens: BrandTokens,
  recipient: { profile_id: string; email: string; first_name: string | null },
  cfg: MarketingConfig,
  opts: { campaignIdForToken: string; subjectPrefix?: string; toOverride?: string | null },
): OutEmail {
  const token = signUnsubscribeToken({ profileId: recipient.profile_id, brandId: c.brand_id, campaignId: opts.campaignIdForToken });
  const { html, text } = renderCampaignEmail({
    subject: c.subject,
    previewText: c.preview_text,
    content: parseContent(c.content),
    tokens,
    firstName: recipient.first_name,
    unsubscribeUrl: unsubscribePageUrl(token),
  });
  return {
    from: fromHeader(tokens.brand_name, cfg.fromAddress),
    to: [opts.toOverride || recipient.email],
    ...(tokens.reply_to ? { reply_to: tokens.reply_to } : {}),
    subject: `${opts.subjectPrefix ?? ""}${fillMergeFields(c.subject, { first_name: recipient.first_name })}`,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl(token)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [
      { name: "brand_id", value: c.brand_id },
      { name: "campaign_id", value: opts.campaignIdForToken === "test" ? "test" : c.id },
    ],
  };
}

export interface WorkerResult {
  started: number;
  sent: number;
  failed: number;
  campaigns: number;
  notRun?: string;
}

/** One pass of the worker, until the deadline. Never throws. */
export async function runMarketingWorker(supabase: SupabaseClient, deadlineMs = 45_000): Promise<WorkerResult> {
  const result: WorkerResult = { started: 0, sent: 0, failed: 0, campaigns: 0 };
  const { config, missing } = marketingConfig();
  if (!config) return { ...result, notRun: missing };
  if (!isProduction() && !redirectTo()) return { ...result, notRun: "non-production without EMAIL_REDIRECT_TO" };
  const stopAt = Date.now() + deadlineMs;

  try {
    // 1. Start what's due.
    const { data: due } = await supabase
      .from("marketing_campaigns")
      .select("id, brand_id, subject, content")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());
    for (const d of (due ?? []) as { id: string; brand_id: string; subject: string; content: unknown }[]) {
      // Re-check at the last moment: brand settings (e.g. the footer address
      // the law requires) can have changed since it was scheduled.
      const tokens = await loadBrandTokens(supabase, d.brand_id);
      const problems = tokens
        ? campaignProblems({ subject: d.subject, content: parseContent(d.content) }, tokens)
        : ["The brand no longer exists."];
      if (problems.length) {
        await supabase
          .from("marketing_campaigns")
          .update({ status: "paused", paused_reason: `Not sent: ${problems[0]}` })
          .eq("id", d.id)
          .eq("status", "scheduled");
        continue;
      }
      const { data } = await supabase.rpc("marketing_start_campaign", { p_campaign_id: d.id });
      if ((data as { started?: boolean } | null)?.started) result.started += 1;
    }

    // 2. Send.
    const { data: sending } = await supabase
      .from("marketing_campaigns")
      .select("id, brand_id, subject, preview_text, content")
      .eq("status", "sending")
      .order("started_at");
    for (const c of (sending ?? []) as { id: string; brand_id: string; subject: string; preview_text: string; content: unknown }[]) {
      if (Date.now() > stopAt) break;
      result.campaigns += 1;
      const tokens = await loadBrandTokens(supabase, c.brand_id);
      if (!tokens) continue;

      while (Date.now() < stopAt) {
        const { data: batch, error } = await supabase.rpc("marketing_claim_batch", { p_campaign_id: c.id, p_size: BATCH_SIZE });
        if (error) {
          console.error("[marketing] claim failed:", error.message);
          break;
        }
        const rows = (batch ?? []) as { send_id: string; profile_id: string; email: string; first_name: string | null; batch_key: string }[];
        if (rows.length === 0) {
          const { count } = await supabase
            .from("marketing_sends")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", c.id)
            .eq("status", "queued");
          if (!count) {
            await supabase.rpc("marketing_finish_if_done", { p_campaign_id: c.id });
            break;
          }
          continue; // the page was all skips; take the next one
        }
        const batchKey = rows[0].batch_key;

        // Preview safety: redirect to one inbox, a handful per campaign.
        let toSend = rows;
        if (!isProduction()) {
          const { count: already } = await supabase
            .from("marketing_sends")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", c.id)
            .in("status", ["sent", "delivered", "bounced", "complained"]);
          const room = Math.max(0, PREVIEW_CAP - (already ?? 0));
          const over = rows.slice(room);
          toSend = rows.slice(0, room);
          if (over.length) {
            await supabase
              .from("marketing_sends")
              .update({ status: "skipped", skip_reason: "preview cap (not production)", updated_at: new Date().toISOString() })
              .in("id", over.map((r) => r.send_id));
          }
          if (toSend.length === 0) continue;
        }

        const emails = toSend.map((r) =>
          buildEmail(c, tokens, r, config, {
            campaignIdForToken: c.id,
            subjectPrefix: isProduction() ? "" : `[preview → ${r.email}] `,
            toOverride: isProduction() ? null : redirectTo(),
          }),
        );

        const res = await resendPost("/emails/batch", emails, config.apiKey, batchKey);
        if (res.ok && res.ids.length === toSend.length) {
          await supabase.rpc("marketing_complete_batch", {
            p_batch_key: batchKey,
            p_results: toSend.map((r, i) => ({ send_id: r.send_id, message_id: res.ids[i] })),
          });
          result.sent += toSend.length;
        } else if (!res.ok && !res.retryable && toSend.length > 1) {
          // The batch API refuses the whole batch for one bad address: send
          // this batch one by one so the others still go out.
          const results: ({ send_id: string; message_id: string } | { send_id: string; error: string })[] = [];
          for (let i = 0; i < toSend.length; i++) {
            const one = await resendPost("/emails", emails[i], config.apiKey, `${batchKey}:${toSend[i].send_id}`);
            if (one.ok && one.ids[0]) {
              results.push({ send_id: toSend[i].send_id, message_id: one.ids[0] });
              result.sent += 1;
            } else {
              results.push({ send_id: toSend[i].send_id, error: one.ok ? "no message id" : one.error });
              result.failed += 1;
            }
            await new Promise((r) => setTimeout(r, 110)); // stay under 10 requests/second
          }
          await supabase.rpc("marketing_complete_batch", { p_batch_key: batchKey, p_results: results });
        } else {
          const err = res.ok ? "provider returned the wrong number of ids" : res.error;
          await supabase.rpc("marketing_fail_batch", { p_batch_key: batchKey, p_error: err, p_retryable: res.ok || res.retryable });
          if (!res.ok && !res.retryable) result.failed += toSend.length;
          break; // let the backoff run; next pass picks it up
        }
        await supabase.rpc("marketing_check_health", { p_campaign_id: c.id });
        await new Promise((r) => setTimeout(r, 110));
      }
    }
  } catch (e) {
    console.error("[marketing] worker error:", e instanceof Error ? e.message : e);
  }
  return result;
}

/**
 * A test send to an admin's own inbox(es): the real email, with a working
 * unsubscribe link and headers for the admin's own account ("test" campaign).
 */
export async function sendTestEmail(
  supabase: SupabaseClient,
  campaign: { id: string; brand_id: string; subject: string; preview_text: string; content: unknown },
  admin: { profileId: string; firstName: string | null },
  toAddresses: string[],
): Promise<{ ok: boolean; error?: string; sentTo?: string[] }> {
  const { config, missing } = marketingConfig();
  if (!config) return { ok: false, error: missing };
  const tokens = await loadBrandTokens(supabase, campaign.brand_id);
  if (!tokens) return { ok: false, error: "Brand not found." };
  const targets = !isProduction() && redirectTo() ? [redirectTo()!] : toAddresses;
  if (!isProduction() && !redirectTo()) return { ok: false, error: "Not production and EMAIL_REDIRECT_TO is not set, so nothing is sent." };
  const sentTo: string[] = [];
  for (const to of targets.slice(0, 5)) {
    const email = buildEmail(
      campaign,
      tokens,
      { profile_id: admin.profileId, email: to, first_name: admin.firstName },
      config,
      { campaignIdForToken: "test", subjectPrefix: "[TEST] " },
    );
    const res = await resendPost("/emails", email, config.apiKey, `test:${campaign.id}:${to}:${Date.now()}`);
    if (!res.ok) return { ok: false, error: res.error, sentTo };
    sentTo.push(to);
  }
  return { ok: true, sentTo };
}
