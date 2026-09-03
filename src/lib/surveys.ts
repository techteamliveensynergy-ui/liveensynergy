import type {
  SurveyAnswerValue,
  SurveyContradictionRule,
  SurveyQualitySignalKey,
  SurveyQuestion,
  SurveyQuestionConfig,
  SurveyQuestionOption,
  SurveyQuestionType,
} from "./types";
import type { FieldSpec } from "./admin-user-fields";

/**
 * Declarative catalogue of question types, mirroring the pattern
 * `admin-user-fields.ts` uses for role profiles: one source of truth the
 * Palette, the Inspector's per-type config fields, and the save-time
 * validator all read, instead of an 11-branch switch copied into each.
 */

export interface SurveyQuestionSpec {
  type: SurveyQuestionType;
  label: string;
  icon: string; // emoji glyph, matching NavItem's convention
  hint: string;
  /** Renders an options editor (add/remove/reorder label+value rows). */
  hasOptions: boolean;
  /** Whether this type shows a prompt field — false only for hidden_field. */
  hasPrompt: boolean;
  configFields: FieldSpec[];
  /** The JSON shape a valid answer takes. Mirrored by submit_survey_response() (0033). */
  answerShape: "string" | "number" | "string[]" | "none";
}

/**
 * Whitelist of profile columns a `hidden_field` question may map to.
 * Declared before `SURVEY_QUESTION_TYPES` on purpose — that const's own
 * initializer reads this synchronously at module-eval time, so declaring it
 * afterwards is a real temporal-dead-zone bug (`next build` catches it,
 * `tsc --noEmit` alone doesn't).
 */
export const HIDDEN_FIELD_SOURCES: { value: string; label: string }[] = [
  { value: "profiles.full_name", label: "Full name" },
  { value: "profiles.email", label: "Email" },
  { value: "audience_members.phone", label: "Phone" },
  { value: "audience_members.country_of_residence", label: "Country of residence" },
  { value: "audience_members.gender", label: "Gender" },
];

export const SURVEY_QUESTION_TYPES: readonly SurveyQuestionSpec[] = [
  {
    type: "single_choice",
    label: "Single choice",
    icon: "🔘",
    hint: "Pick one option from a list.",
    hasOptions: true,
    hasPrompt: true,
    configFields: [],
    answerShape: "string",
  },
  {
    type: "multiple_choice",
    label: "Multiple choice",
    icon: "☑️",
    hint: "Pick any number of options.",
    hasOptions: true,
    hasPrompt: true,
    configFields: [
      { name: "min_select", label: "Minimum selections", type: "text" },
      { name: "max_select", label: "Maximum selections", type: "text" },
    ],
    answerShape: "string[]",
  },
  {
    type: "scale",
    label: "Rating / scale",
    icon: "📏",
    hint: "A numeric scale, e.g. 1–5.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [
      { name: "min", label: "Minimum", type: "text" },
      { name: "max", label: "Maximum", type: "text" },
      { name: "step", label: "Step", type: "text" },
      { name: "min_label", label: "Label at minimum", type: "text" },
      { name: "max_label", label: "Label at maximum", type: "text" },
    ],
    answerShape: "number",
  },
  {
    type: "yes_no",
    label: "Yes / No",
    icon: "✅",
    hint: "A single yes/no gate.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [],
    answerShape: "string",
  },
  {
    type: "dropdown",
    label: "Dropdown",
    icon: "🔽",
    hint: "Pick one option from a select list.",
    hasOptions: true,
    hasPrompt: true,
    configFields: [],
    answerShape: "string",
  },
  {
    type: "short_text",
    label: "Short text",
    icon: "✏️",
    hint: "A single-line answer.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [{ name: "max_length", label: "Max length", type: "text" }],
    answerShape: "string",
  },
  {
    type: "long_text",
    label: "Long text",
    icon: "📝",
    hint: "A paragraph-length answer.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [{ name: "max_length", label: "Max length", type: "text" }],
    answerShape: "string",
  },
  {
    type: "ranking",
    label: "Ranking",
    icon: "🔀",
    hint: "Respondent drags options into order.",
    hasOptions: true,
    hasPrompt: true,
    configFields: [],
    answerShape: "string[]",
  },
  {
    type: "number",
    label: "Number / slider",
    icon: "🔢",
    hint: "A numeric value within a range.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [
      { name: "min", label: "Minimum", type: "text" },
      { name: "max", label: "Maximum", type: "text" },
      { name: "step", label: "Step", type: "text" },
    ],
    answerShape: "number",
  },
  {
    type: "attention_check",
    label: "Attention check",
    icon: "🎯",
    hint: "Scored, not reported to the brand — did they follow instructions?",
    hasOptions: true,
    hasPrompt: true,
    configFields: [
      {
        name: "expected_answer",
        label: "Expected answer (option value)",
        type: "text",
        hint: "Never shown to the brand; used only to score the response.",
      },
    ],
    answerShape: "string",
  },
  {
    type: "hidden_field",
    label: "Hidden / system field",
    icon: "🙈",
    hint: "Never rendered — prefilled from the respondent's own profile.",
    hasOptions: false,
    hasPrompt: false,
    configFields: [
      {
        name: "profile_field",
        label: "Profile field",
        type: "select",
        options: HIDDEN_FIELD_SOURCES.map((s) => s.value),
      },
    ],
    answerShape: "none",
  },
] as const;

export function questionSpec(type: SurveyQuestionType): SurveyQuestionSpec {
  const spec = SURVEY_QUESTION_TYPES.find((s) => s.type === type);
  if (!spec) throw new Error(`Unknown survey question type: ${type}`);
  return spec;
}

/** The client-side draft shape while a template is being edited/dragged. */
export interface SurveyQuestionDraft {
  /** Stable identity for dnd-kit and React keys: the row id, or a client uuid for new rows. */
  key: string;
  /** Set once the row has been saved at least once. */
  id: string | null;
  type: SurveyQuestionType;
  prompt: string;
  help_text: string;
  options: SurveyQuestionOption[];
  config: SurveyQuestionConfig;
  required: boolean;
}

function newDraftKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Sensible per-type defaults for a freshly added question. */
export function newQuestionDraft(type: SurveyQuestionType): SurveyQuestionDraft {
  const spec = questionSpec(type);
  const base: SurveyQuestionDraft = {
    key: newDraftKey(),
    id: null,
    type,
    prompt: spec.hasPrompt ? "" : "",
    help_text: "",
    options: spec.hasOptions
      ? [
          { label: "Option 1", value: "option_1" },
          { label: "Option 2", value: "option_2" },
        ]
      : [],
    config: {},
    required: type !== "hidden_field",
  };

  if (type === "scale") {
    base.config = { min: 1, max: 5, min_label: "Not at all", max_label: "Extremely" };
  } else if (type === "number") {
    base.config = { min: 0, max: 10, step: 1 };
  } else if (type === "yes_no") {
    base.options = [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ];
  }

  return base;
}

export function questionRowToDraft(
  q: import("./types").SurveyQuestion,
): SurveyQuestionDraft {
  return {
    key: q.id,
    id: q.id,
    type: q.type,
    prompt: q.prompt ?? "",
    help_text: q.help_text ?? "",
    options: q.options ?? [],
    config: q.config ?? {},
    required: q.required,
  };
}

/**
 * Shared by the client (inline warnings) and the server action (authoritative
 * — the save payload is client-authored JSON, so the server must not trust
 * it as-is). Returns the first problem found, or null if the draft is valid.
 */
export function validateQuestions(drafts: SurveyQuestionDraft[]): string | null {
  if (drafts.length === 0) return "Add at least one question.";

  for (const [i, d] of drafts.entries()) {
    const n = i + 1;
    const spec = SURVEY_QUESTION_TYPES.find((s) => s.type === d.type);
    if (!spec) return `Question ${n}: unknown question type.`;
    if (spec.hasPrompt && !d.prompt.trim()) {
      return `Question ${n}: prompt is required.`;
    }
    if (spec.hasOptions) {
      const options = d.options.filter((o) => o.label.trim() && o.value.trim());
      if (options.length < 2) {
        return `Question ${n}: needs at least two options.`;
      }
      const values = options.map((o) => o.value);
      if (new Set(values).size !== values.length) {
        return `Question ${n}: option values must be unique.`;
      }
    }
    if (d.type === "attention_check" && !d.config.expected_answer) {
      return `Question ${n}: set the expected answer for the attention check.`;
    }
    if (d.type === "hidden_field") {
      const source = d.config.profile_field;
      if (!source || !HIDDEN_FIELD_SOURCES.some((s) => s.value === source)) {
        return `Question ${n}: pick which profile field this hidden field maps to.`;
      }
    }
  }
  return null;
}

/** The client-side answer shape while a participant is filling in a survey. */
export interface SurveyAnswerDraft {
  question_id: string;
  value: SurveyAnswerValue;
  shown_at: string | null;
  answered_at: string | null;
}

/** A fresh, empty answer value matching the question type's answer shape. */
export function emptyAnswerFor(type: SurveyQuestionType): SurveyAnswerValue {
  switch (questionSpec(type).answerShape) {
    case "string[]":
      return [];
    case "number":
    case "none":
      return null;
    default:
      return "";
  }
}

export function isAnswerEmpty(value: SurveyAnswerValue): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/**
 * Participant-side twin of `validateQuestions()` — takes `SurveyQuestion`
 * *rows* (read from the `survey_form_questions` view), not builder drafts.
 * Runs client-side for inline messages and again in the server action as a
 * cheap pre-check, but `submit_survey_response()` (migration 0033) is the
 * authoritative validator, because the browser can be bypassed.
 */
export function validateAnswers(
  questions: SurveyQuestion[],
  answers: SurveyAnswerDraft[],
): string | null {
  const byId = new Map(answers.map((a) => [a.question_id, a]));

  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    const spec = questionSpec(q.type);
    const value = byId.get(q.id)?.value ?? null;

    if (isAnswerEmpty(value)) {
      if (q.required) return `Question ${n} needs an answer.`;
      continue;
    }

    if (spec.answerShape === "string[]") {
      const values = Array.isArray(value) ? value : [];
      const validValues = new Set((q.options ?? []).map((o) => o.value));
      if (values.some((v) => !validValues.has(v))) {
        return `Question ${n} has an invalid answer.`;
      }
      if (new Set(values).size !== values.length) {
        return `Question ${n} has duplicate selections.`;
      }
      if (q.type === "ranking" && values.length !== (q.options ?? []).length) {
        return `Question ${n} must rank every option exactly once.`;
      }
      if (q.config.min_select != null && values.length < q.config.min_select) {
        return `Question ${n} needs at least ${q.config.min_select} selections.`;
      }
      if (q.config.max_select != null && values.length > q.config.max_select) {
        return `Question ${n} allows at most ${q.config.max_select} selections.`;
      }
    } else if (spec.answerShape === "string") {
      if (typeof value !== "string") return `Question ${n} has an invalid answer.`;
      if (q.options && q.options.length > 0) {
        const validValues = new Set(q.options.map((o) => o.value));
        if (!validValues.has(value)) return `Question ${n} has an invalid answer.`;
      } else if (q.config.max_length != null && value.length > q.config.max_length) {
        return `Question ${n} is too long.`;
      }
    } else if (spec.answerShape === "number") {
      if (typeof value !== "number" || Number.isNaN(value)) {
        return `Question ${n} must be a number.`;
      }
      if (q.config.min != null && value < q.config.min) return `Question ${n} is out of range.`;
      if (q.config.max != null && value > q.config.max) return `Question ${n} is out of range.`;
    }
  }

  return null;
}

// --- Quality engine (0035) ---

/** score_survey_response()'s pass/review/reject cut points. Kept out of
 * survey_quality_weights on purpose — see that table's migration comment. */
export const QUALITY_PASS_THRESHOLD = 80;
export const QUALITY_REVIEW_THRESHOLD = 60;

export interface SurveyQualitySignalSpec {
  key: SurveyQualitySignalKey;
  label: string;
  hint: string;
}

/** Display order + copy for the review queue's per-signal breakdown. Keep in
 * step with the jsonb_build_object() key list in score_survey_response(). */
export const SURVEY_QUALITY_SIGNALS: readonly SurveyQualitySignalSpec[] = [
  {
    key: "completion_time",
    label: "Completion time",
    hint: "Flags a response finished suspiciously fast against the survey's own median.",
  },
  {
    key: "attention_checks",
    label: "Attention checks",
    hint: "Did the respondent answer attention-check questions as instructed?",
  },
  {
    key: "straight_lining",
    label: "Straight-lining",
    hint: "The same rating repeated across every scale/number question.",
  },
  {
    key: "contradictions",
    label: "Contradictions",
    hint: "Answer pairs an admin has marked as mutually inconsistent.",
  },
  {
    key: "open_text_quality",
    label: "Open-text quality",
    hint: "Low-effort or junk answers to short/long-text questions.",
  },
  {
    key: "question_coverage",
    label: "Question coverage",
    hint: "Leaning on 'prefer not to say' / 'none of the above' style opt-outs.",
  },
  {
    key: "duplicate_detection",
    label: "Duplicate detection",
    hint: "Same email/phone as an earlier response to this survey.",
  },
  {
    key: "behaviour",
    label: "Behaviour",
    hint: "Interaction telemetry — blocked on Step 3, not yet built.",
  },
  {
    key: "fraud_signals",
    label: "Fraud signals",
    hint: "Turnstile/rate-limit telemetry — blocked on Step 3, not yet built.",
  },
];

/**
 * Substrings (case-insensitive) that mark an option as an "opt-out" choice
 * for the question_coverage signal. Keep in step with the regex literal in
 * score_survey_response() (migration 0035).
 */
export const OPT_OUT_LABEL_PATTERNS: readonly string[] = [
  "prefer not",
  "n/a",
  "not applicable",
  "none of the above",
  "don't know",
  "dont know",
  "unsure",
  "skip",
];

export function optionLooksLikeOptOut(label: string): boolean {
  const lower = label.toLowerCase();
  return OPT_OUT_LABEL_PATTERNS.some((p) => lower.includes(p));
}

/** The client-side draft shape while contradiction rules are being edited. */
export interface ContradictionRuleDraft {
  /** Stable identity for React keys: the row id, or a client uuid for new rows. */
  key: string;
  id: string | null;
  questionAKey: string;
  valueA: string;
  questionBKey: string;
  valueB: string;
}

function newRuleKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newContradictionRuleDraft(): ContradictionRuleDraft {
  return { key: newRuleKey(), id: null, questionAKey: "", valueA: "", questionBKey: "", valueB: "" };
}

/** Saved rules reference questions by db id, which `questionRowToDraft()`
 * also uses as the draft's `key` — so this needs no remapping to line up. */
export function contradictionRuleRowToDraft(r: SurveyContradictionRule): ContradictionRuleDraft {
  return {
    key: r.id,
    id: r.id,
    questionAKey: r.question_a_id,
    valueA: r.value_a,
    questionBKey: r.question_b_id,
    valueB: r.value_b,
  };
}

/**
 * Drops rules that don't reference two distinct, still-present questions —
 * mirrors validateQuestions()'s "best-effort, skip the invalid rather than
 * block the save" stance, since a stale rule after a question is deleted is
 * expected, not an error.
 */
export function validContradictionRules(
  rules: ContradictionRuleDraft[],
  questionKeys: ReadonlySet<string>,
): ContradictionRuleDraft[] {
  return rules.filter(
    (r) =>
      r.questionAKey &&
      r.questionBKey &&
      r.questionAKey !== r.questionBKey &&
      r.valueA.trim() &&
      r.valueB.trim() &&
      questionKeys.has(r.questionAKey) &&
      questionKeys.has(r.questionBKey),
  );
}
