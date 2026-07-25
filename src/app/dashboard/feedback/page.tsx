import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import type { FeedbackReport } from "@/lib/types";
import { FeedbackForm } from "./FeedbackForm";

export const metadata = { title: "Report a bug or idea" };

const KIND_LABELS: Record<string, string> = {
  bug: "Bug",
  idea: "Idea",
  improvement: "Improvement",
  text_change: "Text change",
};

export default async function FeedbackPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("feedback_reports")
    .select("*")
    .eq("profile_id", profile!.id)
    .order("created_at", { ascending: false });
  const reports = (data ?? []) as FeedbackReport[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report a bug or idea"
        subtitle="Found something broken, or want different wording? Send it here with a screenshot and we'll track it through to a fix."
      />

      <FeedbackForm />

      {reports.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
            Your reports
          </h2>
          <div className="space-y-2">
            {reports.map((r) => (
              <div
                key={r.id}
                className="card flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip">
                      {KIND_LABELS[r.kind] ?? r.kind}
                    </span>
                    <p className="font-semibold">{r.subject}</p>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    {r.reference} ·{" "}
                    {new Date(r.created_at).toLocaleDateString("en-GB")}
                  </p>
                  {r.admin_notes && (
                    <p className="mt-2 rounded-lg bg-[var(--color-mist)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
                      <span className="font-semibold text-[var(--color-ink)]">
                        Team:
                      </span>{" "}
                      {r.admin_notes}
                    </p>
                  )}
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
