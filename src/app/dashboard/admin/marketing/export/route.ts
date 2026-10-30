import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { csvCell, csvDateTime } from "@/lib/csv";
import { isoDay, loadMarketingList } from "@/lib/marketing-list";

/**
 * CSV of the marketing list (GitHub #62), with the page's filters. One row
 * per person. Names, emails, events and consent dates only — no phone or
 * date of birth. Logged through log_admin_action() like every export.
 */
export async function GET(request: NextRequest) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const sp = new URL(request.url).searchParams;
  const filters = {
    brand: sp.get("brand") || null,
    event: sp.get("event") || null,
    from: isoDay(sp.get("from")),
    to: isoDay(sp.get("to")),
  };

  const { people } = await loadMarketingList(supabase, filters);

  const { error: logError } = await supabase.rpc("log_admin_action", {
    p_action: "marketing_list.export",
    p_target_type: "consent_records",
    p_target_id: filters.event ?? filters.brand,
    p_detail: { ...filters, rows: people.length },
  });
  if (logError) console.error("audit log write failed (marketing_list.export)", logError.message);

  const header = [
    "Name",
    "Email",
    "Do not email",
    "Events",
    "Partner brands",
    "Latest consent",
    "Consent given via",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const p of people) {
    const brands = [...new Set(p.events.map((e) => e.brandName).filter(Boolean))];
    lines.push(
      [
        p.name,
        p.email,
        p.suppressed ? `yes (${p.suppressed})` : "no",
        p.events.map((e) => (e.reference ? `${e.name} (${e.reference})` : e.name)).join("; "),
        brands.join("; "),
        csvDateTime(p.latestConsentAt),
        p.latestSource,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const filename = `marketing-list-${new Date().toISOString().slice(0, 10)}.csv`;
  // BOM so Excel opens names with accents correctly.
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
