import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { isoDay, loadMarketingList } from "@/lib/marketing-list";

export const metadata = { title: "Marketing list · Admin" };

/**
 * Everyone who currently agrees to a partner's newsletter & promotions
 * (GitHub #62), one row per person — the rules live in loadMarketingList().
 * Filters are a plain GET form, so the CSV link carries the same query.
 */
export default async function AdminMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; event?: string; from?: string; to?: string }>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const filters = {
    brand: sp.brand || null,
    event: sp.event || null,
    from: isoDay(sp.from),
    to: isoDay(sp.to),
  };
  const supabase = await createClient();
  const { people, brands, events } = await loadMarketingList(supabase, filters);

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) query.set(k, v);
  const exportHref = `/dashboard/admin/marketing/export${query.toString() ? `?${query}` : ""}`;
  const filtered = query.toString() !== "";
  const doNotEmail = people.filter((p) => p.suppressed).length;

  return (
    <div>
      <PageHeader
        title="Marketing list"
        subtitle={`${people.length} ${people.length === 1 ? "person has" : "people have"} agreed to partner newsletters & promotions${
          filtered ? " (filtered)" : ""
        }.${doNotEmail ? ` ${doNotEmail} marked “do not email” after a bounce or complaint.` : ""}`}
        action={
          people.length > 0 ? (
            <a href={exportHref} className="btn btn-ghost text-sm">
              ⬇ Download CSV
            </a>
          ) : undefined
        }
      />

      <form method="get" className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
        <label className="block text-sm">
          <span className="field-label">Brand</span>
          <select name="brand" defaultValue={filters.brand ?? ""} className="select mt-1">
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="field-label">Event</span>
          <select name="event" defaultValue={filters.event ?? ""} className="select mt-1">
            <option value="">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="field-label">Agreed from</span>
          <input type="date" name="from" defaultValue={filters.from ?? ""} className="input mt-1" />
        </label>
        <label className="block text-sm">
          <span className="field-label">Agreed to</span>
          <input type="date" name="to" defaultValue={filters.to ?? ""} className="input mt-1" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary text-sm">
            Filter
          </button>
          {filtered && (
            <Link href="/dashboard/admin/marketing" className="btn btn-ghost text-sm">
              Clear
            </Link>
          )}
        </div>
      </form>

      <p className="mb-4 text-xs text-[var(--color-ink-soft)]">
        Someone is listed while at least one of their event registrations has the &ldquo;Partner newsletter &amp;
        promotions&rdquo; box ticked. Un-ticking it under My events removes them. Blocked accounts are left out. The
        CSV holds names, emails, events and consent dates — no phone numbers or dates of birth — and every download is
        recorded in the audit log.
      </p>

      {people.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
          {filtered ? "Nobody matches these filters." : "Nobody has agreed to marketing yet."}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                <th className="px-5 py-3 font-semibold">Person</th>
                <th className="px-5 py-3 font-semibold">Agreed for</th>
                <th className="px-5 py-3 font-semibold">Latest consent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {people.map((p) => (
                <tr key={p.profileId} className="align-top">
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/admin/users/${p.profileId}`}
                      className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-dark)]"
                    >
                      {p.name || "Unnamed"}
                    </Link>
                    <p className="text-[var(--color-ink-soft)]">{p.email}</p>
                    {p.suppressed && (
                      <span className="mt-1 inline-block rounded-full bg-[var(--color-pink)] px-2 py-0.5 text-xs font-semibold text-[var(--color-accent)]">
                        Do not email · {p.suppressed}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <ul className="space-y-1">
                      {p.events.map((e) => (
                        <li key={e.id}>
                          <span className="font-medium text-[var(--color-ink)]">{e.name}</span>
                          {e.brandName && <span className="text-[var(--color-ink-soft)]"> · {e.brandName}</span>}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-[var(--color-ink-soft)]">
                    {formatDateTime(p.latestConsentAt)}
                    <p className="text-xs">{p.latestSource}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
