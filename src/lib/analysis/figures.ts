/**
 * AI survey analysis playground (14 Oct standup) — the numbers half. An
 * uploaded CSV is parsed and summarised HERE, in code: counts, percentages,
 * averages. The model only ever sees these figures plus a sample of written
 * answers, and its charts can only point at figures we computed, so nothing in
 * a report is a number the model made up — and the cost stays small however
 * many rows the file has.
 *
 * Written for the platform's own "One row per respondent" export
 * (/dashboard/admin/surveys/[id]/export?file=responses) but works on any
 * one-row-per-respondent CSV.
 */

/** Under Vercel's 4.5 MB request-body limit, with room for the form fields. */
export const ANALYSIS_MAX_BYTES = 4 * 1024 * 1024;
export const ANALYSIS_MAX_ROWS = 20_000;

/** RFC 4180 parse: quoted fields, doubled quotes, CRLF/LF, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** Column headers that look like they identify a person — dropped before
 *  anything is analysed or sent anywhere. Deliberately broad. */
const PERSONAL = [
  /e-?mail/i,
  /phone|mobile|tel(ephone)?\b|whats\s?app/i,
  /\b(first|last|full|sur|given|family|user)\s?name\b/i,
  /^name$/i,
  /\baddress\b|post\s?code|zip\b/i,
  /\bip\b|ip address/i,
  /date of birth|\bdob\b|birthday/i,
  /respondent id|person id|user id|account id|participant id/i,
  /instagram|twitter|tiktok|handle\b/i,
  /card|iban|sort code|account number/i,
];

/** Bookkeeping columns from our own export that say nothing about opinions. */
const META = [
  /^source$/i,
  /^started$/i,
  /^submitted$/i,
  /^time taken/i,
  /^questions (answered|total)$/i,
  /^quality (status|score)$/i,
  /^Q\d+ time \(seconds\)$/i,
];

/**
 * Header names of identifier / timestamp columns (L-12). These carry no
 * opinion, so analysing them as a "choice" column just produces a chart with
 * one bar per respondent. Matched on the whole header, so "Paid" or "Valid
 * ticket?" are not caught but "ID", "Response ID" and "uuid" are.
 */
const ID_LIKE_HEADER = [
  /^(#|no\.?|row|index|id)$/i,
  /(^|[\s_-])(id|uuid|guid)$/i,
  /^(respondent|response|participant|submission|record|row|ref(erence)?)(\s|_|-)?(id|no|number|ref)?$/i,
  /\b(timestamp|date\s?time|created\s?at|submitted\s?at|started\s?at|updated\s?at)\b/i,
];
const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATETIME_VALUE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;

/**
 * Decides what a column is BEFORE any statistics are computed. Pure: header
 * and non-empty values in, a verdict out, so it can be unit-tested directly.
 *
 *  - "id":     identifier or timestamp - leave it out of the analysis.
 *  - "text":   free-text answers - sample them for the model, no tallies.
 *  - "other":  let figuresFor() decide number / choice / multi.
 *
 * Why not "all values unique => id" alone: a free-text column is also all
 * unique. So long / multi-word answers are classed as text first, and only
 * short single-token unique values (codes, UUIDs, PER-... pseudonyms,
 * 1..n row numbers) are treated as identifiers.
 */
export function inferColumnType(header: string, values: string[]): "id" | "text" | "other" {
  const name = header.trim();
  if (ID_LIKE_HEADER.some((re) => re.test(name))) return "id";
  if (values.length === 0) return "other";

  const n = values.length;
  const share = (pred: (v: string) => boolean) => values.filter(pred).length / n;

  // Values that are plainly identifiers or timestamps, whatever the header.
  if (share((v) => UUID_VALUE.test(v)) > 0.8) return "id";
  if (n >= 3 && share((v) => ISO_DATETIME_VALUE.test(v) && v.length >= 10) > 0.9) return "id";

  const distinct = new Set(values).size;
  const avgLen = values.reduce((sum, v) => sum + v.length, 0) / n;
  const avgWords = values.reduce((sum, v) => sum + v.split(/\s+/).filter(Boolean).length, 0) / n;
  const numeric = share((v) => Number.isFinite(Number(v.replace(/[£$,%]/g, "")))) >= 0.9;

  // Sequential integers 1..n (a row counter) - numeric but not an opinion.
  if (numeric && n >= 5 && distinct === n) {
    const nums = values.map(Number).sort((a, b) => a - b);
    if (nums.every((x, i) => Number.isInteger(x) && (i === 0 || x === nums[i - 1] + 1))) return "id";
  }
  if (numeric) return "other";

  // Free text: long or multi-word answers, or a high share of one-off answers
  // across enough rows that it cannot be a fixed option list.
  const longShare = share((v) => v.length > 60);
  if (avgLen > 40 || avgWords >= 6 || longShare >= 0.2) return "text";
  if (n >= 8 && distinct / n > 0.6 && avgWords >= 2.5) return "text";

  // Short, single-token and every one different: a code, not an answer.
  if (n >= 5 && distinct === n && avgWords < 2.5) return "id";

  return "other";
}

export type ColumnKind = "number" | "choice" | "multi" | "text";

export interface ColumnFigures {
  /** Stable id the model's chart references point at ("c3"). */
  id: string;
  name: string;
  kind: ColumnKind;
  answered: number;
  /** choice / multi / number-with-few-values: label → count, largest first. */
  counts?: { label: string; count: number; pct: number }[];
  /** number */
  mean?: number;
  median?: number;
  min?: number;
  max?: number;
  /** text: a sample of answers, for the model to read. */
  samples?: string[];
}

export interface AnalysisFigures {
  rows: number;
  columns: ColumnFigures[];
  dropped: string[];
  skipped: string[];
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

export function summariseCsv(text: string): AnalysisFigures {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("The file needs a header row and at least one response.");
  const [header, ...rows] = table;
  if (rows.length > ANALYSIS_MAX_ROWS) {
    throw new Error(`The file has ${rows.length.toLocaleString("en-GB")} rows — ${ANALYSIS_MAX_ROWS.toLocaleString("en-GB")} at most.`);
  }

  const dropped: string[] = [];
  const skipped: string[] = [];
  const columns: ColumnFigures[] = [];

  header.forEach((rawName, col) => {
    const name = rawName.trim() || `Column ${col + 1}`;
    if (PERSONAL.some((re) => re.test(name))) {
      dropped.push(name);
      return;
    }
    if (META.some((re) => re.test(name))) {
      skipped.push(name);
      return;
    }
    const values = rows.map((r) => (r[col] ?? "").trim()).filter((v) => v !== "");
    if (values.length === 0) {
      skipped.push(name);
      return;
    }
    // A column whose answers look like email addresses is personal whatever
    // its header says.
    if (values.filter((v) => /\S+@\S+\.\S+/.test(v)).length > values.length * 0.3) {
      dropped.push(name);
      return;
    }
    const inferred = inferColumnType(name, values);
    if (inferred === "id") {
      // Identifiers / timestamps say nothing about opinions: listed as
      // skipped, never analysed.
      skipped.push(name);
      return;
    }
    columns.push(figuresFor(`c${columns.length + 1}`, name, values, inferred === "text"));
  });

  return { rows: rows.length, columns, dropped, skipped };
}

function tally(values: string[], total: number) {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, pct: round((count / total) * 100) }));
}

function figuresFor(id: string, name: string, values: string[], forceText = false): ColumnFigures {
  const answered = values.length;
  const nums = values.map((v) => Number(v.replace(/[£$,%]/g, ""))).filter((n) => Number.isFinite(n));
  if (!forceText && nums.length >= answered * 0.9) {
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const distinct = new Set(sorted);
    return {
      id,
      name,
      kind: "number",
      answered,
      mean: round(sorted.reduce((s, n) => s + n, 0) / sorted.length, 2),
      median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      // A rating scale: show the spread too.
      counts:
        distinct.size <= 11
          ? tally(nums.map(String), answered).sort((a, b) => Number(a.label) - Number(b.label))
          : undefined,
    };
  }

  // Multiple choice from our export joins picks with "; ".
  const multi = values.filter((v) => v.includes("; ")).length >= answered * 0.2;
  const parts = multi ? values.flatMap((v) => v.split("; ").map((p) => p.trim()).filter(Boolean)) : values;
  const distinct = new Set(parts).size;
  if (!forceText && distinct <= Math.max(15, answered * 0.3) && distinct <= 40) {
    return { id, name, kind: multi ? "multi" : "choice", answered, counts: tally(parts, answered).slice(0, 20) };
  }

  // Free text: a spread-out sample, each answer clipped.
  const step = Math.max(1, Math.floor(values.length / 40));
  const samples = values.filter((_, i) => i % step === 0).slice(0, 40).map((v) => (v.length > 300 ? `${v.slice(0, 297)}…` : v));
  return { id, name, kind: "text", answered, samples };
}
