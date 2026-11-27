import type { AnalysisFigures, ColumnFigures } from "@/lib/analysis/figures";
import type { ComparisonItem, ReportComparison } from "@/lib/analysis/campaign-report";

/**
 * Before/after the event (0127): the pre-event survey's figures against the
 * post-event survey's, question by question. Two questions are "the same"
 * only when their wording matches (ignoring the "Q3." number, case, spacing
 * and punctuation) — a reworded question is listed as unmatched, never
 * forced into a comparison. These are two groups of respondents, not the
 * same people tracked; the report says so.
 */

const DEMOGRAPHIC = new Set(["age band", "gender", "country"]);

export function normaliseQuestion(name: string): string {
  return name
    .replace(/^Q\d+\.\s*/i, "")
    .toLowerCase()
    .replace(/[“”"'’‘?.!,:;()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function compare(pre: ColumnFigures, post: ColumnFigures): ComparisonItem | null {
  if (pre.kind === "text" || post.kind === "text") return null;
  if (pre.kind === "number" && post.kind === "number" && pre.mean != null && post.mean != null) {
    return {
      question: post.name.replace(/^Q\d+\.\s*/i, ""),
      kind: "number",
      pre_answered: pre.answered,
      post_answered: post.answered,
      pre_mean: pre.mean,
      post_mean: post.mean,
    };
  }
  if (!pre.counts?.length || !post.counts?.length) return null;
  const labels = new Map<string, string>();
  for (const r of [...post.counts, ...pre.counts]) {
    if (!labels.has(r.label.toLowerCase())) labels.set(r.label.toLowerCase(), r.label);
  }
  const pctOf = (c: ColumnFigures, key: string) => c.counts?.find((r) => r.label.toLowerCase() === key)?.pct ?? 0;
  const rows = [...labels.entries()].map(([key, label]) => {
    const prePct = pctOf(pre, key);
    const postPct = pctOf(post, key);
    return { label, pre_pct: prePct, post_pct: postPct, change_pp: round1(postPct - prePct) };
  });
  return {
    question: post.name.replace(/^Q\d+\.\s*/i, ""),
    kind: post.kind === "multi" || pre.kind === "multi" ? "multi" : "choice",
    pre_answered: pre.answered,
    post_answered: post.answered,
    rows: rows.slice(0, 20),
  };
}

export function buildComparison(
  preTitle: string,
  pre: AnalysisFigures,
  post: AnalysisFigures,
): ReportComparison {
  const isQuestion = (c: ColumnFigures) => !DEMOGRAPHIC.has(c.name.toLowerCase());
  const preByKey = new Map(pre.columns.filter(isQuestion).map((c) => [normaliseQuestion(c.name), c]));
  const matched = new Set<string>();
  const items: ComparisonItem[] = [];
  const unmatchedPost: string[] = [];

  for (const c of post.columns.filter(isQuestion)) {
    const key = normaliseQuestion(c.name);
    const p = preByKey.get(key);
    if (!p) {
      unmatchedPost.push(c.name);
      continue;
    }
    matched.add(key);
    const item = compare(p, c);
    if (item) items.push(item);
  }
  const unmatchedPre = [...preByKey.entries()].filter(([k]) => !matched.has(k)).map(([, c]) => c.name);

  return {
    pre_title: preTitle,
    pre_responses: pre.rows,
    post_responses: post.rows,
    items,
    unmatched_pre: unmatchedPre,
    unmatched_post: unmatchedPost,
  };
}
