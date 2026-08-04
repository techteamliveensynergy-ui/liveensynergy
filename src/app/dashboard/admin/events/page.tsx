import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";
import type { EventListing, SponsoredEvent } from "@/lib/types";
import { setListingStatus } from "../actions";
import { formatEventDateTime } from "@/lib/event-time";

export const metadata = { title: "Events · Admin" };

const LISTING_STATUSES = ["draft", "available", "matched", "closed"];

type Tab = "sponsored" | "listings";

interface Search {
  tab?: Tab;
  status?: string;
  q?: string;
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const tab: Tab = sp.tab === "listings" ? "listings" : "sponsored";
  const supabase = await createClient();

  const [{ data: listingRows }, { data: sponsoredRows }, { data: partRows }] =
    await Promise.all([
      supabase.from("event_listings").select("*").order("created_at", { ascending: false }),
      supabase
        .from("sponsored_events")
        .select("*, brands(brand_name)")
        .order("created_at", { ascending: false }),
      supabase.from("participations").select("sponsored_event_id, status"),
    ]);

  let listings = (listingRows ?? []) as EventListing[];
  let sponsored = (sponsoredRows ?? []) as (SponsoredEvent & {
    brands: { brand_name: string } | null;
  })[];
  const parts = (partRows ?? []) as {
    sponsored_event_id: string;
    status: string;
  }[];

  const q = sp.q?.toLowerCase().trim();
  if (q) {
    listings = listings.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.reference ?? "").toLowerCase().includes(q),
    );
    sponsored = sponsored.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.reference ?? "").toLowerCase().includes(q),
    );
  }
  if (sp.status) {
    listings = listings.filter((l) => l.status === sp.status);
    if (sp.status === "awaiting_brand") {
      sponsored = sponsored.filter((e) => !e.brand_agreed);
    } else if (sp.status === "awaiting_artist") {
      sponsored = sponsored.filter((e) => !e.artist_agreed);
    } else {
      sponsored = sponsored.filter((e) => e.status === sp.status);
    }
  }

  const countFor = (id: string) =>
    parts.filter((p) => p.sponsored_event_id === id).length;
  const verifiedFor = (id: string) =>
    parts.filter(
      (p) =>
        p.sponsored_event_id === id &&
        (p.status === "attendance_verified" || p.status === "reward_released"),
    ).length;

  const tabLink = (t: Tab) => `/dashboard/admin/events?tab=${t}`;
  const filterLink = (value: string) =>
    `/dashboard/admin/events?tab=${tab}${value ? `&status=${value}` : ""}`;

  const filters =
    tab === "sponsored"
      ? [
          { value: "", label: "All" },
          { value: "in_progress", label: "In progress" },
          { value: "confirmed", label: "Confirmed" },
          { value: "completed", label: "Completed" },
          { value: "awaiting_brand", label: "Awaiting brand" },
          { value: "awaiting_artist", label: "Awaiting artist" },
        ]
      : [
          { value: "", label: "All" },
          ...LISTING_STATUSES.map((s) => ({ value: s, label: s })),
        ];

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Every listing and sponsorship deal on the platform."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["sponsored", "listings"] as Tab[]).map((t) => (
          <Link
            key={t}
            href={tabLink(t)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t
                ? "bg-[var(--color-ink)] text-white"
                : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
            }`}
          >
            {t === "sponsored"
              ? `Sponsored events (${sponsored.length})`
              : `Listings (${listings.length})`}
          </Link>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={filterLink(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
              (sp.status ?? "") === f.value
                ? "bg-[var(--color-brand)] text-white"
                : "border border-black/10 bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-mist)]"
            }`}
          >
            {f.label.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {tab === "sponsored" ? (
        sponsored.length === 0 ? (
          <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
            No sponsored events match.
          </div>
        ) : (
          <div className="card divide-y divide-black/10">
            {sponsored.map((e) => (
              <Link
                key={e.id}
                href={`/dashboard/admin/events/sponsored/${e.id}`}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-[var(--color-mist)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--color-ink)]">
                      {e.name}
                    </span>
                    <StatusBadge status={e.status} />
                    {!e.brand_agreed && (
                      <span className="rounded-full bg-[var(--color-gold)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ink)]">
                        Awaiting brand
                      </span>
                    )}
                    {!e.artist_agreed && (
                      <span className="rounded-full bg-[var(--color-lavender)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-purple-deep)]">
                        Awaiting artist
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
                    {e.brands?.brand_name ?? "No brand"} · Ref {e.reference}
                    {e.event_date ? ` · ${formatEventDateTime({ date: e.event_date, time: e.start_time, timeZone: e.timezone })}` : ""}
                  </p>
                </div>

                <div className="w-24 text-right">
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    Budget (gross)
                  </p>
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    {e.budget_gbp != null
                      ? `£${Number(e.budget_gbp).toLocaleString("en-GB")}`
                      : "—"}
                  </p>
                </div>
                <div className="w-24 text-right">
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    Participants
                  </p>
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    {countFor(e.id)} · {verifiedFor(e.id)} verified
                  </p>
                </div>
                <span className="text-sm font-semibold text-[var(--color-brand-dark)]">
                  Open →
                </span>
              </Link>
            ))}
          </div>
        )
      ) : listings.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
          No listings match.
        </div>
      ) : (
        <div className="card divide-y divide-black/10">
          {listings.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--color-ink)]">
                    {l.name}
                  </span>
                  <StatusBadge status={l.status} />
                </div>
                <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
                  Ref {l.reference}
                  {l.city ? ` · ${l.city}` : ""}
                  {l.event_date ? ` · ${formatEventDateTime({ date: l.event_date, time: l.start_time, timeZone: l.timezone })}` : ""}
                  {l.budget_range ? ` · ${l.budget_range}` : ""}
                </p>
              </div>
              <form action={setListingStatus} className="flex items-center gap-2">
                <input type="hidden" name="id" value={l.id} />
                <select
                  name="status"
                  className="select w-auto py-1.5 text-sm"
                  defaultValue={l.status}
                >
                  {LISTING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-ghost text-sm">
                  Update
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
