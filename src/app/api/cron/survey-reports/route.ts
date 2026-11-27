import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runSurveyReportWorker } from "@/lib/survey-reports/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One AI write-up can take a few minutes.
export const maxDuration = 300;

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
 * Automatic survey reports (0127). Scheduled every 15 minutes by Supabase
 * pg_cron (docs/survey-auto-reports.md): finds surveys that have closed,
 * queues a report for each, and generates the next ready one — anonymised
 * responses.csv + context.json → figures → Campaign Performance Report
 * write-up → saved as a draft for the admins to review.
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "service key not configured" }, { status: 500 });
  const result = await runSurveyReportWorker(service, 280_000);
  return NextResponse.json(result);
}
