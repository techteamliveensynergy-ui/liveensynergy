import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifySvix } from "@/lib/email/svix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    /** Resend sends tags back as { name: value } (older payloads: [{ name, value }]). */
    tags?: ResendTags;
  };
}

type ResendTags = Record<string, string> | { name: string; value: string }[];

function tagValue(tags: ResendTags | undefined, name: string): string | null {
  if (!tags) return null;
  if (Array.isArray(tags)) return tags.find((t) => t?.name === name)?.value ?? null;
  return typeof tags[name] === "string" ? tags[name] : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DELIVERY_STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "delayed",
};

/**
 * Resend delivery feedback. Signature-verified (Svix) before anything is
 * parsed or written; never rate-limited by IP — the signature is the gate.
 * Bounces and spam complaints land on the suppression list so we stop
 * mailing those addresses.
 */
export async function POST(request: NextRequest) {
  // One secret per Resend webhook: the account-email one, and optionally the
  // marketing one when marketing runs on a separate Resend account (0116).
  const secrets = [process.env.RESEND_WEBHOOK_SECRET, process.env.MARKETING_RESEND_WEBHOOK_SECRET].filter(
    (v): v is string => !!v,
  );
  if (secrets.length === 0) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const rawBody = await request.text();
  const headers = {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  };
  const valid = secrets.some((secret) => verifySvix(rawBody, headers, secret));
  if (!valid) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const status = event.type ? DELIVERY_STATUS[event.type] : undefined;
  const messageId = event.data?.email_id;
  // Unknown event types (opens, clicks, …) are acknowledged and ignored.
  if (!status || !messageId) return NextResponse.json({ ok: true, ignored: true });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "not configured" }, { status: 503 });

  // Marketing email (tagged campaign_id by the marketing worker): its own
  // send log and its own suppression list — a marketing bounce/complaint
  // never blocks account emails. A test send is tagged "test" and ignored.
  const campaignTag = tagValue(event.data?.tags, "campaign_id");
  if (campaignTag) {
    if (status === "delayed" || !UUID.test(campaignTag)) return NextResponse.json({ ok: true, ignored: true });
    const { data: applied, error } = await supabase.rpc("marketing_apply_event", { p_message_id: messageId, p_type: status });
    if (error) {
      console.error("[resend webhook] marketing event failed:", error.message);
      return NextResponse.json({ error: "retry" }, { status: 500 }); // Svix retries
    }
    if (!applied) {
      // The event beat the worker recording the message id (the batch call
      // returned, but complete_batch hadn't run yet). Keep it; it's applied
      // when the id is recorded.
      const to = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to;
      await supabase.from("marketing_webhook_events").insert({
        provider_message_id: messageId,
        event_type: status,
        campaign_id: campaignTag,
        email: to ? to.toLowerCase() : null,
      });
    }
    return NextResponse.json({ ok: true, marketing: true });
  }

  const { data: row } = await supabase
    .from("email_outbox")
    .update({
      delivery_status: status,
      ...(status === "delivered"
        ? { delivered_at: event.created_at ?? new Date().toISOString() }
        : {}),
    })
    .eq("provider_message_id", messageId)
    .select("to_email")
    .maybeSingle();

  if ((status === "bounced" || status === "complained") && row?.to_email) {
    // Idempotent: a redelivered event is a no-op on the primary key.
    await supabase.from("email_suppressions").upsert(
      {
        email: row.to_email.toLowerCase(),
        reason: status,
        provider_event_id: request.headers.get("svix-id"),
      },
      { onConflict: "email", ignoreDuplicates: true },
    );
  }

  return NextResponse.json({ ok: true });
}
