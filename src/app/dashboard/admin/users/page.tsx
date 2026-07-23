import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { activityBucket, timeAgo } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { UserFilters } from "./UserFilters";

export const metadata = { title: "Users · Admin" };

type Row = Profile & { plans: { name: string } | null };

interface Search {
  q?: string;
  role?: string;
  status?: string;
  activity?: string;
  sort?: string;
}

const ROLE_TINTS: Record<string, string> = {
  brand: "bg-[var(--color-gold)] text-[var(--color-ink)]",
  artist: "bg-[var(--color-lavender)] text-[var(--color-purple-deep)]",
  event: "bg-[var(--color-mint)] text-[var(--color-ink-soft)]",
  audience: "bg-[var(--color-sage)] text-[var(--color-olive-deep)]",
  admin: "bg-[var(--color-ink)] text-white",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: userRows }, { data: authRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, plans(name)")
      .order("created_at", { ascending: false }),
    supabase.rpc("admin_auth_activity"),
  ]);

  const lastSignIn = new Map<string, string | null>(
    ((authRows ?? []) as { id: string; last_sign_in_at: string | null }[]).map(
      (r) => [r.id, r.last_sign_in_at],
    ),
  );

  let users = (userRows ?? []) as Row[];

  // --- filters ---
  const q = sp.q?.toLowerCase().trim();
  if (q) {
    users = users.filter(
      (u) =>
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q),
    );
  }
  if (sp.role) users = users.filter((u) => u.role === sp.role);
  if (sp.status === "active") users = users.filter((u) => u.is_active);
  if (sp.status === "blocked") users = users.filter((u) => !u.is_active);
  if (sp.status === "onboarded")
    users = users.filter((u) => u.onboarding_completed);
  if (sp.status === "pending")
    users = users.filter((u) => !u.onboarding_completed);
  if (sp.activity) {
    users = users.filter((u) => activityBucket(u.last_seen_at) === sp.activity);
  }

  // --- sort ---
  const sort = sp.sort ?? "recent";
  users = [...users].sort((a, b) => {
    if (sort === "oldest")
      return a.created_at.localeCompare(b.created_at);
    if (sort === "name")
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    if (sort === "active")
      return (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
    return b.created_at.localeCompare(a.created_at);
  });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Search, filter and manage every account on the platform."
      />

      <UserFilters total={users.length} />

      {users.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-semibold text-[var(--color-ink)]">
            No users match these filters
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Try clearing the search or widening the filters.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-black/10">
          {users.map((u) => (
            <Link
              key={u.id}
              href={`/dashboard/admin/users/${u.id}`}
              className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-[var(--color-mist)]"
            >
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-serif text-lg italic ${
                  ROLE_TINTS[u.role] ?? "bg-[var(--color-mist)]"
                }`}
              >
                {(u.full_name ?? u.email ?? "?").charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--color-ink)]">
                    {u.full_name ?? "Unnamed user"}
                  </span>
                  {!u.is_active && (
                    <span className="rounded-full bg-[var(--color-pink)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-accent)]">
                      Blocked
                    </span>
                  )}
                  {!u.onboarding_completed && (
                    <span className="rounded-full bg-[var(--color-mint)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-ink-soft)]">
                      Pending onboarding
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-[var(--color-ink-soft)]">
                  {u.email ?? "—"}
                </p>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  ROLE_TINTS[u.role] ?? "bg-[var(--color-mist)]"
                }`}
              >
                {ROLE_LABELS[u.role] ?? u.role}
              </span>

              <div className="w-28 text-right">
                <p className="text-xs text-[var(--color-ink-soft)]">Last seen</p>
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  {timeAgo(u.last_seen_at)}
                </p>
              </div>

              <div className="w-28 text-right">
                <p className="text-xs text-[var(--color-ink-soft)]">Last login</p>
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  {timeAgo(lastSignIn.get(u.id))}
                </p>
              </div>

              <span className="text-sm font-semibold text-[var(--color-brand-dark)]">
                Manage →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
