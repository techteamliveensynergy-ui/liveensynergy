import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { signedUrlFor } from "@/lib/storage";
import { isImagePath } from "@/components/dashboard/ParticipationProgress";
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

  // Screenshots sit in the private bucket, so each needs signing per render.
  // Showing the reporter their own attachment is how they can tell it actually
  // uploaded — the same reason the audience side shows an uploaded ticket back.
  const shots = await Promise.all(
    reports.map((r) => signedUrlFor(r.screenshot_url)),
  );

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
            {reports.map((r, i) => (
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
                  {shots[i] && (
                    <a
                      href={shots[i]!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-brand-dark)]"
                      title="Open full size in a new tab"
                    >
                      {isImagePath(r.screenshot_url) ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={shots[i]!}
                            alt=""
                            className="h-12 w-12 rounded-lg border border-black/10 object-cover"
                          />
                          Your screenshot ↗
                        </>
                      ) : (
                        <>📎 Your attachment ↗</>
                      )}
                    </a>
                  )}
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
