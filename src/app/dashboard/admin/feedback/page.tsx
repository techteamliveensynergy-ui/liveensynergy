import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import { signedUrlFor } from "@/lib/storage";
import type { FeedbackReport } from "@/lib/types";
import { updateFeedback } from "../../feedback/actions";

export const metadata = { title: "Feedback inbox" };

const KIND_LABELS: Record<string, string> = {
  bug: "Bug",
  idea: "Idea",
  improvement: "Improvement",
  text_change: "Text change",
};

const STATUSES = ["open", "in_progress", "resolved", "wont_fix"] as const;

type Row = FeedbackReport & { profiles: { full_name: string | null; email: string | null } | null };

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(["admin"]);
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("feedback_reports")
    .select("*, profiles(full_name, email)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data } = await query;
  const reports = (data ?? []) as Row[];

  // Screenshots live in the private bucket, so each needs signing to render.
  const signed = await Promise.all(
    reports.map((r) => signedUrlFor(r.screenshot_url)),
  );

  return (
    <div>
      <PageHeader
        title="Feedback inbox"
        subtitle="Bugs, ideas and text changes reported from inside the product."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip label="All" href="/dashboard/admin/feedback" active={!status} />
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={s.replace(/_/g, " ")}
            href={`/dashboard/admin/feedback?status=${s}`}
            active={status === s}
          />
        ))}
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon="🐞"
          title="Nothing reported"
          body="When someone submits a bug or an idea from the product, it lands here."
        />
      ) : (
        <div className="space-y-3">
          {reports.map((r, i) => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip">{KIND_LABELS[r.kind] ?? r.kind}</span>
                    <h3 className="font-semibold">{r.subject}</h3>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    {r.reference} ·{" "}
                    {r.profiles?.full_name ?? r.profiles?.email ?? "Unknown user"}{" "}
                    · {new Date(r.created_at).toLocaleString("en-GB")}
                  </p>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-ink-soft)]">
                {r.body}
              </p>

              {r.page_url && (
                <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                  Reported from{" "}
                  <a
                    href={r.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--color-brand-dark)] underline"
                  >
                    {r.page_url}
                  </a>
                </p>
              )}

              {signed[i] && (
                <a
                  href={signed[i]!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]"
                >
                  View screenshot →
                </a>
              )}

              <form
                action={updateFeedback}
                className="mt-4 flex flex-wrap items-end gap-3 border-t border-black/5 pt-4"
              >
                <input type="hidden" name="id" value={r.id} />
                <div className="min-w-[9rem]">
                  <label className="field-label" htmlFor={`status-${r.id}`}>
                    Status
                  </label>
                  <select
                    id={`status-${r.id}`}
                    name="status"
                    className="select"
                    defaultValue={r.status}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[14rem] flex-1">
                  <label className="field-label" htmlFor={`notes-${r.id}`}>
                    Note back to the reporter
                  </label>
                  <input
                    id={`notes-${r.id}`}
                    name="admin_notes"
                    className="input"
                    defaultValue={r.admin_notes ?? ""}
                  />
                </div>
                <button type="submit" className="btn btn-ghost">
                  Save
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition ${
        active
          ? "bg-[var(--color-ink)] text-white"
          : "bg-[var(--color-mist)] text-[var(--color-ink-soft)] hover:bg-black/5"
      }`}
    >
      {label}
    </a>
  );
}
