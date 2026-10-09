import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, MetricTile, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";
import { averageSeconds, countedResponses, formatDuration, type SurveyTemplateStats } from "@/lib/survey-results";

export const metadata = { title: "Reporting & analysis · Admin" };

interface TemplateRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  expected_participants: number | null;
  campaigns: { id: string; reference: string; brands: { brand_name: string } | null } | null;
}

/**
 * Reporting & analysis (Admin Portal brief, 9 Oct — new module): every
 * survey's headline numbers side by side, from the running counters (0059),
 * so this page costs two small queries however many responses exist. Each
 * row links to the survey's full results page and its anonymised downloads.
 */
export default async function AdminReportsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: templateRows }, { data: statRows }] = await Promise.all([
    supabase
      .from("survey_templates")
      .select("id, title, kind, status, expected_participants, campaigns(id, reference, brands(brand_name))")
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase.from("survey_template_stats").select("*"),
  ]);

  const templates = (templateRows ?? []) as unknown as TemplateRow[];
  const stats = new Map(((statRows ?? []) as SurveyTemplateStats[]).map((s) => [s.template_id, s]));
  const totals = [...stats.values()].reduce(
    (t, s) => ({
      counted: t.counted + countedResponses(s),
      rejected: t.rejected + s.reject_count,
      review: t.review + s.review_count,
      durSum: t.durSum + Number(s.duration_sum_seconds),
      durCount: t.durCount + s.duration_count,
    }),
    { counted: 0, rejected: 0, review: 0, durSum: 0, durCount: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Reporting & analysis"
        subtitle="Every published survey's numbers in one place. Open a survey for question-by-question results and anonymised downloads."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Responses counted" value={totals.counted} hint="all surveys, rejected left out" />
        <MetricTile label="Rejected" value={totals.rejected} />
        <MetricTile label="Waiting for review" value={totals.review} hint="counted until decided" />
        <MetricTile label="Average time to complete" value={formatDuration(averageSeconds(totals.durSum, totals.durCount))} />
      </div>

      {templates.length === 0 ? (
        <EmptyState icon="📈" title="Nothing to report yet" body="Published surveys appear here with their results." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-black/10 text-left text-xs text-[var(--color-ink-soft)]">
              <tr>
                <th className="px-4 py-3 font-medium">Survey</th>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 text-right font-medium">Responses</th>
                <th className="px-4 py-3 text-right font-medium">Rejected</th>
                <th className="px-4 py-3 text-right font-medium">Avg time</th>
                <th className="px-4 py-3 font-medium">Latest</th>
                <th className="px-4 py-3 font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {templates.map((t) => {
                const s = stats.get(t.id);
                const counted = s ? countedResponses(s) : 0;
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{t.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
                        {t.kind === "pre_event" ? "Pre-event" : "Post-event"} <StatusBadge status={t.status} />
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {t.campaigns ? (
                        <Link href={`/dashboard/admin/campaigns/${t.campaigns.id}`} className="underline">
                          {t.campaigns.reference}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {t.campaigns?.brands && <p className="text-xs text-[var(--color-ink-soft)]">{t.campaigns.brands.brand_name}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {counted}
                      {t.expected_participants ? <span className="text-[var(--color-ink-soft)]"> / {t.expected_participants}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s?.reject_count ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatDuration(s ? averageSeconds(Number(s.duration_sum_seconds), s.duration_count) : null)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-ink-soft)]">
                      {s?.last_response_at ? formatDate(s.last_response_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                        <Link href={`/dashboard/admin/surveys/${t.id}/results`} className="text-[var(--color-brand-dark)] underline">
                          Results
                        </Link>
                        <a href={`/dashboard/admin/surveys/${t.id}/export?file=responses`} className="text-[var(--color-brand-dark)] underline">
                          CSV
                        </a>
                        <a href={`/dashboard/admin/surveys/${t.id}/export?file=summary`} className="text-[var(--color-brand-dark)] underline">
                          Summary
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
        Expected participants shown after the slash where set. Downloads are anonymised and recorded in Compliance & audit.
      </p>
    </div>
  );
}
