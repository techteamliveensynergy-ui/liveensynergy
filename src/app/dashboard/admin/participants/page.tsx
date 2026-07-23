import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Participants · Admin" };

const STATUSES = [
  "registered",
  "ticket_uploaded",
  "attendance_verified",
  "reward_released",
  "rejected",
];

interface Row {
  id: string;
  status: string;
  selected: boolean;
  reward_amount_gbp: number | null;
  bank_details_provided: boolean;
  newsletter_opt_in: boolean;
  created_at: string;
  audience_profile_id: string;
  sponsored_event_id: string;
  profiles: { full_name: string | null; email: string | null } | null;
  sponsored_events: { name: string; event_date: string | null } | null;
}

export default async function AdminParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; selected?: string }>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("participations")
    .select(
      "*, profiles(full_name, email), sponsored_events(name, event_date)",
    )
    .order("created_at", { ascending: false });

  let rows = (data ?? []) as Row[];
  const total = rows.length;

  if (sp.status) rows = rows.filter((r) => r.status === sp.status);
  if (sp.selected === "yes") rows = rows.filter((r) => r.selected);

  const totalRewarded = ((data ?? []) as Row[]).reduce(
    (sum, r) => sum + Number(r.reward_amount_gbp ?? 0),
    0,
  );

  const link = (params: Record<string, string>) => {
    const q = new URLSearchParams(params);
    return `/dashboard/admin/participants${q.toString() ? `?${q}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Participants"
        subtitle={`${total} registrations across every sponsored event · £${totalRewarded.toLocaleString("en-GB")} rewarded to date.`}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href={link({})}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            !sp.status && !sp.selected
              ? "bg-[var(--color-brand)] text-white"
              : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
          }`}
        >
          All
        </Link>
        <Link
          href={link({ selected: "yes" })}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            sp.selected === "yes"
              ? "bg-[var(--color-brand)] text-white"
              : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
          }`}
        >
          Selected
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={link({ status: s })}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${
              sp.status === s
                ? "bg-[var(--color-brand)] text-white"
                : "border border-black/10 bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-mist)]"
            }`}
          >
            {s.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
          No participants match these filters.
        </div>
      ) : (
        <div className="card divide-y divide-black/10">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/admin/users/${r.audience_profile_id}`}
                    className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-dark)]"
                  >
                    {r.profiles?.full_name ?? "Unnamed"}
                  </Link>
                  <StatusBadge status={r.status} />
                  {r.selected && (
                    <span className="text-xs text-[var(--color-olive-deep)]">
                      selected
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-[var(--color-ink-soft)]">
                  {r.profiles?.email ?? "—"}
                </p>
              </div>

              <Link
                href={`/dashboard/admin/events/sponsored/${r.sponsored_event_id}`}
                className="min-w-0 max-w-[16rem] flex-1 text-sm text-[var(--color-brand-dark)] hover:underline"
              >
                <span className="block truncate">
                  {r.sponsored_events?.name ?? "Event"}
                </span>
                <span className="block text-xs text-[var(--color-ink-soft)]">
                  {r.sponsored_events?.event_date
                    ? formatDate(r.sponsored_events.event_date)
                    : "Date TBC"}
                </span>
              </Link>

              <div className="w-24 text-right">
                <p className="text-xs text-[var(--color-ink-soft)]">Reward</p>
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  {r.reward_amount_gbp != null
                    ? `£${Number(r.reward_amount_gbp).toLocaleString("en-GB")}`
                    : "—"}
                </p>
              </div>

              <div className="w-28 text-right text-xs text-[var(--color-ink-soft)]">
                {r.bank_details_provided ? "payout ✓" : "payout —"}
                <br />
                {r.newsletter_opt_in ? "newsletter ✓" : "newsletter —"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
