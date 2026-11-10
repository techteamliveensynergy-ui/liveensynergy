import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runMarketingWorker } from "@/lib/marketing/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret → closed, not open
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The marketing send worker. Scheduled every minute by Supabase pg_cron +
 * pg_net (docs/marketing-email-setup.md): starts campaigns whose time has
 * come, sends batches, resumes anything a crashed run left behind. Admin
 * "Send now" also kicks it straight away.
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const result = await runMarketingWorker(supabase, 45_000);
  return NextResponse.json(result);
}
