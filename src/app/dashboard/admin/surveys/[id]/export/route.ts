import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/profile";
import { CSV_BOM, csvDateTime, csvRow } from "@/lib/csv";
import {
  answerToText,
  CHOICE_TYPES,
  choiceBars,
  meanAndSd,
  QUESTION_TYPE_LABELS,
  rankingRows,
  scaleBars,
  type SurveyQuestionStats,
} from "@/lib/survey-results";
import type { SurveyQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";

type Question = Pick<SurveyQuestion, "id" | "order_index" | "type" | "prompt" | "options" | "config">;

interface ExportRow {
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
  answers: Record<string, unknown>;
  answer_seconds: Record<string, number>;
}

const BATCH = 500;

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "survey";

/**
 * Anonymised survey exports for admins (migration 0059):
 *   ?file=responses  one row per respondent, one column per question (+ time per question)
 *   ?file=answers    one row per answer (long format, for pivoting / analysis tools)
 *   ?file=summary    counts and percentages per option, from the running stats
 *   &include=rejected  also include rejected responses (audit)
 *
 * No names, emails, phones or birth dates: survey_export_rows() never returns
 * them, and hidden-field questions are left out at the database. Rows stream
 * out in batches of 500, so a large survey never sits in memory at once.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const sp = new URL(request.url).searchParams;
  const file = sp.get("file") === "answers" ? "answers" : sp.get("file") === "summary" ? "summary" : "responses";
  const includeRejected = sp.get("include") === "rejected";

  const [{ data: template }, { data: questionRows }] = await Promise.all([
    supabase.from("survey_templates").select("id, title").eq("id", id).maybeSingle<{ id: string; title: string }>(),
    supabase
      .from("survey_questions")
      .select("id, order_index, type, prompt, options, config")
      .eq("template_id", id)
      .neq("type", "hidden_field")
      .order("order_index"),
  ]);
  if (!template) return new Response("Survey not found", { status: 404 });

  // Compliance & audit (0060): every data export is recorded — who, which
  // survey, which file, whether rejected responses were included. A failed
  // log write doesn't block the download (it's an admin pulling their own
  // platform's data), but it is surfaced in the server log.
  const { error: logError } = await supabase.rpc("log_admin_action", {
    p_action: "survey.export",
    p_target_type: "survey_template",
    p_target_id: template.id,
    p_detail: { file, include_rejected: includeRejected, title: template.title },
  });
  if (logError) console.error("audit log write failed (survey.export)", logError.message);
  const questions = (questionRows ?? []) as Question[];
  const qLabel = (q: Question, i: number) => `Q${i + 1}. ${q.prompt ?? QUESTION_TYPE_LABELS[q.type]}`;

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${slug(template.title)}-${file}${includeRejected ? "-incl-rejected" : ""}-${date}.csv`;
  const headers = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };

  if (file === "summary") {
    const { data: statRows } = await supabase.from("survey_question_stats").select("*").eq("template_id", id);
    const stats = new Map(((statRows ?? []) as SurveyQuestionStats[]).map((s) => [s.question_id, s]));
    let out = CSV_BOM + csvRow(["Question no", "Question", "Type", "Answered", "Option / measure", "Count", "% of answered", "Value"]);
    questions.forEach((q, i) => {
      const s = stats.get(q.id);
      const answered = s?.answered_count ?? 0;
      const base = [`Q${i + 1}`, q.prompt ?? "", QUESTION_TYPE_LABELS[q.type], answered];
      const avgTime = s && s.time_count > 0 ? (s.time_sum_ms / s.time_count / 1000).toFixed(1) : "";
      out += csvRow([...base, "Average seconds on question", "", "", avgTime]);
      if (CHOICE_TYPES.includes(q.type)) {
        for (const b of choiceBars(q, s?.option_counts ?? {}, answered)) {
          out += csvRow([...base, b.label, b.count, b.share.toFixed(1), ""]);
        }
      } else if (q.type === "scale") {
        for (const b of scaleBars(q, s?.option_counts ?? {}, s?.num_count ?? 0)) {
          out += csvRow([...base, b.label, b.count, b.share.toFixed(1), ""]);
        }
        const m = s ? meanAndSd(s.num_count, Number(s.num_sum), Number(s.num_sumsq)) : null;
        out += csvRow([...base, "Mean", s?.num_count ?? 0, "", m ? m.mean.toFixed(2) : ""]);
        out += csvRow([...base, "Standard deviation", "", "", m ? m.sd.toFixed(2) : ""]);
        if (s?.na_count) out += csvRow([...base, "Not applicable", s.na_count, ((s.na_count / answered) * 100).toFixed(1), ""]);
      } else if (q.type === "number") {
        const m = s ? meanAndSd(s.num_count, Number(s.num_sum), Number(s.num_sumsq)) : null;
        out += csvRow([...base, "Mean", s?.num_count ?? 0, "", m ? m.mean.toFixed(2) : ""]);
        out += csvRow([...base, "Standard deviation", "", "", m ? m.sd.toFixed(2) : ""]);
      } else if (q.type === "ranking") {
        for (const r of rankingRows(q, s?.option_counts ?? {}, s?.rank_sums ?? {})) {
          out += csvRow([...base, `${r.label} — average position`, r.count, "", r.avg != null ? r.avg.toFixed(2) : ""]);
        }
      }
    });
    return new Response(out, { headers });
  }

  const encoder = new TextEncoder();
  let afterNo = 0;
  let first = true;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let chunk = "";
      if (first) {
        first = false;
        chunk += CSV_BOM;
        chunk +=
          file === "responses"
            ? csvRow([
                "Respondent ID", "Person ID", "Source", "Started", "Submitted", "Time taken (seconds)",
                "Questions answered", "Questions total", "Quality status", "Quality score",
                "Age band", "Gender", "Country",
                ...questions.map(qLabel),
                ...questions.map((q, i) => `Q${i + 1} time (seconds)`),
              ])
            : csvRow([
                "Respondent ID", "Person ID", "Submitted", "Quality status", "Question no", "Question",
                "Type", "Answer", "Time on question (seconds)",
              ]);
      }

      const { data, error } = await supabase.rpc("survey_export_rows", {
        p_template_id: id,
        p_after_no: afterNo,
        p_limit: BATCH,
        p_include_rejected: includeRejected,
      });
      if (error) {
        controller.enqueue(encoder.encode(chunk + csvRow([`Export stopped: ${error.message}`])));
        controller.close();
        return;
      }
      const rows = (data ?? []) as ExportRow[];
      for (const r of rows) {
        if (file === "responses") {
          chunk += csvRow([
            r.reference, r.person_key, r.source, csvDateTime(r.started_at), csvDateTime(r.submitted_at),
            r.duration_seconds, r.questions_answered, questions.length, r.quality_status, r.quality_score,
            r.age_band, r.gender, r.country,
            ...questions.map((q) => answerToText(q, r.answers[q.id])),
            ...questions.map((q) => r.answer_seconds[q.id] ?? ""),
          ]);
        } else {
          questions.forEach((q, i) => {
            if (!(q.id in r.answers)) return;
            const text = answerToText(q, r.answers[q.id]);
            if (text === "") return;
            chunk += csvRow([
              r.reference, r.person_key, csvDateTime(r.submitted_at), r.quality_status, `Q${i + 1}`,
              q.prompt ?? "", QUESTION_TYPE_LABELS[q.type], text, r.answer_seconds[q.id] ?? "",
            ]);
          });
        }
      }
      if (chunk) controller.enqueue(encoder.encode(chunk));
      if (rows.length < BATCH) {
        controller.close();
      } else {
        afterNo = rows[rows.length - 1].respondent_no;
      }
    },
  });

  return new Response(stream, { headers });
}
