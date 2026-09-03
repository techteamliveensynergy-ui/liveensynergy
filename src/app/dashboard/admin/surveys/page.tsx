import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import {
  publishSurveyTemplate,
  unpublishSurveyTemplate,
  archiveSurveyTemplate,
  unarchiveSurveyTemplate,
} from "./actions";

export const metadata = { title: "Surveys · Admin" };

interface Row {
  id: string;
  title: string;
  kind: string;
  status: string;
  created_at: string;
  campaigns: { reference: string; brands: { brand_name: string } | null } | null;
}

export default async function AdminSurveysPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: templateRows }, { data: questionRows }] = await Promise.all([
    supabase
      .from("survey_templates")
      .select("id, title, kind, status, created_at, campaigns(reference, brands(brand_name))")
      .order("created_at", { ascending: false }),
    supabase.from("survey_questions").select("template_id"),
  ]);

  const templates = (templateRows ?? []) as unknown as Row[];
  const questionCounts = new Map<string, number>();
  for (const q of questionRows ?? []) {
    questionCounts.set(q.template_id, (questionCounts.get(q.template_id) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader
        title="Surveys"
        subtitle="Build pre-event and post-event research surveys for a campaign."
        action={
          <Link href="/dashboard/admin/surveys/new" className="btn btn-primary">
            + New survey
          </Link>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon="📝"
          title="No surveys yet"
          body="Create a pre-event or post-event survey and drag questions into it."
          cta={{ href: "/dashboard/admin/surveys/new", label: "Create a survey" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const count = questionCounts.get(t.id) ?? 0;
            return (
              <div key={t.id} className="card flex flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{t.title}</h3>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  {t.kind === "pre_event" ? "Pre-event" : "Post-event"} · {count}{" "}
                  question{count === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  {t.campaigns
                    ? `${t.campaigns.reference}${t.campaigns.brands ? ` · ${t.campaigns.brands.brand_name}` : ""}`
                    : "No campaign linked yet"}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
                  <Link
                    href={`/dashboard/admin/surveys/${t.id}`}
                    className="btn btn-ghost text-sm"
                  >
                    Edit
                  </Link>
                  {t.status === "draft" && (
                    <>
                      <form action={publishSurveyTemplate}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="btn btn-ghost text-sm">
                          Publish
                        </button>
                      </form>
                      <form action={archiveSurveyTemplate}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="btn btn-ghost text-sm">
                          Archive
                        </button>
                      </form>
                    </>
                  )}
                  {t.status === "published" && (
                    <form action={unpublishSurveyTemplate}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="btn btn-ghost text-sm">
                        Unpublish
                      </button>
                    </form>
                  )}
                  {t.status === "archived" && (
                    <form action={unarchiveSurveyTemplate}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="btn btn-ghost text-sm">
                        Restore to draft
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
