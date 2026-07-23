import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/constants";
import { ROLE_PROFILE_SPECS } from "@/lib/admin-user-fields";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { Plan, Profile } from "@/lib/types";
import { toggleUserActive } from "../../actions";
import { AccountForm } from "./AccountForm";
import { RoleProfileForm } from "./RoleProfileForm";

export const metadata = { title: "User · Admin" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: userRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!userRow) notFound();
  const user = userRow as Profile;

  const spec = ROLE_PROFILE_SPECS[user.role];

  const [{ data: planRows }, { data: authRows }, roleRecordResult] =
    await Promise.all([
      supabase.from("plans").select("*").order("sort_order"),
      supabase.rpc("admin_auth_activity"),
      spec
        ? supabase
            .from(spec.table)
            .select("*")
            .eq("profile_id", id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const plans = (planRows ?? []) as Plan[];
  const roleRecord = (roleRecordResult?.data ?? null) as Record<
    string,
    unknown
  > | null;
  const lastSignIn =
    ((authRows ?? []) as { id: string; last_sign_in_at: string | null }[]).find(
      (r) => r.id === id,
    )?.last_sign_in_at ?? null;

  const websiteUrl = (roleRecord?.website_url as string | null) ?? null;
  const socials = (roleRecord?.social_links ?? null) as Record<
    string,
    string
  > | null;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/admin/users"
        className="inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to users
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-serif text-[var(--color-ink-soft)]">
            {ROLE_LABELS[user.role] ?? user.role}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
            {user.full_name ?? "Unnamed user"}
          </h1>
          <p className="mt-1 text-[var(--color-ink-soft)]">
            {user.email ?? "—"}
          </p>
        </div>
        {!user.is_active && (
          <span className="rounded-full bg-[var(--color-pink)] px-3 py-1.5 text-sm font-semibold text-[var(--color-accent)]">
            Blocked
          </span>
        )}
      </div>

      {/* Activity */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Last seen", value: timeAgo(user.last_seen_at) },
          { label: "Last login", value: timeAgo(lastSignIn) },
          {
            label: "Joined",
            value: new Date(user.created_at).toLocaleDateString("en-GB"),
          },
          {
            label: "Onboarding",
            value: user.onboarding_completed ? "Complete" : "Pending",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-black/10 bg-[var(--color-mist)] p-4 shadow-sm"
          >
            <p className="text-xs text-[var(--color-ink-soft)]">{s.label}</p>
            <p className="mt-1 font-display text-lg font-semibold text-[var(--color-ink)]">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Profile links */}
      {(websiteUrl || (socials && Object.keys(socials).length > 0)) && (
        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Profile links
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-sm font-medium text-[var(--color-brand-dark)] hover:bg-[var(--color-mist)]"
              >
                Website ↗
              </a>
            )}
            {socials &&
              Object.entries(socials).map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-sm font-medium capitalize text-[var(--color-brand-dark)] hover:bg-[var(--color-mist)]"
                >
                  {key === "x" ? "X (Twitter)" : key} ↗
                </a>
              ))}
          </div>
        </div>
      )}

      {/* Account */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
          Account
        </h2>
        <AccountForm user={user} plans={plans} />
      </section>

      {/* Platform access */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
          Platform access
        </h2>
        <div
          className={`card p-6 ${!user.is_active ? "bg-[var(--color-pink)]/40" : ""}`}
        >
          {user.is_active ? (
            <>
              <p className="text-sm text-[var(--color-ink-soft)]">
                Blocking signs this user out on their next request and stops
                them signing back in. They&apos;ll see an explanation and a link
                to contact the team.
              </p>
              <form action={toggleUserActive} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="user_id" value={user.id} />
                <input type="hidden" name="next" value="false" />
                <div className="min-w-[16rem] flex-1">
                  <label className="field-label" htmlFor="reason">
                    Reason (internal)
                  </label>
                  <input
                    id="reason"
                    name="reason"
                    className="input"
                    placeholder="e.g. Repeated no-shows after selection"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-ghost text-[var(--color-accent)]"
                >
                  Block this user
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-ink)]">
                <span className="font-semibold">Blocked</span>
                {user.blocked_at
                  ? ` on ${formatDateTime(user.blocked_at)}`
                  : ""}
                .
              </p>
              {user.blocked_reason && (
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  Reason: {user.blocked_reason}
                </p>
              )}
              <form action={toggleUserActive} className="mt-4">
                <input type="hidden" name="user_id" value={user.id} />
                <input type="hidden" name="next" value="true" />
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Restore access
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      {/* Role profile */}
      {spec ? (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
            {spec.label}
          </h2>
          <RoleProfileForm
            userId={user.id}
            role={user.role}
            spec={spec}
            record={roleRecord}
          />
        </section>
      ) : (
        <section className="card p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Profile
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Admin accounts don&apos;t have a role profile.
          </p>
        </section>
      )}
    </div>
  );
}
