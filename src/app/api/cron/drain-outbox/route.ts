import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { drainOutbox } from "@/lib/email/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured → the route is closed, not open.
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Retry sweeper for the email outbox. Scheduled every 5 minutes by Supabase
 * pg_cron + pg_net (the project is on Vercel Hobby, which has no sub-daily
 * cron) — see docs/email-setup.md. Mail is normally sent right after it is
 * queued; this picks up retries and anything a crashed worker left behind.
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await drainOutbox({ limit: 25 });
  return NextResponse.json(result);
}
