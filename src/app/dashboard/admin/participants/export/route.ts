import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/age";

/** Wraps a value in quotes and escapes embedded quotes/commas/newlines, per RFC 4180. */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Dates in the export were raw ISO timestamps ("2026-08-03T21:39:12.482+00:00")
 * — unreadable in a spreadsheet and not something Excel parses as a date
 * (3 Aug standup). `DD/MM/YYYY HH:mm` is unambiguous for a UK team and is
 * recognised as a date on import.
 */
function csvDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Date-only columns (an event date carries no time of day). */
function csvDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

interface Row {
  status: string;
  selected: boolean;
  reward_amount_gbp: number | null;
  bank_details_provided: boolean;
  newsletter_opt_in: boolean;
  ticket_proof_url: string | null;
  attendance_verified_at: string | null;
  created_at: string;
  audience_profile_id: string;
  sponsored_event_id: string;
  profiles: { full_name: string | null; email: string | null } | null;
  sponsored_events: { name: string; event_date: string | null } | null;
}

/** CSV export of the participants list, honouring whatever filters are active on the page it was linked from. */
export async function GET(request: NextRequest) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const selected = searchParams.get("selected");
  const eventId = searchParams.get("event");

  let query = supabase
    .from("participations")
    .select(
      "status, selected, reward_amount_gbp, bank_details_provided, newsletter_opt_in, ticket_proof_url, attendance_verified_at, created_at, audience_profile_id, sponsored_event_id, profiles(full_name, email), sponsored_events(name, event_date)",
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (selected === "yes") query = query.eq("selected", true);
  if (eventId) query = query.eq("sponsored_event_id", eventId);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const audienceIds = Array.from(new Set(rows.map((r) => r.audience_profile_id)));
  const { data: memberRows } = audienceIds.length
    ? await supabase
        .from("audience_members")
        .select(
          "profile_id, phone, phone_country_code, date_of_birth, gender, gender_self_describe, country_of_residence",
        )
        .in("profile_id", audienceIds)
    : {
        data: [] as {
          profile_id: string;
          phone: string | null;
          phone_country_code: string;
          date_of_birth: string | null;
          gender: string | null;
          gender_self_describe: string | null;
          country_of_residence: string | null;
        }[],
      };
  const memberByProfile = new Map((memberRows ?? []).map((m) => [m.profile_id, m]));

  const header = [
    "Name",
    "Email",
    "Phone",
    "Age",
    "Gender",
    "Country of residence",
    "Event",
    "Event date",
    "Status",
    "Selected",
    "Reward (GBP)",
    "Payout consent",
    "Newsletter opt-in",
    "Ticket proof",
    "Attendance confirmed at",
    "Registered at",
  ];
  const lines = [header.map(csvCell).join(",")];

  for (const r of rows) {
    const member = memberByProfile.get(r.audience_profile_id);
    lines.push(
      [
        r.profiles?.full_name ?? "",
        r.profiles?.email ?? "",
        member?.phone ? `${member.phone_country_code} ${member.phone}` : "",
        calculateAge(member?.date_of_birth) ?? "",
        // The self-described answer is the meaningful one when it's set.
        member?.gender_self_describe || member?.gender || "",
        member?.country_of_residence ?? "",
        r.sponsored_events?.name ?? "",
        csvDate(r.sponsored_events?.event_date),
        r.status,
        r.selected ? "yes" : "no",
        r.reward_amount_gbp ?? "",
        r.bank_details_provided ? "yes" : "no",
        r.newsletter_opt_in ? "yes" : "no",
        r.ticket_proof_url ? "yes" : "no",
        csvDateTime(r.attendance_verified_at),
        csvDateTime(r.created_at),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = lines.join("\r\n");
  const filename = `participants-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
