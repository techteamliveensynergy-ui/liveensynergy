import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import type { SurveyQualityStatus } from "@/lib/types";
import { BulkDecideForm } from "./BulkDecideForm";

export const metadata = { title: "Survey responses · Admin" };

const STATUSES: SurveyQualityStatus[] = ["pending", "review", "pass", "reject"];

interface Row {
  id: string;
  quality_score: number | null;
  quality_status: SurveyQualityStatus;
  submitted_at: string;
  duplicate_of: string | null;
  survey_templates: { title: string; kind: string } | null;
  participations: {
    audience_profile_id: string;
    profiles: { full_name: string | null } | null;
    sponsored_events: { name: string } | null;
  } | null;
}

export default async function SurveyResponsesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const status =
    sp.status && STATUSES.includes(sp.status as SurveyQualityStatus)
      ? (sp.status as SurveyQualityStatus)
      : "review"; // the queue's whole point is triage — default to what needs a human

  const { data } = await supabase
    .from("survey_responses")
    .select(
      "id, quality_score, quality_status, submitted_at, duplicate_of, " +
        "survey_templates(title, kind), " +
        "participations(audience_profile_id, profiles(full_name), sponsored_events(name))",
    )
    .eq("quality_status", status)
    .order("submitted_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as Row[];

  const { data: countRows } = await supabase
    .from("survey_responses")
    .select("quality_status");
  const counts = new Map<string, number>();
  for (const r of (countRows ?? []) as { quality_status: string }[]) {
    counts.set(r.quality_status, (counts.get(r.quality_status) ?? 0) + 1);
  }

  const link = (s: SurveyQualityStatus) => `/dashboard/admin/surveys/responses?status=${s}`;

  return (
    <div>
      <PageHeader
        title="Survey responses"
        subtitle="Reviews the quality engine's 9-signal score for every submitted survey response."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={link(s)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${
              status === s
                ? "bg-[var(--color-brand)] text-white"
                : "border border-black/10 bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-mist)]"
            }`}
          >
            {s} ({counts.get(s) ?? 0})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
          No responses in this state.
        </div>
      ) : (
        <BulkDecideForm showButtons={status !== "pending"}>
          <div className="card divide-y divide-black/10">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <input type="checkbox" name="ids" value={r.id} className="h-4 w-4" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/admin/surveys/responses/${r.id}`}
                      className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-dark)]"
                    >
                      {r.participations?.profiles?.full_name ?? "Unnamed"}
                    </Link>
                    <StatusBadge status={r.quality_status} />
                    {r.duplicate_of && <span className="chip">possible duplicate</span>}
                  </div>
                  <p className="truncate text-sm text-[var(--color-ink-soft)]">
                    {r.survey_templates?.title ?? "Survey"} ·{" "}
                    {r.participations?.sponsored_events?.name ?? "Event"}
                  </p>
                </div>

                <div className="w-20 text-right">
                  <p className="text-xs text-[var(--color-ink-soft)]">Score</p>
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    {r.quality_score ?? "—"}
                  </p>
                </div>

                <div className="w-40 text-right text-xs text-[var(--color-ink-soft)]">
                  {formatDateTime(r.submitted_at)}
                </div>
              </div>
            ))}
          </div>
        </BulkDecideForm>
      )}
    </div>
  );
}
