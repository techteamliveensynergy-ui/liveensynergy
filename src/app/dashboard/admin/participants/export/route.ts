import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/age";
import { csvCell, csvDate, csvDateTime } from "@/lib/csv";

interface Row {
  status: string;
  selected: boolean;
  id: string;
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
      "id, status, selected, newsletter_opt_in, ticket_proof_url, attendance_verified_at, created_at, audience_profile_id, sponsored_event_id, profiles(full_name, email), sponsored_events(name, event_date)",
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (selected === "yes") query = query.eq("selected", true);
  if (eventId) query = query.eq("sponsored_event_id", eventId);

  const { error: logError } = await supabase.rpc("log_admin_action", {
    p_action: "participants.export",
    p_target_type: "participations",
    p_target_id: eventId,
    p_detail: { status, selected, event: eventId },
  });
  if (logError) console.error("audit log write failed (participants.export)", logError.message);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  // Code status per participation (issued / redeemed) — the reward is a
  // discount code now, not a £ amount with payout consent.
  // (All live codes rather than `.in(ids)`: a large export's id list would
  // overflow the request URL.)
  const { data: codeRows } = await supabase
    .from("reward_codes")
    .select("participation_id, status")
    .neq("status", "void");
  const codeByParticipation = new Map(
    ((codeRows ?? []) as { participation_id: string; status: string }[]).map((c) => [c.participation_id, c.status]),
  );

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
    "Discount code",
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
        codeByParticipation.get(r.id) ?? "",
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
