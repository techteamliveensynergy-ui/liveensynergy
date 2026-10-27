import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notify, notifyAdmins } from "@/lib/notifications";
import { CODES_REMINDER_LEAD_MS } from "@/lib/codes-deadline";
import { formatDateTime } from "@/lib/format";

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

interface DueRow {
  id: string;
  name: string;
  reference: string;
  artist_profile_id: string;
  codes_due_at: string;
  codes_reminder_sent_at: string | null;
  codes_overdue_alert_sent_at: string | null;
}

/**
 * Discount-code deadline reminders (GitHub #58, migration 0091). Scheduled
 * daily by Supabase pg_cron, like the outbox sweeper (docs/email-setup.md).
 * For every open sponsored event whose codes aren't confirmed:
 *   - two days before the deadline, the artist is reminded once;
 *   - once it has passed, every admin is alerted once.
 * Each send is stamped on the row first, so a re-run or an overlapping run
 * can't send twice.
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "service key not configured" }, { status: 500 });

  const now = Date.now();
  const { data, error } = await supabase
    .from("sponsored_events")
    .select("id, name, reference, artist_profile_id, codes_due_at, codes_reminder_sent_at, codes_overdue_alert_sent_at")
    .is("reward_codes_confirmed_at", null)
    .not("codes_due_at", "is", null)
    .not("artist_profile_id", "is", null)
    .in("status", ["in_progress", "confirmed"])
    .lte("codes_due_at", new Date(now + CODES_REMINDER_LEAD_MS).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let reminded = 0;
  let alerted = 0;
  for (const ev of (data ?? []) as DueRow[]) {
    const due = new Date(ev.codes_due_at).getTime();
    const dueOn = formatDateTime(ev.codes_due_at);

    if (due <= now && !ev.codes_overdue_alert_sent_at) {
      const { data: claimed } = await supabase
        .from("sponsored_events")
        .update({ codes_overdue_alert_sent_at: new Date().toISOString() })
        .eq("id", ev.id)
        .is("codes_overdue_alert_sent_at", null)
        .select("id");
      if (claimed?.length) {
        await notifyAdmins(
          {
            eventKey: "admin.codes_overdue",
            link: `/dashboard/admin/events/sponsored/${ev.id}`,
            variables: { event_name: ev.name, event_reference: ev.reference, due_on: dueOn },
          },
          { client: supabase },
        );
        alerted += 1;
      }
    } else if (due > now && !ev.codes_reminder_sent_at) {
      const { data: claimed } = await supabase
        .from("sponsored_events")
        .update({ codes_reminder_sent_at: new Date().toISOString() })
        .eq("id", ev.id)
        .is("codes_reminder_sent_at", null)
        .select("id");
      if (claimed?.length) {
        await notify(
          {
            eventKey: "sponsorship.codes_due_soon",
            recipientProfileId: ev.artist_profile_id,
            link: `/dashboard/sponsored/${ev.id}#discount-codes`,
            variables: { event_name: ev.name, due_on: dueOn },
          },
          { client: supabase },
        );
        reminded += 1;
      }
    }
  }

  return NextResponse.json({ checked: data?.length ?? 0, reminded, alerted });
}
