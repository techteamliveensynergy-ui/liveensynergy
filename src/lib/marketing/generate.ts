import "server-only";
import { analysisModel } from "@/lib/analysis/narrative";
import { MAX_STEPS, MIN_STEPS, type CampaignContent, type ContentBlock } from "./blocks";

/**
 * "Generate with AI" for marketing campaigns (plan phase 5). The model writes
 * the WORDS only — subject, preview text, headline, body, steps, button text.
 * Every fact that could mislead someone if invented (promo code, what it's
 * worth, expiry, link) comes from what the admin typed and is placed by this
 * code, never by the model. The result goes into the editor as an unsaved
 * draft for the admin to review in the preview; nothing is saved or sent.
 *
 * Same provider/key as the survey reports: OPENAI_API_KEY (OPENAI_MODEL overrides).
 */

export interface GenerateInput {
  brandName: string;
  partnerName: string | null;
  brief: string;
  tone: "friendly" | "premium" | "energetic";
  events: string[];
  promo: { code: string; discount: string; expiry: string } | null;
  link: { url: string; label: string } | null;
}

export interface GeneratedDraft {
  subject: string;
  preview_text: string;
  content: CampaignContent;
}

export class GenerateError extends Error {}

export function isGenerateConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

const SYSTEM_PROMPT = `You write short promotional emails for Live·En·Synergy, a UK platform where brands partner with live events. The email goes, on behalf of one brand, to people who attended or registered for that brand's partnered events and agreed to hear from it.

Write in plain British English. Warm, specific, brief: a subject under 60 characters, a preview line under 90, a headline under 70, a body of 2–4 short sentences.

Hard rules:
- Never invent a discount, price, code, date, deadline, link, product claim, statistic or quote. If the brief gives no offer, write no offer. Refer to the code only as "your code" or "the code below" — it is printed separately.
- No ALL-CAPS words, no more than one exclamation mark in the whole email, no "act now", "guaranteed", "free money" or similar spam phrasing.
- You may use {{first_name}} once, in the subject or the headline/body (it becomes "there" when the name is unknown). No other {{…}} placeholders.
- Steps: either 2–5 short steps (a bold 1–4 word lead plus a short detail) that explain how to use the offer, or none if steps don't fit.
- The button text is 2–4 words.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "preview_text", "headline", "body", "include_steps", "steps_title", "steps", "button_text"],
  properties: {
    subject: { type: "string" },
    preview_text: { type: "string" },
    headline: { type: "string" },
    body: { type: "string" },
    include_steps: { type: "boolean" },
    steps_title: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lead", "text"],
        properties: { lead: { type: "string" }, text: { type: "string" } },
      },
    },
    button_text: { type: "string" },
  },
} as const;

type ModelOut = {
  subject: string;
  preview_text: string;
  headline: string;
  body: string;
  include_steps: boolean;
  steps_title: string;
  steps: { lead: string; text: string }[];
  button_text: string;
};

function userPrompt(i: GenerateInput): string {
  const lines = [
    `Brand sending the email: ${i.brandName}`,
    i.partnerName ? `Co-branded with: ${i.partnerName}` : null,
    i.events.length ? `Recipients agreed to hear from the brand at: ${i.events.join("; ")}` : `Recipients: everyone who agreed to hear from ${i.brandName} at its events`,
    `Tone: ${i.tone}`,
    i.promo
      ? `Offer (printed separately, don't restate the code): ${i.promo.discount}${i.promo.expiry ? `, ${i.promo.expiry}` : ""}`
      : "Offer: none — do not mention any discount or code.",
    i.link ? `The button leads to: ${i.link.url}${i.link.label ? ` (the admin suggests the text "${i.link.label}")` : ""}` : null,
    "",
    "Brief from the team:",
    i.brief,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

const clean = (s: string, max: number) =>
  s
    .replace(/\{\{(?!\s*first_name\s*\}\})[^}]*\}\}/gi, "") // only {{first_name}} survives
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, max);

export async function generateCampaignDraft(i: GenerateInput): Promise<GeneratedDraft> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new GenerateError("AI writing isn't set up yet (OPENAI_API_KEY).");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: analysisModel(),
      store: false,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(i) },
      ],
      text: { format: { type: "json_schema", name: "marketing_email", schema: SCHEMA, strict: true } },
    }),
    signal: AbortSignal.timeout(90_000),
  }).catch((e: unknown) => {
    throw new GenerateError(`Couldn't reach OpenAI: ${e instanceof Error ? e.message : "network error"}`);
  });

  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    output_text?: string;
    output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  } | null;
  if (!res.ok) throw new GenerateError(`OpenAI: ${body?.error?.message ?? `request failed (${res.status})`}`);
  const parts = (body?.output ?? []).flatMap((o) => (o.type === "message" ? o.content ?? [] : []));
  const refusal = parts.find((p) => p.type === "refusal")?.refusal;
  if (refusal) throw new GenerateError(`OpenAI declined: ${refusal}`);
  const text = body?.output_text ?? parts.find((p) => p.type === "output_text")?.text;
  if (!text) throw new GenerateError("OpenAI returned nothing.");

  let out: ModelOut;
  try {
    out = JSON.parse(text) as ModelOut;
  } catch {
    throw new GenerateError("OpenAI's draft couldn't be read — try again.");
  }
  return assembleDraft(out, i);
}

/** Model words + admin facts → editor content. Exported for tests. */
export function assembleDraft(out: ModelOut, i: Pick<GenerateInput, "promo" | "link" | "partnerName">): GeneratedDraft {
  const blocks: ContentBlock[] = [{ type: "hero", headline: clean(out.headline, 150), body: clean(out.body, 1500) }];
  const steps = (out.steps ?? [])
    .map((s) => ({ lead: clean(s.lead ?? "", 80), text: clean(s.text ?? "", 200) }))
    .filter((s) => s.lead)
    .slice(0, MAX_STEPS);
  if (out.include_steps && steps.length >= MIN_STEPS) {
    blocks.push({ type: "steps", title: clean(out.steps_title ?? "", 100) || undefined, steps });
  }
  if (i.promo) {
    blocks.push({ type: "promo", code: i.promo.code, discount: i.promo.discount, expiry: i.promo.expiry || undefined });
  }
  if (i.link) {
    blocks.push({ type: "cta", label: clean(out.button_text, 60) || i.link.label || "Find out more", url: i.link.url, style: "button" });
  }
  return {
    subject: clean(out.subject, 200),
    preview_text: clean(out.preview_text, 200),
    content: { ...(i.partnerName ? { partner_name: i.partnerName } : {}), blocks },
  };
}
