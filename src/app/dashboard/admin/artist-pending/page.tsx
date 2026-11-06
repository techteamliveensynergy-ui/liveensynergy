import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, MetricTile, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import { nudgeArtist } from "./actions";
import {
  loadArtistPending,
  NUDGE_COOLDOWN_MS,
  type ArtistPendingItem,
  type ArtistPendingKind,
} from "@/lib/data/artist-pending";

export const metadata = { title: "Waiting on artists" };

const KIND_LABEL: Record<ArtistPendingKind, string> = {
  codes: "Reward codes",
  fulfilment: "Fulfilment form",
  agreement: "Agreement",
};
const KINDS = Object.keys(KIND_LABEL) as ArtistPendingKind[];

const NOTICES: Record<string, { ok: boolean; text: string }> = {
  nudged: { ok: true, text: "Reminder sent to the artist (in-app and by email)." },
  too_soon: { ok: false, text: "They were reminded about this less than 12 hours ago. Give it a little longer." },
  resolved: { ok: false, text: "That's already been done, so no reminder was sent." },
  not_ready: {
    ok: false,
    text: "Reminders aren't set up on this database yet — apply migration 0110_artist_nudges.sql first.",
  },
  failed: { ok: false, text: "We couldn't record the reminder, so nothing was sent. Please try again." },
  invalid: { ok: false, text: "Something went wrong with that request." },
};

function dueText(item: ArtistPendingItem): string | null {
  if (item.kind === "codes" && item.dueAt) {
    const due = new Date(item.dueAt).getTime();
    if (Number.isNaN(due)) return null;
    if (item.overdue) {
      const days = Math.max(1, Math.floor((Date.now() - due) / 86_400_000));
      return `Overdue — was due ${formatDateTime(item.dueAt)} (${days} ${days === 1 ? "day" : "days"} ago)`;
    }
    return `Due ${formatDateTime(item.dueAt)}`;
  }
  if (item.since) return `Asked ${timeAgo(item.since)}`;
  return null;
}

function recentlyNudged(sentAt: string | undefined): boolean {
  return !!sentAt && Date.now() - new Date(sentAt).getTime() < NUDGE_COOLDOWN_MS;
}

export default async function ArtistPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; notice?: string }>;
}) {
  await requireRole(["admin"]);
  const { kind, notice } = await searchParams;
  const filter = KINDS.find((k) => k === kind) ?? null;

  const supabase = await createClient();
  const summary = await loadArtistPending(supabase);

  // When each item was last nudged (0110). A database without the table just
  // shows no history.
  const lastNudge = new Map<string, string>();
  if (summary.rows.length > 0) {
    const { data: nudges } = await supabase
      .from("artist_nudges")
      .select("sponsored_event_id, kind, sent_at")
      .in("sponsored_event_id", summary.rows.map((r) => r.eventId))
      .order("sent_at", { ascending: false });
    for (const n of (nudges ?? []) as { sponsored_event_id: string; kind: string; sent_at: string }[]) {
      const key = `${n.sponsored_event_id}:${n.kind}`;
      if (!lastNudge.has(key)) lastNudge.set(key, n.sent_at);
    }
  }

  const rows = filter
    ? summary.rows.filter((r) => r.items.some((i) => i.kind === filter))
    : summary.rows;
  const countFor = (k: ArtistPendingKind) =>
    summary.rows.filter((r) => r.items.some((i) => i.kind === k)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Waiting on artists"
        subtitle="Open sponsorships where an artist still has something to do — and why people on those events may not have their discount code yet."
      />

      {notice && NOTICES[notice] && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            NOTICES[notice].ok
              ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]"
              : "bg-[var(--color-pink)] text-[var(--color-accent)]"
          }`}
        >
          {NOTICES[notice].text}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Events waiting on an artist" value={summary.artistEvents} tint="bg-[var(--color-gold)]" />
        <MetricTile
          label="Past the codes deadline"
          value={summary.overdueEvents}
          tint={summary.overdueEvents ? "bg-[var(--color-pink)]" : "bg-[var(--color-mist)]"}
        />
        <MetricTile
          label="Checked in, no code yet"
          value={summary.peopleWaiting}
          hint="on events whose codes are unconfirmed"
          tint="bg-[var(--color-sage)]"
        />
        <MetricTile
          label="Waiting on us"
          value={summary.teamOnlyEvents}
          hint={summary.readyToOpen ? `${summary.readyToOpen} ready to open` : undefined}
          tint="bg-[var(--color-lavender)]"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="navigation" aria-label="Filter by what is pending">
        <Link
          href="/dashboard/admin/artist-pending"
          className={`chip ${!filter ? "ring-2 ring-[var(--color-brand)]/40" : ""}`}
        >
          All ({summary.rows.length})
        </Link>
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/dashboard/admin/artist-pending?kind=${k}`}
            className={`chip ${filter === k ? "ring-2 ring-[var(--color-brand)]/40" : ""}`}
          >
            {KIND_LABEL[k]} ({countFor(k)})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="✅"
          title={filter ? "Nothing pending for this" : "Nothing waiting on artists"}
          body="Every open sponsorship has what it needs from its artist."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const shown = filter ? r.items.filter((i) => i.kind === filter) : r.items;
            return (
              <li key={r.eventId} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/dashboard/admin/events/sponsored/${r.eventId}`}
                      className="font-semibold text-[var(--color-ink)] hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      {r.reference} · {r.artistName}
                      {r.eventDate ? ` · event ${r.eventDate}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.peopleWaiting > 0 && (
                      <span className="chip">{r.peopleWaiting} waiting for a code</span>
                    )}
                    {r.peopleRegistered > 0 && (
                      <span className="chip">{r.peopleRegistered} registered</span>
                    )}
                    <StatusBadge status={r.status} />
                  </div>
                </div>

                {shown.length > 0 && (
                  <ul className="space-y-2">
                    {shown.map((i) => {
                      const due = dueText(i);
                      return (
                        <li
                          key={i.kind}
                          className={`flex flex-wrap items-start justify-between gap-2 rounded-xl px-4 py-3 ${
                            i.overdue ? "bg-[var(--color-pink)]" : "bg-[var(--color-mist)]"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--color-ink)]">{i.label}</p>
                            {i.detail && <p className="text-xs text-[var(--color-ink-soft)]">{i.detail}</p>}
                            {due && (
                              <p
                                className={`mt-0.5 text-xs font-medium ${
                                  i.overdue ? "text-[var(--color-accent)]" : "text-[var(--color-ink-soft)]"
                                }`}
                              >
                                {due}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <div className="flex items-center gap-3">
                              <form action={nudgeArtist}>
                                <input type="hidden" name="event_id" value={r.eventId} />
                                <input type="hidden" name="kind" value={i.kind} />
                                <button
                                  type="submit"
                                  className="btn btn-ghost !px-3 !py-1.5 text-sm"
                                  disabled={recentlyNudged(lastNudge.get(`${r.eventId}:${i.kind}`))}
                                >
                                  Nudge artist
                                </button>
                              </form>
                              <Link
                                href={`/dashboard/admin/events/sponsored/${r.eventId}${i.anchor}`}
                                className="text-sm font-semibold text-[var(--color-brand-dark)] hover:underline"
                              >
                                Open →
                              </Link>
                            </div>
                            {lastNudge.get(`${r.eventId}:${i.kind}`) && (
                              <p className="text-xs text-[var(--color-ink-soft)]">
                                Last nudged {timeAgo(lastNudge.get(`${r.eventId}:${i.kind}`))}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {!filter && r.waitingOnUs.length > 0 && (
                  <div className="rounded-xl border border-dashed border-black/15 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                      Waiting on us
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[var(--color-ink-soft)]">
                      {r.waitingOnUs.map((w) => (
                        <li key={w.text}>
                          {w.text}
                          {w.href && (
                            <>
                              {" "}
                              <Link href={w.href} className="font-semibold text-[var(--color-brand-dark)] hover:underline">
                                Open →
                              </Link>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
