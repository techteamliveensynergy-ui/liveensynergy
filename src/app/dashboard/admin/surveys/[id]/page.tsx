import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import type { SurveyContradictionRule, SurveyQuestion, SurveyTemplate } from "@/lib/types";
import { contradictionRuleRowToDraft, questionRowToDraft } from "@/lib/surveys";
import {
  publishSurveyTemplate,
  unpublishSurveyTemplate,
  archiveSurveyTemplate,
  unarchiveSurveyTemplate,
} from "../actions";
import { SurveyTemplateForm, type CampaignOption } from "../SurveyTemplateForm";
import { SurveyBuilder } from "./SurveyBuilder";

export const metadata = { title: "Edit survey · Admin" };

export default async function EditSurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: template }, { data: questionRows }, { data: campaignRows }, { data: ruleRows }] =
    await Promise.all([
      supabase.from("survey_templates").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("survey_questions")
        .select("*")
        .eq("template_id", id)
        .order("order_index"),
      supabase
        .from("campaigns")
        .select("id, reference, brands(brand_name)")
        .order("created_at", { ascending: false }),
      supabase.from("survey_contradiction_rules").select("*").eq("template_id", id),
    ]);
  if (!template) notFound();

  const tpl = template as SurveyTemplate;
  const questions = (questionRows ?? []) as SurveyQuestion[];
  const rules = (ruleRows ?? []) as SurveyContradictionRule[];
  const campaigns = (campaignRows ?? []) as unknown as {
    id: string;
    reference: string;
    brands: { brand_name: string } | null;
  }[];

  return (
    <div>
      <PageHeader
        title={tpl.title}
        subtitle={`${tpl.kind === "pre_event" ? "Pre-event" : "Post-event"} survey`}
        action={<StatusBadge status={tpl.status} />}
      />
      <Link
        href="/dashboard/admin/surveys"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to surveys
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link href={`/dashboard/admin/surveys/${tpl.id}/preview`} className="btn btn-ghost text-sm">
          Preview
        </Link>
        {tpl.status === "draft" && (
          <>
            <form action={publishSurveyTemplate}>
              <input type="hidden" name="id" value={tpl.id} />
              <button type="submit" className="btn btn-primary text-sm">
                Publish
              </button>
            </form>
            <form action={archiveSurveyTemplate}>
              <input type="hidden" name="id" value={tpl.id} />
              <button type="submit" className="btn btn-ghost text-sm">
                Archive
              </button>
            </form>
          </>
        )}
        {tpl.status === "published" && (
          <form action={unpublishSurveyTemplate}>
            <input type="hidden" name="id" value={tpl.id} />
            <button type="submit" className="btn btn-ghost text-sm">
              Unpublish to edit
            </button>
          </form>
        )}
        {tpl.status === "archived" && (
          <form action={unarchiveSurveyTemplate}>
            <input type="hidden" name="id" value={tpl.id} />
            <button type="submit" className="btn btn-ghost text-sm">
              Restore to draft
            </button>
          </form>
        )}
      </div>

      <details className="card mb-6 p-5">
        <summary className="cursor-pointer font-semibold text-[var(--color-ink)]">
          Survey details
        </summary>
        <div className="mt-4">
          {/* Keyed to updated_at so a successful save remounts the form with
              fresh defaultValues — React 19 resets an action's <form> to its
              ORIGINAL mount-time defaults on success, which would otherwise
              revert the campaign/kind selects to what they were before this
              same save. */}
          <SurveyTemplateForm
            key={tpl.updated_at}
            template={tpl}
            campaigns={campaigns.map<CampaignOption>((c) => ({
              id: c.id,
              reference: c.reference,
              brand_name: c.brands?.brand_name ?? null,
            }))}
          />
        </div>
      </details>

      {tpl.status === "published" ? (
        <div className="card p-6 text-sm text-[var(--color-ink-soft)]">
          This survey is published — its questions are locked. Click{" "}
          <strong>Unpublish to edit</strong> above to change them.
        </div>
      ) : null}

      <SurveyBuilder
        templateId={tpl.id}
        initialQuestions={questions.map(questionRowToDraft)}
        initialRules={rules.map(contradictionRuleRowToDraft)}
        editable={tpl.status !== "published"}
      />
    </div>
  );
}
