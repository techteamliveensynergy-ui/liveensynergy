import "server-only";
import type { AnalysisFigures } from "./figures";

/**
 * AI survey analysis playground (14 Oct standup) — the words half. Sends the
 * figures from figures.ts (never the raw file) plus the campaign's context to
 * OpenAI and gets back a structured report: headline, sections, which of OUR
 * figures to chart, recommendations. Plain fetch to the Responses API — no SDK
 * dependency for one call.
 *
 * Needs OPENAI_API_KEY (server-only). OPENAI_MODEL overrides the model.
 */

export const DEFAULT_ANALYSIS_MODEL = "gpt-5";

export function analysisModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL;
}

export function isAnalysisConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

export interface AnalysisContext {
  campaign: string | null;
  brand: string | null;
  event: string | null;
  eventDate: string | null;
  audience: string | null;
  objectives: string | null;
  instructions: string | null;
}

export interface ReportSection {
  heading: string;
  /** Paragraphs, separated by blank lines. */
  body: string;
  /** Column ids from the figures ("c3") to chart under this section. */
  charts: string[];
}

export interface AnalysisNarrative {
  headline: string;
  summary: string;
  sections: ReportSection[];
  recommendations: string[];
  caveats: string[];
}

/** The playground's own system prompt. Lives here, server-side — the page
 *  only adds optional extra instructions on top. */
const SYSTEM_PROMPT = `You are the insights analyst for Live·En·Synergy, a UK platform where brands sponsor live events (gigs, festivals, conferences) and the audience answers short pre- and post-event surveys in return for discount codes.

You write the survey report a brand receives after its sponsored event. Write for a marketing manager: plain British English, short paragraphs, concrete, no jargon, no hype.

Rules:
- Use ONLY the figures provided. Never invent a number, a percentage or a respondent quote. When you quote a figure, use it exactly as given.
- Quotes may come only from the "samples" of written answers, word for word, and must stay anonymous.
- Say how many people answered when a finding rests on a small number (under 30), and treat it as indicative.
- Connect findings to the brand's sponsorship: awareness, perception, purchase intent, fit between the brand and the event's audience.
- Each section may chart up to three columns by their id (e.g. "c3"), choosing the ones that best support its point. Only use ids that exist.
- 3 to 6 sections. 3 to 6 recommendations, each one sentence, actionable for the brand's next sponsorship.
- caveats: data limitations worth stating (sample size, skipped questions, self-selection). Empty if none matter.`;

function userPrompt(ctx: AnalysisContext, figures: AnalysisFigures): string {
  const context = [
    ctx.brand && `Brand: ${ctx.brand}`,
    ctx.campaign && `Campaign: ${ctx.campaign}`,
    ctx.event && `Event: ${ctx.event}${ctx.eventDate ? ` (${ctx.eventDate})` : ""}`,
    ctx.audience && `Event audience: ${ctx.audience}`,
    ctx.objectives && `Brand's objectives: ${ctx.objectives}`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    "## Context",
    context || "No campaign selected — analyse the survey on its own terms.",
    ctx.instructions ? `\n## Extra instructions from our team\n${ctx.instructions}` : "",
    `\n## Survey figures (${figures.rows} responses)`,
    "Each column: id, question, kind, how many answered, then counts/percentages, averages, or sample written answers.",
    JSON.stringify(figures.columns),
  ].join("\n");
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "sections", "recommendations", "caveats"],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body", "charts"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
          charts: { type: "array", items: { type: "string" } },
        },
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
    caveats: { type: "array", items: { type: "string" } },
  },
} as const;

export class AnalysisError extends Error {}

export async function writeNarrative(ctx: AnalysisContext, figures: AnalysisFigures): Promise<AnalysisNarrative> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AnalysisError("OpenAI isn't set up yet (OPENAI_API_KEY).");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: analysisModel(),
      // Don't keep the request on OpenAI's side for later retrieval.
      store: false,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(ctx, figures) },
      ],
      text: { format: { type: "json_schema", name: "survey_report", schema: SCHEMA, strict: true } },
    }),
    signal: AbortSignal.timeout(240_000),
  });

  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    output_text?: string;
    output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  } | null;
  if (!res.ok) {
    throw new AnalysisError(`OpenAI: ${body?.error?.message ?? `request failed (${res.status})`}`);
  }

  const parts = (body?.output ?? []).flatMap((o) => (o.type === "message" ? o.content ?? [] : []));
  const refusal = parts.find((p) => p.type === "refusal")?.refusal;
  if (refusal) throw new AnalysisError(`OpenAI declined: ${refusal}`);
  const text = body?.output_text ?? parts.find((p) => p.type === "output_text")?.text;
  if (!text) throw new AnalysisError("OpenAI returned no report.");

  let parsed: AnalysisNarrative;
  try {
    parsed = JSON.parse(text) as AnalysisNarrative;
  } catch {
    throw new AnalysisError("OpenAI's report couldn't be read.");
  }
  // Charts may only point at figures we computed.
  const ids = new Set(figures.columns.map((c) => c.id));
  parsed.sections = parsed.sections.map((s) => ({ ...s, charts: s.charts.filter((c) => ids.has(c)).slice(0, 3) }));
  return parsed;
}
