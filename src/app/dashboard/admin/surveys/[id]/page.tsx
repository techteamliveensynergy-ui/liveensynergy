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
import { CopyLinkButton } from "./preview/CopyLinkButton";
import { formatEventDateTime } from "@/lib/event-time";

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

  // Context for the admin while they're authoring/editing — which campaign
  // and (once matched) which actual event this survey is attached to, so
  // "what am I building this for" doesn't require a tab switch.
  const campaign = tpl.campaign_id ? campaigns.find((c) => c.id === tpl.campaign_id) : null;
  let sponsoredEvent: {
    reference: string;
    name: string;
    event_date: string | null;
    start_time: string | null;
    timezone: string | null;
    status: string;
  } | null = null;
  if (tpl.campaign_id) {
    // A campaign can carry several sponsored_events rows (withdrawn siblings
    // from 0022's conflict handling, etc.) — .maybeSingle() errors on more
    // than one match, so filter to the live ones and take the most recent
    // rather than assuming exactly zero or one row exists.
    const { data: evRows } = await supabase
      .from("sponsored_events")
      .select("reference, name, event_date, start_time, timezone, status")
      .eq("campaign_id", tpl.campaign_id)
      .in("status", ["confirmed", "completed"])
      .order("created_at", { ascending: false })
      .limit(1);
    sponsoredEvent = evRows?.[0] ?? null;
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const publicUrl = `${base}/survey/${tpl.id}`;

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

      <div className="card mb-6 p-4 text-sm">
        <p className="font-medium text-[var(--color-ink)]">
          {campaign ? (
            <>
              {campaign.reference}
              {campaign.brands?.brand_name ? ` · ${campaign.brands.brand_name}` : ""}
            </>
          ) : (
            "No campaign linked yet"
          )}
        </p>
        {sponsoredEvent ? (
          <p className="mt-1 text-[var(--color-ink-soft)]">
            {sponsoredEvent.name} ({sponsoredEvent.reference}) ·{" "}
            {formatEventDateTime({
              date: sponsoredEvent.event_date,
              time: sponsoredEvent.start_time,
              timeZone: sponsoredEvent.timezone,
            }) || "date TBC"}{" "}
            · {sponsoredEvent.status}
          </p>
        ) : campaign ? (
          <p className="mt-1 text-[var(--color-ink-soft)]">
            No sponsored event matched to this campaign yet.
          </p>
        ) : null}
      </div>

      {tpl.is_public && tpl.status === "published" && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm">
            <p className="font-medium text-[var(--color-ink)]">Public survey link</p>
            <p className="text-[var(--color-ink-soft)]">
              Share this link anywhere — no account required to answer.
            </p>
          </div>
          <CopyLinkButton url={publicUrl} />
        </div>
      )}

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
        layoutMode={tpl.layout_mode}
      />
    </div>
  );
}
