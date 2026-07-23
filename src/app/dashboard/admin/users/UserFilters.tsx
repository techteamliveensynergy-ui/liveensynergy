"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { ROLE_LABELS } from "@/lib/constants";

const ROLE_OPTIONS = ["brand", "artist", "event", "audience", "admin"] as const;

const STATUS_OPTIONS = [
  { value: "active", label: "Active only" },
  { value: "blocked", label: "Blocked only" },
  { value: "onboarded", label: "Onboarded" },
  { value: "pending", label: "Pending onboarding" },
] as const;

const ACTIVITY_OPTIONS = [
  { value: "today", label: "Active today" },
  { value: "week", label: "Active this week" },
  { value: "month", label: "Active this month" },
  { value: "inactive", label: "Inactive 30d+" },
  { value: "never", label: "Never seen" },
] as const;

const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "active", label: "Recently active" },
  { value: "name", label: "Name A–Z" },
] as const;

/** URL-driven filter bar for the admin user list. */
export function UserFilters({ total }: { total: number }) {
  const router = useRouter();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      router.replace(`/dashboard/admin/users?${next.toString()}`);
    },
    [params, router],
  );

  const q = params.get("q") ?? "";
  const role = params.get("role") ?? "";
  const status = params.get("status") ?? "";
  const activity = params.get("activity") ?? "";
  const sort = params.get("sort") ?? "recent";
  const hasFilters = Boolean(q || role || status || activity || sort !== "recent");

  return (
    <div className="card mb-6 p-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="field-label" htmlFor="user-search">
            Search
          </label>
          <input
            id="user-search"
            className="input"
            placeholder="Name or email…"
            defaultValue={q}
            onChange={(e) => setParam("q", e.target.value.trim())}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="user-role">
            User type
          </label>
          <select
            id="user-role"
            className="select"
            value={role}
            onChange={(e) => setParam("role", e.target.value)}
          >
            <option value="">All types</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="user-status">
            Status
          </label>
          <select
            id="user-status"
            className="select"
            value={status}
            onChange={(e) => setParam("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="user-activity">
            Last active
          </label>
          <select
            id="user-activity"
            className="select"
            value={activity}
            onChange={(e) => setParam("activity", e.target.value)}
          >
            <option value="">Any time</option>
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-3">
        <p className="text-sm text-[var(--color-ink-soft)]">
          {total} account{total === 1 ? "" : "s"} match
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--color-ink-soft)]" htmlFor="user-sort">
            Sort
          </label>
          <select
            id="user-sort"
            className="select w-auto py-1.5 text-sm"
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost text-sm"
              onClick={() => router.replace("/dashboard/admin/users")}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
