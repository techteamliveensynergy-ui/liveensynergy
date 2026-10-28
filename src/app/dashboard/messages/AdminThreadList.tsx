import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { formatDateTime, timeAgo } from "@/lib/format";

/** One organisation in the admin inbox and the threads with it (#52). */
export interface OrgGroup {
  /** The non-admin party's profile id — grouped by id, never by name. */
  orgId: string;
  label: string;
  person: string | null;
  role: Role | null;
  blocked: boolean;
  unread: number;
  lastAt: string | null;
  threads: { id: string; label: string; unread: number; lastAt: string | null }[];
}

/** Light tint behind each organisation, by role. Never the only signal —
 *  the role label is printed too. Legacy `event` reads as an artist. */
export function roleTint(role: Role | null | undefined): string {
  switch (role) {
    case "brand":
      return "bg-[var(--color-role-brand)]";
    case "artist":
    case "event":
      return "bg-[var(--color-role-artist)]";
    case "audience":
      return "bg-[var(--color-role-audience)]";
    default:
      return "bg-[var(--color-mist)]";
  }
}

/**
 * The admin's conversation list: one row per organisation (brand, act or
 * audience member), expanding into its threads labelled by what they are
 * about. The organisation holding the open thread starts expanded.
 */
export function AdminThreadList({
  groups,
  activeId,
  hrefFor,
  query,
  tab,
}: {
  groups: OrgGroup[];
  activeId: string | null;
  hrefFor: (conversationId: string) => string;
  query: string;
  tab: string;
}) {
  return (
    <div className="space-y-3">
      <form className="flex gap-2" role="search">
        {tab === "partner" && <input type="hidden" name="tab" value="partner" />}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search organisation or reference"
          className="input text-sm"
          aria-label="Search conversations"
        />
      </form>

      {groups.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-[var(--color-ink-soft)]">No conversations match.</p>
      ) : (
        <div className="card divide-y divide-black/5 overflow-hidden">
          {groups.map((g) => {
            const open = g.threads.some((t) => t.id === activeId);
            return (
              <details key={g.orgId} open={open} className={roleTint(g.role)}>
                <summary className="cursor-pointer list-none px-4 py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold">
                      {g.label}
                      {g.blocked && <span className="ml-1 font-normal text-[var(--color-accent)]">(blocked)</span>}
                    </p>
                    <span
                      className="shrink-0 text-[11px] text-[var(--color-ink-soft)]"
                      title={g.lastAt ? formatDateTime(g.lastAt) : undefined}
                    >
                      {g.lastAt ? timeAgo(g.lastAt) : "No messages"}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-ink-soft)]">
                    <span className="rounded-full bg-white/70 px-2 py-0.5 font-medium text-[var(--color-ink)]">
                      {g.role ? ROLE_LABELS[g.role] : "Account"}
                    </span>
                    {g.person && g.person !== g.label && <span className="truncate">{g.person}</span>}
                    <span className="ml-auto shrink-0">
                      {g.threads.length} thread{g.threads.length === 1 ? "" : "s"}
                    </span>
                    {g.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-[var(--color-brand)] px-2 py-0.5 font-semibold text-white">
                        {g.unread}
                      </span>
                    )}
                  </div>
                </summary>
                <ul className="border-t border-black/5 bg-white/60">
                  {g.threads.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={hrefFor(t.id)}
                        className={`flex items-baseline justify-between gap-2 px-6 py-2 text-sm transition ${
                          t.id === activeId ? "bg-white font-semibold" : "hover:bg-white"
                        }`}
                      >
                        <span className="truncate">{t.label}</span>
                        <span className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--color-ink-soft)]">
                          {t.unread > 0 && (
                            <span className="rounded-full bg-[var(--color-brand)] px-1.5 font-semibold text-white">
                              {t.unread}
                            </span>
                          )}
                          {t.lastAt ? timeAgo(t.lastAt) : "—"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
