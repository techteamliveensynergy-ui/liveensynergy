import type { SurveyAnswerValue, SurveyQuestion, SurveyQuestionType } from "./types";

/**
 * Skip logic / branching inside one survey (14 Oct standup). Each question can
 * carry rules in config.logic — "if the answer is X, go to question N (or the
 * end)". Rules are checked in order and the first match wins; with no match
 * the survey carries on to the next question. Two paths re-join simply by both
 * jumping to the same later question, typically with an "always" rule on the
 * last question of the first path:
 *
 *   Q1 Been to one of our events?  Yes → Q2   No → Q5
 *   Q2–Q4 returning visitors (Q4: always → Q8)
 *   Q5–Q7 first-timers
 *   Q8 onward: everyone
 *
 * Jumps only go FORWARD (a target at or before the question is ignored), so a
 * survey can't loop. A rating-group row (FB-00028) never branches — the group
 * renders as one card.
 *
 * surveyPath() is mirrored exactly by survey_path_question_ids() in Postgres
 * (0071), which the submit functions use to decide which questions were
 * required and which answers to refuse. Keep the two in step.
 */

export const LOGIC_END = "end";

export type SurveyLogicOp = "equals" | "includes" | "between" | "always";

export interface SurveyLogicRule {
  op: SurveyLogicOp;
  /** equals / includes: an option value. */
  value?: string;
  /** between (scale / number): inclusive range. */
  min?: number;
  max?: number;
  /** A later question's id, or LOGIC_END. */
  goto: string;
}

/** Types whose answer a rule can test. Every non-hidden type can still carry
 *  an "always" rule (to jump past another path). */
export const BRANCHING_TYPES: readonly SurveyQuestionType[] = [
  "single_choice",
  "yes_no",
  "dropdown",
  "multiple_choice",
  "scale",
  "number",
];

/** Rating-group rows and hidden fields never branch. */
export function canBranch(q: { type: SurveyQuestionType; config: { group_id?: string } }): boolean {
  if (q.type === "hidden_field") return false;
  if (q.type === "scale" && q.config.group_id) return false;
  return true;
}

export function ruleMatches(rule: SurveyLogicRule, value: SurveyAnswerValue): boolean {
  switch (rule.op) {
    case "always":
      return true;
    case "equals":
      return typeof value === "string" && value === rule.value;
    case "includes":
      return Array.isArray(value) && rule.value != null && value.includes(rule.value);
    case "between":
      return (
        typeof value === "number" &&
        rule.min != null &&
        rule.max != null &&
        value >= rule.min &&
        value <= rule.max
      );
    default:
      return false;
  }
}

export function logicRules(q: { config: { logic?: SurveyLogicRule[] } }): SurveyLogicRule[] {
  return Array.isArray(q.config.logic) ? q.config.logic : [];
}

/**
 * The questions a respondent actually sees, in order, given the answers so
 * far. Hidden fields are always included (the server fills them).
 */
export function surveyPath<Q extends Pick<SurveyQuestion, "id" | "type" | "config">>(
  questions: Q[],
  values: Record<string, SurveyAnswerValue>,
): Q[] {
  const index = new Map(questions.map((q, i) => [q.id, i]));
  const path: Q[] = [];
  let i = 0;
  while (i < questions.length) {
    const q = questions[i];
    path.push(q);
    if (!canBranch(q)) {
      i += 1;
      continue;
    }
    const value = values[q.id] ?? null;
    const hit = logicRules(q).find((r) => ruleMatches(r, value));
    if (hit?.goto === LOGIC_END) break;
    const j = hit ? index.get(hit.goto) : undefined;
    i = j != null && j > i ? j : i + 1;
  }
  return path;
}

/** Short description of a rule for the builder card ("Yes → Q5"). */
export function describeRule(
  rule: SurveyLogicRule,
  optionLabel: (value: string) => string,
  targetLabel: (goto: string) => string,
): string {
  const to = targetLabel(rule.goto);
  switch (rule.op) {
    case "always":
      return `Always → ${to}`;
    case "equals":
      return `“${optionLabel(rule.value ?? "")}” → ${to}`;
    case "includes":
      return `Includes “${optionLabel(rule.value ?? "")}” → ${to}`;
    case "between":
      return `${rule.min}–${rule.max} → ${to}`;
  }
}

/**
 * What's wrong with a question's rules, given the question's position and the
 * ids that come after it — or null. Used by the builder's validation.
 */
export function logicProblem(
  q: { type: SurveyQuestionType; config: { logic?: SurveyLogicRule[]; group_id?: string }; options: { value: string }[] },
  laterKeys: string[],
): string | null {
  const rules = logicRules(q);
  if (rules.length === 0) return null;
  if (!canBranch(q)) return "This question can't branch.";
  const later = new Set(laterKeys);
  const values = new Set(q.options.map((o) => o.value));
  for (const r of rules) {
    if (r.goto !== LOGIC_END && !later.has(r.goto)) return "A jump points to a question that no longer comes after this one.";
    if ((r.op === "equals" || r.op === "includes") && !values.has(r.value ?? "")) {
      return "A jump refers to an option that no longer exists.";
    }
    if (r.op === "between" && (r.min == null || r.max == null || r.min > r.max)) return "A jump has an invalid range.";
  }
  return null;
}

/**
 * Why a question isn't seen by everyone, for the results page: every rule on
 * an earlier question that jumps past it ("Skipped when Q1 is “No”"). Null
 * when no rule ever skips it. Describes the rules, not who actually took
 * which path — the counts come from survey_question_reach() (0073).
 */
export function skipDescription<
  Q extends Pick<SurveyQuestion, "id" | "type" | "options" | "config">,
>(questions: Q[], index: number): string | null {
  const pos = new Map(questions.map((q, i) => [q.id, i]));
  const reasons: string[] = [];
  for (let i = 0; i < index; i++) {
    const q = questions[i];
    if (!canBranch(q)) continue;
    for (const r of logicRules(q)) {
      const target = r.goto === LOGIC_END ? Infinity : pos.get(r.goto);
      if (target == null || target <= index) continue;
      const label = (v: string) => q.options?.find((o) => o.value === v)?.label || v;
      const when =
        r.op === "always"
          ? `after Q${i + 1}`
          : r.op === "between"
            ? `when Q${i + 1} is ${r.min}–${r.max}`
            : r.op === "includes"
              ? `when Q${i + 1} includes “${label(r.value ?? "")}”`
              : `when Q${i + 1} is “${label(r.value ?? "")}”`;
      reasons.push(when);
    }
  }
  return reasons.length > 0 ? `Skipped ${reasons.join(", or ")}` : null;
}
