import "server-only";
import type { AnalysisFigures } from "@/lib/analysis/figures";
import { requestStructured, uniqueCharts, type AnalysisNarrative, type ReportSection } from "@/lib/analysis/narrative";
import { NOT_MEASURED, REPORT_SECTIONS, type CampaignReportMeta } from "@/lib/analysis/campaign-report";
import type { ReportContext } from "./context";

/**
 * The words of the Campaign Performance Report (0127), in the ONE fixed
 * format. The model gets the context JSON, the measurement and pre/post
 * comparison (computed in code) and the per-question figures from the
 * anonymised CSV — never respondent-level rows — and fills fixed slots. A
 * slot the survey didn't measure comes back `covered: false` and reads "Not
 * measured in this survey." rather than being padded out.
 */

const SYSTEM_PROMPT = `You are the insights analyst for Live·En·Synergy, a UK platform where brands partner with live events (gigs, festivals, conferences) and the audience answers short pre- and post-event surveys in return for discount codes.

You write the brand's Campaign Performance Report in a FIXED format. Write for a marketing manager: plain British English, short paragraphs, concrete, no jargon, no hype.

Rules:
- Use ONLY the figures provided (context.measurement, comparison, and the per-question figures). Never invent a number, a percentage or a quote. When you quote a figure, use it exactly as given.
- Quotes may come only from the "samples" of written answers, word for word, and stay anonymous. Text like "[email removed]" was masked on purpose — never try to restore it.
- Say how many people answered when a finding rests on fewer than 30, and treat it as indicative.
- Never give the count or percentage of a demographic group (an age band, gender, country or income band) with fewer than 5 people — call it "a small number". The brand must not be able to single anyone out.
- Fill each slot:
  - audience: who answered (age band, gender, country, income band columns) and how they compare with the campaign's target audience. Charts: only demographic column ids.
  - brand_impact: awareness, recognition, perception/favourability, consideration and purchase intent towards the brand. Use the pre/post comparison when given (it compares two groups of respondents, not the same people tracked — say "before/after the event", not "people changed their minds").
  - experience: the event experience and wider attitudes/preferences.
  - open_responses: themes in the written answers, with up to three short anonymous quotes.
  Set covered=false (and body "") when the survey asked nothing on that topic. Never stretch an unrelated question to fill a slot.
- Each covered slot may chart up to three column ids (e.g. "c3") that exist in the figures, each column at most once in the whole report.
- key_findings: 3 to 5 one-sentence findings. recommendations: 3 to 5 one-sentence, actionable suggestions for the brand's next partnership. caveats: data limitations worth stating (sample size, responses left out, self-selection); empty if none matter.`;

const slot = {
  type: "object",
  additionalProperties: false,
  required: ["covered", "body", "charts"],
  properties: {
    covered: { type: "boolean" },
    body: { type: "string" },
    charts: { type: "array", items: { type: "string" } },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "summary",
    "audience",
    "brand_impact",
    "experience",
    "open_responses",
    "key_findings",
    "recommendations",
    "caveats",
  ],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    audience: slot,
    brand_impact: slot,
    experience: slot,
    open_responses: slot,
    key_findings: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } },
    caveats: { type: "array", items: { type: "string" } },
  },
};

interface Slot {
  covered: boolean;
  body: string;
  charts: string[];
}

interface FixedReport {
  headline: string;
  summary: string;
  audience: Slot;
  brand_impact: Slot;
  experience: Slot;
  open_responses: Slot;
  key_findings: string[];
  recommendations: string[];
  caveats: string[];
}

function userPrompt(context: ReportContext, figures: AnalysisFigures, meta: CampaignReportMeta): string {
  return [
    "## Context (context.json)",
    JSON.stringify(context),
    meta.comparison ? "\n## Before/after comparison (computed)" : "",
    meta.comparison ? JSON.stringify(meta.comparison) : "",
    `\n## Demographic column ids\n${JSON.stringify(meta.demographic_columns)}`,
    `\n## Per-question figures (${figures.rows} passed responses, from responses.csv)`,
    "Each column: id, question, kind, how many answered, then counts/percentages, averages, or sample written answers.",
    JSON.stringify(figures.columns),
  ].join("\n");
}

/** The fixed slots → the stored narrative shape every report page already renders. */
export function toNarrative(r: FixedReport, figures: AnalysisFigures, meta: CampaignReportMeta): AnalysisNarrative {
  const ids = new Set(figures.columns.map((c) => c.id));
  const demo = new Set(meta.demographic_columns);
  const section = (heading: string, s: Slot, onlyDemo = false): ReportSection => ({
    heading,
    body: s.covered && s.body.trim() ? s.body : NOT_MEASURED,
    charts: s.covered ? s.charts.filter((c) => ids.has(c) && (!onlyDemo || demo.has(c))).slice(0, 3) : [],
  });
  const sections = uniqueCharts([
    section(REPORT_SECTIONS.audience, r.audience, true),
    section(REPORT_SECTIONS.brand_impact, r.brand_impact),
    section(REPORT_SECTIONS.experience, r.experience),
    section(REPORT_SECTIONS.open_responses, r.open_responses),
    {
      heading: REPORT_SECTIONS.key_findings,
      body: r.key_findings.length ? r.key_findings.map((f) => `• ${f}`).join("\n\n") : NOT_MEASURED,
      charts: [],
    },
  ]);
  return {
    headline: r.headline,
    summary: r.summary,
    sections,
    recommendations: r.recommendations.slice(0, 6),
    caveats: [...meta.notes, ...r.caveats].slice(0, 10),
  };
}

export async function writeCampaignReport(
  context: ReportContext,
  figures: AnalysisFigures,
  meta: CampaignReportMeta,
): Promise<AnalysisNarrative> {
  const r = await requestStructured<FixedReport>(
    SYSTEM_PROMPT,
    userPrompt(context, figures, meta),
    "campaign_performance_report",
    SCHEMA,
  );
  return toNarrative(r, figures, meta);
}
