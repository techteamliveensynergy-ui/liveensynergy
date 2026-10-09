/**
 * Survey results (docs/survey-results-analysis-plan.md, migration 0059).
 *
 * Every number on the results page comes from running counters the database
 * keeps up to date as responses arrive (survey_template_stats,
 * survey_question_stats, survey_daily_stats) — the page reads a handful of
 * rows however many responses there are. This file only turns those counters
 * into display values; nothing here loops over answers.
 *
 * "Counted" = not rejected (pending, pass and review all count), so results
 * are live while a survey is open and settle as the review queue is worked.
 */

import { SCALE_NA_VALUE } from "./surveys";
import type { SurveyQuestion, SurveyQuestionType } from "./types";

export interface SurveyTemplateStats {
  template_id: string;
  responses_total: number;
  pending_count: number;
  pass_count: number;
  review_count: number;
  reject_count: number;
  duration_count: number;
  duration_sum_seconds: number;
  duration_buckets: Record<string, number>;
  last_response_at: string | null;
  updated_at: string;
}

export interface SurveyQuestionStats {
  question_id: string;
  template_id: string;
  answered_count: number;
  time_count: number;
  time_sum_ms: number;
  num_count: number;
  num_sum: number;
  num_sumsq: number;
  na_count: number;
  option_counts: Record<string, number>;
  rank_sums: Record<string, number>;
}

export interface SurveyDailyStat {
  day: string;
  responses: number;
}

export const EMPTY_TEMPLATE_STATS: Omit<SurveyTemplateStats, "template_id" | "updated_at"> = {
  responses_total: 0,
  pending_count: 0,
  pass_count: 0,
  review_count: 0,
  reject_count: 0,
  duration_count: 0,
  duration_sum_seconds: 0,
  duration_buckets: {},
  last_response_at: null,
};

/** Responses that count towards results (everything but rejected). */
export const countedResponses = (s: Pick<SurveyTemplateStats, "pending_count" | "pass_count" | "review_count">) =>
  s.pending_count + s.pass_count + s.review_count;

/** Completion-time buckets, in display order (keys written by 0059). */
export const DURATION_BUCKETS: { key: string; label: string }[] = [
  { key: "lt1m", label: "Under 1 min" },
  { key: "1to3m", label: "1–3 min" },
  { key: "3to5m", label: "3–5 min" },
  { key: "5to10m", label: "5–10 min" },
  { key: "10to20m", label: "10–20 min" },
  { key: "20m_plus", label: "20 min +" },
];

/** "4m 05s" / "45s" — for averages, which are already capped server-side. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
export const formatPct = (p: number) => `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;

export function averageSeconds(sum: number, count: number): number | null {
  return count > 0 ? sum / count : null;
}

/** Mean and (population) standard deviation from running sums. */
export function meanAndSd(n: number, sum: number, sumsq: number): { mean: number; sd: number } | null {
  if (n <= 0) return null;
  const mean = sum / n;
  const variance = Math.max(sumsq / n - mean * mean, 0);
  return { mean, sd: Math.sqrt(variance) };
}

/** The bucket where the middle respondent falls — a robust "typical" time. */
export function medianBucket(buckets: Record<string, number>): string | null {
  const total = DURATION_BUCKETS.reduce((t, b) => t + (buckets[b.key] ?? 0), 0);
  if (total === 0) return null;
  let seen = 0;
  for (const b of DURATION_BUCKETS) {
    seen += buckets[b.key] ?? 0;
    if (seen >= total / 2) return b.label;
  }
  return null;
}

export interface Bar {
  key: string;
  label: string;
  count: number;
  /** Share of the base (answered, or respondents for multi-select). */
  share: number;
}

/**
 * Bars for a choice question, in the question's own option order, with any
 * value that is no longer an option (removed after responses came in) listed
 * after them so no answer silently disappears.
 */
export function choiceBars(q: Pick<SurveyQuestion, "options">, counts: Record<string, number>, base: number): Bar[] {
  const options = q.options ?? [];
  const known = new Set(options.map((o) => o.value));
  const bars: Bar[] = options.map((o) => ({
    key: o.value,
    label: o.label || o.value,
    count: counts[o.value] ?? 0,
    share: pct(counts[o.value] ?? 0, base),
  }));
  for (const [value, count] of Object.entries(counts)) {
    if (!known.has(value) && count > 0) {
      bars.push({ key: value, label: `${value} (removed option)`, count, share: pct(count, base) });
    }
  }
  return bars;
}

/** Bars for every point on a scale (min..max by step), so gaps show as zero. */
export function scaleBars(q: Pick<SurveyQuestion, "config">, counts: Record<string, number>, base: number): Bar[] {
  const min = Number(q.config?.min ?? 1);
  const max = Number(q.config?.max ?? 5);
  const step = Number(q.config?.step ?? 1) || 1;
  const keys: string[] = [];
  if (Number.isFinite(min) && Number.isFinite(max) && max >= min && (max - min) / step <= 100) {
    for (let v = min; v <= max + 1e-9; v += step) keys.push(String(Number(v.toFixed(4))));
  }
  const bars = keys.map((k) => ({ key: k, label: k, count: counts[k] ?? 0, share: pct(counts[k] ?? 0, base) }));
  for (const [k, count] of Object.entries(counts)) {
    if (!keys.includes(k) && count > 0) bars.push({ key: k, label: k, count, share: pct(count, base) });
  }
  return bars;
}

/** Ranking items by average position (1 = ranked top), best first. */
export function rankingRows(
  q: Pick<SurveyQuestion, "options">,
  counts: Record<string, number>,
  rankSums: Record<string, number>,
): { key: string; label: string; avg: number | null; count: number }[] {
  const labelOf = new Map((q.options ?? []).map((o) => [o.value, o.label || o.value]));
  const keys = new Set([...(q.options ?? []).map((o) => o.value), ...Object.keys(counts)]);
  return [...keys]
    .map((k) => ({
      key: k,
      label: labelOf.get(k) ?? `${k} (removed option)`,
      count: counts[k] ?? 0,
      avg: counts[k] ? (rankSums[k] ?? 0) / counts[k] : null,
    }))
    .sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity));
}

/** Question types whose results are bars over options. */
export const CHOICE_TYPES: SurveyQuestionType[] = ["single_choice", "multiple_choice", "dropdown", "yes_no", "attention_check"];
export const TEXT_TYPES: SurveyQuestionType[] = ["short_text", "long_text"];

/**
 * An answer as a spreadsheet cell: option labels instead of stored values,
 * multi-select joined with "; ", ranking in order joined with " > ".
 */
export function answerToText(q: Pick<SurveyQuestion, "type" | "options" | "config">, value: unknown): string {
  if (value == null) return "";
  const labelOf = (v: unknown) => {
    const s = String(v);
    return q.options?.find((o) => o.value === s)?.label || s;
  };
  if (Array.isArray(value)) {
    return value.map(labelOf).join(q.type === "ranking" ? " > " : "; ");
  }
  if (q.type === "scale" && value === SCALE_NA_VALUE) {
    return (q.config?.na_label as string | undefined) || "Not applicable";
  }
  if (CHOICE_TYPES.includes(q.type)) return labelOf(value);
  return String(value);
}

export const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  scale: "Rating / scale",
  yes_no: "Yes / No",
  dropdown: "Dropdown",
  short_text: "Short text",
  long_text: "Long text",
  ranking: "Ranking",
  number: "Number",
  attention_check: "Attention check",
  hidden_field: "Hidden field",
};
