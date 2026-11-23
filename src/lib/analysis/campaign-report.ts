import type { AnalysisFigures, ColumnFigures } from "./figures";

/**
 * The ONE survey report format (client, 23 Nov): the Campaign Performance
 * Report from the package brief — Measurement + Insights. Generated
 * automatically when a survey closes (0127, src/lib/survey-reports/).
 *
 * Everything in this file is computed in code and stored on the report's
 * figures (`figures.report`); the AI only writes the words around it, in the
 * fixed sections below. Shared by server and client code.
 */

export const REPORT_FORMAT = "campaign_performance_v1";

/** The fixed section order. A section the survey didn't measure says so. */
export const REPORT_SECTIONS = {
  audience: "Audience profile",
  brand_impact: "Brand impact",
  experience: "Event experience and attitudes",
  open_responses: "Open-ended responses",
  key_findings: "Key findings",
} as const;

export const NOT_MEASURED = "Not measured in this survey.";

export interface ReportMeasurement {
  registered: number | null;
  checked_in: number | null;
  attendance_rate_pct: number | null;
  surveys_completed: number;
  completion_rate_pct: number | null;
  codes_issued: number | null;
  codes_redeemed: number | null;
  redemption_rate_pct: number | null;
  participant_target: number | null;
  target_reached_pct: number | null;
  package_value_gbp: number | null;
  cost_per_completed_survey_gbp: number | null;
  cost_per_participant_gbp: number | null;
}

export interface ComparisonItem {
  question: string;
  kind: "choice" | "multi" | "number";
  pre_answered: number;
  post_answered: number;
  /** choice / multi: one row per answer, % of those who answered. */
  rows?: { label: string; pre_pct: number; post_pct: number; change_pp: number }[];
  /** number / rating */
  pre_mean?: number;
  post_mean?: number;
}

export interface ReportComparison {
  pre_title: string;
  pre_responses: number;
  post_responses: number;
  items: ComparisonItem[];
  /** Questions asked in only one of the two surveys (listed, never forced into a comparison). */
  unmatched_pre: string[];
  unmatched_post: string[];
}

export interface ReportCover {
  brand: string | null;
  campaign: string | null;
  campaign_reference: string | null;
  event: string | null;
  event_date: string | null;
  venue: string | null;
  survey_title: string;
  survey_kind: "pre_event" | "post_event";
  first_response: string | null;
  last_response: string | null;
  closed_at: string;
  close_reason: string;
}

export interface CampaignReportMeta {
  format: typeof REPORT_FORMAT;
  cover: ReportCover;
  measurement: ReportMeasurement;
  comparison: ReportComparison | null;
  /** Figure column ids that are demographics (age band, gender, country). */
  demographic_columns: string[];
  /** Data notes worked out in code (held/rejected responses left out, etc.). */
  notes: string[];
}

export const CLOSE_REASON_LABELS: Record<string, string> = {
  event_passed: "the event day ended",
  campaign_completed: "the campaign was completed",
  campaign_closed: "the campaign was closed",
  archived: "the survey was archived",
  event_cancelled: "the event was cancelled",
  manual: "an admin asked for a report",
};

/** Smallest group a brand may see a number for. Matches the brand rules (0060, 0115). */
export const MIN_GROUP = 5;

/**
 * The brand's copy: any demographic group under 5 people shows "<5" (no
 * count, no percentage) — otherwise "the one 55–64 woman in Leeds" is
 * identifiable without a name. Admins see exact numbers.
 */
export function suppressSmallGroups(figures: AnalysisFigures): AnalysisFigures {
  const demo = new Set(figures.report?.demographic_columns ?? []);
  if (demo.size === 0) return figures;
  const mask = (c: ColumnFigures): ColumnFigures =>
    demo.has(c.id) && c.counts
      ? {
          ...c,
          counts: c.counts.map((r) => (r.count < MIN_GROUP ? { ...r, count: 0, pct: 0, masked: true } : r)),
        }
      : c;
  return { ...figures, columns: figures.columns.map(mask) };
}

export const pct = (part: number | null | undefined, whole: number | null | undefined): number | null =>
  part == null || !whole ? null : Math.round((part / whole) * 1000) / 10;

export const gbp = (n: number | null | undefined) =>
  n == null ? "—" : `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The Measurement tiles, in the order the package brief lists them. */
export function measurementTiles(m: ReportMeasurement): { label: string; value: string; hint?: string }[] {
  const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-GB"));
  const rate = (n: number | null) => (n == null ? "" : `${n}%`);
  return [
    { label: "Participants registered", value: num(m.registered) },
    {
      label: "Completed surveys",
      value: num(m.surveys_completed),
      hint: m.participant_target ? `of ${m.participant_target.toLocaleString("en-GB")} in the package${m.target_reached_pct != null ? ` (${m.target_reached_pct}%)` : ""}` : undefined,
    },
    { label: "Survey completion rate", value: rate(m.completion_rate_pct) || "—", hint: "completed ÷ registered" },
    { label: "Verified attendance", value: num(m.checked_in), hint: m.attendance_rate_pct != null ? `${m.attendance_rate_pct}% of those registered` : undefined },
    { label: "Discount codes issued", value: num(m.codes_issued) },
    { label: "Incentive redemption rate", value: rate(m.redemption_rate_pct) || "—", hint: m.codes_redeemed != null ? `${m.codes_redeemed} codes marked redeemed` : undefined },
    { label: "Cost per completed survey", value: gbp(m.cost_per_completed_survey_gbp), hint: "package value ÷ completed surveys" },
    { label: "Cost per participant", value: gbp(m.cost_per_participant_gbp), hint: "package value ÷ registered" },
  ];
}
