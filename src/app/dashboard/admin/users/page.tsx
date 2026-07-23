import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { ROLE_LABELS } from "@/lib/constants";
import type { Plan, Profile } from "@/lib/types";
import { setUserRole, assignPlan, toggleUserActive } from "../actions";

export const metadata = { title: "Users · Admin" };

const ALL_ROLES = ["brand", "artist", "event", "audience", "admin"] as const;

type Row = Profile & { plans: { name: string } | null };

export default async function AdminUsersPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: userRows }, { data: planRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, plans(name)")
      .order("created_at", { ascending: false }),
    supabase.from("plans").select("*").order("sort_order"),
  ]);

  const users = (userRows ?? []) as Row[];
  const plans = (planRows ?? []) as Plan[];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${users.length} account${users.length === 1 ? "" : "s"} · manage roles, plans and access.`}
      />

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">
                    {u.full_name ?? "Unnamed user"}
                  </h3>
                  {!u.is_active && <StatusBadge status="rejected" />}
                </div>
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {u.email ?? "—"}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  {ROLE_LABELS[u.role] ?? u.role}
                  {u.onboarding_completed ? " · onboarded" : " · pending onboarding"}
                  {u.plans?.name ? ` · ${u.plans.name} plan` : " · no plan"}
                </p>
              </div>

              <form action={toggleUserActive}>
                <input type="hidden" name="user_id" value={u.id} />
                <input
                  type="hidden"
                  name="next"
                  value={(!u.is_active).toString()}
                />
                <button
                  type="submit"
                  className={`btn btn-ghost text-sm ${u.is_active ? "text-[var(--color-accent)]" : "text-[var(--color-olive-deep)]"}`}
                >
                  {u.is_active ? "Deactivate" : "Reactivate"}
                </button>
              </form>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {/* Role */}
              <form action={setUserRole} className="flex items-end gap-2">
                <input type="hidden" name="user_id" value={u.id} />
                <div className="flex-1">
                  <label className="field-label" htmlFor={`role-${u.id}`}>
                    Role
                  </label>
                  <select
                    id={`role-${u.id}`}
                    name="role"
                    className="select"
                    defaultValue={u.role}
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-ghost text-sm">
                  Save
                </button>
              </form>

              {/* Plan */}
              <form action={assignPlan} className="flex items-end gap-2">
                <input type="hidden" name="user_id" value={u.id} />
                <div className="flex-1">
                  <label className="field-label" htmlFor={`plan-${u.id}`}>
                    Plan
                  </label>
                  <select
                    id={`plan-${u.id}`}
                    name="plan_id"
                    className="select"
                    defaultValue={u.plan_id ?? ""}
                  >
                    <option value="">No plan</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-ghost text-sm">
                  Save
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
