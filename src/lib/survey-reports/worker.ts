import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { summariseCsv, type AnalysisFigures } from "@/lib/analysis/figures";
import { analysisModel, AnalysisError, isAnalysisConfigured, type AnalysisNarrative } from "@/lib/analysis/narrative";
import { CLOSE_REASON_LABELS, MIN_GROUP, REPORT_FORMAT, type CampaignReportMeta } from "@/lib/analysis/campaign-report";
import { loadAllExportRows, loadExportQuestions, responsesHeader, responsesRow, type ExportQuestion, type ExportRow } from "@/lib/survey-export";
import { notifyAdmins } from "@/lib/notifications";
import { buildReportContext } from "./context";
import { buildComparison } from "./comparison";
import { writeCampaignReport } from "./narrative";

/**
 * The automatic survey report worker (0127). Called by /api/cron/survey-reports
 * (every 15 minutes via pg_cron) and kicked with after() when an admin closes
 * or completes a campaign, archives a survey or presses "Generate report now".
 *
 *   detect_closed_surveys()  → a job per newly closed survey
 *   claim_survey_report_job() → the next ready job (held responses: waits ≤ 48 h)
 *   build the inputs          → responses.csv (passed only) + context.json
 *   figures in code           → measurement, demographics, per question,
 *                               before/after for a post-event survey
 *   the write-up (AI)         → fixed Campaign Performance Report sections,
 *                               only from 5 passed responses up
 *   save as a DRAFT           → admins notified; nothing reaches the brand
 *                               until an admin publishes it (0115)
 *
 * An AI failure saves the figures and retries the write-up later (3 attempts);
 * the admins are told once the job has finished either way.
 */

type Job = {
  id: string;
  template_id: string;
  campaign_id: string | null;
  close_reason: string;
  closed_at: string;
  requested_by: string | null;
  attempts: number;
  report_id: string | null;
};

type Template = {
  id: string;
  title: string;
  kind: "pre_event" | "post_event";
  published_at: string | null;
  campaign_id: string | null;
};

const MAX_ATTEMPTS = 3;
const DEMOGRAPHIC_HEADERS = new Set(["age band", "gender", "country", "income band"]);

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "survey";

function csvOf(questions: ExportQuestion[], rows: ExportRow[]): string {
  return responsesHeader(questions) + rows.map((r) => responsesRow(r, questions)).join("");
}

async function passedRows(service: SupabaseClient, templateId: string) {
  const rows = await loadAllExportRows(service, templateId);
  return {
    passed: rows.filter((r) => r.quality_status === "pass"),
    held: rows.filter((r) => r.quality_status === "pending" || r.quality_status === "review").length,
  };
}

/** The pre-event survey to compare a post-event one with: same campaign, latest published. */
async function preEventFigures(service: SupabaseClient, campaignId: string) {
  const { data: pre } = await service
    .from("survey_templates")
    .select("id, title")
    .eq("campaign_id", campaignId)
    .eq("kind", "pre_event")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; title: string }>();
  if (!pre) return null;
  const [questions, { passed }] = await Promise.all([loadExportQuestions(service, pre.id), passedRows(service, pre.id)]);
  if (passed.length === 0) return null;
  return { title: pre.title, figures: summariseCsv(csvOf(questions, passed)) };
}

async function finishJob(service: SupabaseClient, jobId: string, patch: Record<string, unknown>) {
  const { error } = await service.from("survey_report_jobs").update(patch).eq("id", jobId);
  if (error) console.error("[survey-reports] job update failed", jobId, error.message);
}

async function tellAdmins(
  service: SupabaseClient,
  vars: { survey_title: string; campaign_reference: string; outcome: string; detail: string },
  link: string,
) {
  await notifyAdmins({ eventKey: "admin.survey_report_ready", link, variables: vars }, { client: service });
}

export async function processSurveyReportJob(service: SupabaseClient, job: Job): Promise<string> {
  const { data: template } = await service
    .from("survey_templates")
    .select("id, title, kind, published_at, campaign_id")
    .eq("id", job.template_id)
    .maybeSingle<Template>();
  if (!template) {
    await finishJob(service, job.id, { status: "skipped", outcome: "empty", finished_at: new Date().toISOString(), last_error: "Survey no longer exists." });
    return "missing";
  }
  const { data: campaignRow } = template.campaign_id
    ? await service.from("campaigns").select("reference").eq("id", template.campaign_id).maybeSingle<{ reference: string }>()
    : { data: null };
  const reference = campaignRow?.reference ?? "no campaign";
  const kindLabel = template.kind === "pre_event" ? "pre-event" : "post-event";

  const questions = await loadExportQuestions(service, template.id);
  const { passed, held } = await passedRows(service, template.id);

  if (passed.length === 0) {
    await finishJob(service, job.id, { status: "skipped", outcome: "empty", finished_at: new Date().toISOString() });
    await tellAdmins(
      service,
      {
        survey_title: template.title,
        campaign_reference: reference,
        outcome: "it had no passed responses, so there is no report",
        detail: held > 0
          ? `${held} response${held === 1 ? " is" : "s are"} still held for review. Pass them on the survey's results page, then press “Generate report now”.`
          : "Nothing was generated.",
      },
      `/dashboard/admin/surveys/${template.id}/results`,
    );
    return "empty";
  }

  // Input 1: the anonymised CSV — the same file as the admin download, passed only.
  const csv = csvOf(questions, passed);
  const figures: AnalysisFigures = summariseCsv(csv);
  const demographic = figures.columns.filter((c) => DEMOGRAPHIC_HEADERS.has(c.name.toLowerCase())).map((c) => c.id);

  // Before/after for a post-event survey.
  const pre = template.kind === "post_event" && template.campaign_id ? await preEventFigures(service, template.campaign_id) : null;
  const comparison = pre ? buildComparison(pre.title, pre.figures, figures) : null;

  // Input 2: context.json.
  const { context } = await buildReportContext(service, {
    template,
    questions,
    closedAt: job.closed_at,
    closeReason: job.close_reason,
    passed: passed.length,
    held,
    pre: pre && comparison ? { title: pre.title, passed: pre.figures.rows, matched: comparison.items.length } : null,
  });

  const notes: string[] = ["Only responses that passed our quality check are included."];
  if (held > 0) notes.push(`${held} response${held === 1 ? " was" : "s were"} still under review when this report was made and ${held === 1 ? "is" : "are"} not included.`);
  if (context.survey.responses.rejected > 0) {
    notes.push(`${context.survey.responses.rejected} response${context.survey.responses.rejected === 1 ? " was" : "s were"} rejected by the quality check and left out.`);
  }
  if (passed.length < 30) notes.push(`Based on ${passed.length} responses — treat the findings as indicative.`);
  if (comparison) notes.push("The before/after comparison sets two groups of respondents side by side; they are not the same people tracked over time.");

  const times = passed.map((r) => r.submitted_at).sort();
  const meta: CampaignReportMeta = {
    format: REPORT_FORMAT,
    cover: {
      brand: context.brand?.name ?? null,
      campaign: context.campaign?.title ?? null,
      campaign_reference: context.campaign?.reference ?? null,
      event: context.event?.name ?? null,
      event_date: context.event?.date ?? null,
      venue: [context.event?.venue, context.event?.location].filter(Boolean).join(", ") || null,
      survey_title: template.title,
      survey_kind: template.kind,
      first_response: times[0] ?? null,
      last_response: times[times.length - 1] ?? null,
      closed_at: job.closed_at,
      close_reason: job.close_reason,
    },
    measurement: context.measurement,
    comparison,
    demographic_columns: demographic,
    notes,
  };
  figures.report = meta;

  // The write-up: from 5 passed responses up (E), and only if the AI is set up.
  let narrative: AnalysisNarrative | null = null;
  let error: string | null = null;
  let retryAi = false;
  if (passed.length < MIN_GROUP) {
    error = `Only ${passed.length} passed response${passed.length === 1 ? "" : "s"} — this report has the figures but no write-up, and can't be shared (brands see reports from ${MIN_GROUP} responses up).`;
  } else if (!isAnalysisConfigured()) {
    error = "OpenAI isn't set up yet (OPENAI_API_KEY), so this report has the figures only.";
  } else {
    try {
      narrative = await writeCampaignReport(context, figures, meta);
    } catch (err) {
      retryAi = job.attempts < MAX_ATTEMPTS;
      error =
        err instanceof AnalysisError
          ? `${err.message} The figures are below.${retryAi ? " The write-up will be retried automatically." : ""}`
          : `The AI write-up didn't complete, so this report has the figures only.${retryAi ? " It will be retried automatically." : ""}`;
      if (!(err instanceof AnalysisError)) console.error("[survey-reports] narrative failed", err);
    }
  }

  // Save (or, on a retry, update) the draft report and its inputs.
  const { count: previous } = await service
    .from("analysis_reports")
    .select("id", { count: "exact", head: true })
    .eq("survey_template_id", template.id)
    .eq("source", "auto");
  const version = job.report_id ? null : (previous ?? 0) + 1;
  const base = context.campaign?.title ?? template.title;
  const fields = {
    row_count: passed.length,
    dropped_columns: figures.dropped,
    figures,
    narrative,
    model: narrative ? analysisModel() : null,
    status: narrative ? "complete" : "figures_only",
    error,
  };

  let reportId = job.report_id;
  if (reportId) {
    const { error: upErr } = await service.from("analysis_reports").update(fields).eq("id", reportId);
    if (upErr) throw new Error(`report update: ${upErr.message}`);
  } else {
    const { data: row, error: insErr } = await service
      .from("analysis_reports")
      .insert({
        ...fields,
        title: `${base} — ${kindLabel} survey report${version && version > 1 ? ` (v${version})` : ""}`.slice(0, 200),
        campaign_id: template.campaign_id,
        source: "auto",
        survey_template_id: template.id,
        report_version: version,
        format: REPORT_FORMAT,
        source_filename: `${slug(template.title)}-responses.csv`,
        created_by: job.requested_by,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !row) throw new Error(`report insert: ${insErr?.message ?? "no row"}`);
    reportId = row.id;
  }
  const { error: inputsErr } = await service
    .from("analysis_report_inputs")
    .upsert({ report_id: reportId, context, responses_csv: csv, csv_rows: passed.length });
  if (inputsErr) console.error("[survey-reports] inputs save failed", inputsErr.message);

  // Compliance & audit (0060): survey data left the platform for the AI call.
  await service.from("admin_audit_log").insert({
    actor_id: job.requested_by,
    action: "survey_report.generate",
    target_type: "analysis_report",
    target_id: reportId,
    detail: {
      job_id: job.id,
      template_id: template.id,
      rows: passed.length,
      held,
      sent_to_openai: Boolean(narrative),
      model: narrative ? analysisModel() : null,
      close_reason: job.close_reason,
    },
  });

  const outcome = narrative ? "report" : passed.length < MIN_GROUP ? "too_few" : "figures_only";
  if (retryAi) {
    // Figures saved; try the write-up again in an hour.
    await finishJob(service, job.id, {
      status: "queued",
      report_id: reportId,
      outcome,
      last_error: error,
      not_before: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    return "retry";
  }
  await finishJob(service, job.id, {
    status: "done",
    report_id: reportId,
    outcome,
    last_error: narrative ? null : error,
    finished_at: new Date().toISOString(),
  });

  const why = CLOSE_REASON_LABELS[job.close_reason] ?? job.close_reason;
  await tellAdmins(
    service,
    {
      survey_title: template.title,
      campaign_reference: reference,
      outcome:
        outcome === "report"
          ? `${why}, and its Campaign Performance Report is ready to review`
          : outcome === "too_few"
            ? `${why}, but only ${passed.length} response${passed.length === 1 ? "" : "s"} passed, so the report has the figures without a write-up`
            : `${why}; the report has the figures, but the AI write-up couldn't be done`,
      detail:
        outcome === "report"
          ? `${passed.length} passed responses. Read it through, then publish it to ${context.brand?.name ?? "the brand"} from the report page.`
          : (error ?? ""),
    },
    `/dashboard/admin/reports/analysis/${reportId}`,
  );
  return outcome;
}

/**
 * Detect closes, then work through ready jobs until the time budget is used.
 * One AI call can take a few minutes, so a new job only starts with 4 minutes
 * of budget left; anything else waits for the next run.
 */
export async function runSurveyReportWorker(
  service: SupabaseClient,
  budgetMs = 280_000,
): Promise<{ detected: number; processed: { job: string; outcome: string }[] }> {
  const started = Date.now();
  const { data: detected, error: detectErr } = await service.rpc("detect_closed_surveys");
  if (detectErr) console.error("[survey-reports] detect failed", detectErr.message);

  const processed: { job: string; outcome: string }[] = [];
  while (Date.now() - started < budgetMs - 240_000 || processed.length === 0) {
    const { data, error } = await service.rpc("claim_survey_report_job");
    if (error) {
      console.error("[survey-reports] claim failed", error.message);
      break;
    }
    const job = ((data ?? []) as Job[])[0];
    if (!job) break;
    try {
      processed.push({ job: job.id, outcome: await processSurveyReportJob(service, job) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[survey-reports] job failed", job.id, message);
      const giveUp = job.attempts >= MAX_ATTEMPTS;
      await finishJob(service, job.id, giveUp
        ? { status: "failed", last_error: message.slice(0, 1000), finished_at: new Date().toISOString() }
        : { status: "queued", last_error: message.slice(0, 1000), not_before: new Date(Date.now() + 30 * 60 * 1000 * job.attempts).toISOString() });
      processed.push({ job: job.id, outcome: giveUp ? "failed" : "retry" });
      if (giveUp) {
        const { data: t } = await service.from("survey_templates").select("title").eq("id", job.template_id).maybeSingle<{ title: string }>();
        const { data: c } = job.campaign_id
          ? await service.from("campaigns").select("reference").eq("id", job.campaign_id).maybeSingle<{ reference: string }>()
          : { data: null };
        await tellAdmins(
          service,
          {
            survey_title: t?.title ?? "A survey",
            campaign_reference: c?.reference ?? "no campaign",
            outcome: "its report couldn't be generated after three tries",
            detail: `${message.slice(0, 300)} You can try again with “Generate report now” on the survey's results page.`,
          },
          `/dashboard/admin/surveys/${job.template_id}/results`,
        );
      }
    }
    if (Date.now() - started > budgetMs - 240_000) break;
  }
  return { detected: typeof detected === "number" ? detected : 0, processed };
}
