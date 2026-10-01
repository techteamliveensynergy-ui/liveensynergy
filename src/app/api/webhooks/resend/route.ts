import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifySvix } from "@/lib/email/svix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string };
}

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
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const rawBody = await request.text();
  const valid = verifySvix(
    rawBody,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
  );
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
