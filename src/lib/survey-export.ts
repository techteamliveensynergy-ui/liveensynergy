import type { SupabaseClient } from "@supabase/supabase-js";
import { csvDateTime, csvRow } from "@/lib/csv";
import { answerToText, QUESTION_TYPE_LABELS, questionTitle } from "@/lib/survey-results";
import type { SurveyQuestion } from "@/lib/types";

/**
 * The anonymised "one row per respondent" survey file (0059, 0094), shared by
 * the admin download (/dashboard/admin/surveys/[id]/export) and the automatic
 * survey report (0127), so the file a report was made from is byte-for-byte
 * the file an admin can download.
 *
 * Rows come from survey_export_rows(): no names, emails, phones or birth
 * dates, hidden-field questions left out, open text masked (survey_mask_pii).
 */

export type ExportQuestion = Pick<SurveyQuestion, "id" | "order_index" | "type" | "prompt" | "options" | "config">;

export interface ExportRow {
  respondent_no: number;
  reference: string;
  person_key: string;
  source: string;
  started_at: string;
  submitted_at: string;
  duration_seconds: number;
  questions_answered: number;
  quality_status: string;
  quality_score: number | null;
  age_band: string | null;
  gender: string | null;
  country: string | null;
  /** From the Demographics preset question (0130). */
  income_band: string | null;
  answers: Record<string, unknown>;
  answer_seconds: Record<string, number>;
}

export const EXPORT_BATCH = 500;

export const questionLabel = (q: ExportQuestion, i: number) =>
  `Q${i + 1}. ${questionTitle(q) || QUESTION_TYPE_LABELS[q.type]}`;

export async function loadExportQuestions(client: SupabaseClient, templateId: string): Promise<ExportQuestion[]> {
  const { data } = await client
    .from("survey_questions")
    .select("id, order_index, type, prompt, options, config")
    .eq("template_id", templateId)
    .neq("type", "hidden_field")
    .order("order_index");
  // A Demographics preset question is its own column (Age band … Income band),
  // filled by survey_export_rows (0130) — not repeated as a question column.
  return ((data ?? []) as ExportQuestion[]).filter((q) => !q.config?.demographic);
}

export function responsesHeader(questions: ExportQuestion[]): string {
  return csvRow([
    "Respondent ID", "Person ID", "Source", "Started", "Submitted", "Time taken (seconds)",
    "Questions answered", "Questions total", "Quality status", "Quality score",
    "Age band", "Gender", "Country", "Income band",
    ...questions.map(questionLabel),
    ...questions.map((_q, i) => `Q${i + 1} time (seconds)`),
  ]);
}

export function responsesRow(r: ExportRow, questions: ExportQuestion[]): string {
  return csvRow([
    r.reference, r.person_key, r.source, csvDateTime(r.started_at), csvDateTime(r.submitted_at),
    r.duration_seconds, r.questions_answered, questions.length, r.quality_status, r.quality_score,
    r.age_band, r.gender, r.country, r.income_band ?? "",
    // "<id>:other" carries the typed "Other" text (survey_export_rows, 0065).
    ...questions.map((q) => answerToText(q, r.answers[q.id], r.answers[`${q.id}:other`])),
    ...questions.map((q) => r.answer_seconds[q.id] ?? ""),
  ]);
}

/** Every export row, batch by batch (non-rejected; the caller filters further). */
export async function loadAllExportRows(client: SupabaseClient, templateId: string): Promise<ExportRow[]> {
  const all: ExportRow[] = [];
  let afterNo = 0;
  for (;;) {
    const { data, error } = await client.rpc("survey_export_rows", {
      p_template_id: templateId,
      p_after_no: afterNo,
      p_limit: EXPORT_BATCH,
      p_include_rejected: false,
    });
    if (error) throw new Error(`survey_export_rows: ${error.message}`);
    const rows = (data ?? []) as ExportRow[];
    all.push(...rows);
    if (rows.length < EXPORT_BATCH) return all;
    afterNo = rows[rows.length - 1].respondent_no;
  }
}
