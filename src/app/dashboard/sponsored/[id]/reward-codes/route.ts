import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { describePattern, describeTierValue, platformLabel } from "@/lib/discount-codes";
import type { RewardCode, RewardCodePoolEntry, SponsoredEventRewardTier } from "@/lib/types";

/**
 * CSV of a sponsorship's discount codes — what the artist loads into their
 * ticketing platform (Eventbrite's bulk CSV upload, etc.), and what the
 * admin/brand read issued-vs-redeemed from.
 *
 * Deliberately carries no participant names or emails: the brand sees
 * anonymised data only (24 Aug standup). Access is RLS: the two parties and
 * admins can read reward_code_pool / reward_codes; anyone else gets an
 * empty event lookup and a 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in first.", { status: 401 });

  const { data: event } = await supabase
    .from("sponsored_events")
    .select("reference")
    .eq("id", id)
    .maybeSingle<{ reference: string }>();

  const [{ data: tierRows }, { data: poolRows }, { data: codeRows }] = await Promise.all([
    supabase.from("sponsored_event_reward_tiers").select("*").eq("sponsored_event_id", id).order("rank"),
    supabase.from("reward_code_pool").select("*").eq("sponsored_event_id", id).order("created_at"),
    // No participant column (0060): this file is for loading codes into a
    // ticketing platform, not for knowing who holds which.
    supabase.from("sponsored_event_party_codes").select("*").eq("sponsored_event_id", id),
  ]);
  const tiers = (tierRows ?? []) as SponsoredEventRewardTier[];
  // The tiers read is party-or-admin under RLS — no tiers visible means this
  // caller can't see the event's codes either.
  if (!event || tiers.length === 0) return new NextResponse("Not found.", { status: 404 });

  const pool = (poolRows ?? []) as RewardCodePoolEntry[];
  const codes = (codeRows ?? []) as RewardCode[];
  const codeById = new Map(codes.map((c) => [c.id, c]));

  const header = [
    "tier",
    "pattern",
    "value",
    "redeem_on",
    "code",
    "identification_number",
    "source",
    "status",
    "issued_at",
    "redeemed_at",
    "valid_until",
  ];
  const lines: string[][] = [];
  for (const t of tiers) {
    const base = [t.label, describePattern(t), describeTierValue(t), platformLabel(t.redemption_platform) ?? ""];
    if (t.distribution_model === "shared") {
      const mine = codes.filter((c) => c.tier_id === t.id && c.status !== "void");
      const redeemed = mine.filter((c) => c.status === "redeemed").length;
      lines.push([
        ...base,
        t.shared_code ?? "",
        "",
        "shared",
        `issued to ${mine.length}${t.participant_cap != null ? ` of ${t.participant_cap}` : ""}; ${redeemed} redeemed`,
        "",
        "",
        t.valid_until ?? "",
      ]);
      continue;
    }
    for (const p of pool.filter((x) => x.tier_id === t.id)) {
      const issued = p.assigned_code_id ? codeById.get(p.assigned_code_id) : undefined;
      lines.push([
        ...base,
        p.code,
        p.external_ref ?? "",
        p.source,
        issued ? issued.status : p.assigned_at ? "issuing" : "available",
        issued?.issued_at ?? "",
        issued?.redeemed_at ?? "",
        t.valid_until ?? "",
      ]);
    }
  }

  const csv = [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.reference}-discount-codes.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** RFC 4180 quoting, plus a leading ' on anything a spreadsheet would run as
 * a formula (CSV injection). */
function csvCell(v: string): string {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
