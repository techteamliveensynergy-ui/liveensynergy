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
import { describeRule, LOGIC_END, logicProblem, logicRules, surveyPath } from "./survey-logic";

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
  { value: "audience_members.date_of_birth", label: "Date of birth" },
];

/**
 * Coarse age bucket collected from a public/anonymous survey respondent —
 * "rough age range", not a birth date (the client's own distinction between
 * a stranger and a known account, 7 Sep standup). No under-18 option is
 * offered on purpose: picking any bucket here doubles as the age gate.
 */
export const AGE_RANGE_OPTIONS: readonly string[] = [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
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
      {
        name: "step",
        label: "Step",
        type: "text",
        hint: "The gap between points, not how many points to show — e.g. min 1, max 10, step 1 gives 10 points. A step that doesn't divide evenly into the range is ignored.",
      },
      { name: "min_label", label: "Label at minimum", type: "text" },
      { name: "max_label", label: "Label at maximum", type: "text" },
      {
        name: "na_label",
        label: '"Not applicable" option label',
        type: "text",
        hint: "Leave blank to hide it. Shown as an extra tile at the end of the scale; counts toward the response's question-coverage quality signal, the same as a 'prefer not to say' choice option.",
      },
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

/**
 * A response's respondent is either an authenticated participation (the
 * pre-0037 shape, joined through participations.profiles) or a captured
 * public/anonymous identity (0037's respondent_* columns) — never both,
 * never neither (the DB check constraint guarantees that). Shared by the
 * admin review queue's list and detail screens so "Unnamed"/"—" never
 * shows for a real public respondent just because the old join found
 * nothing.
 */
export interface RespondentIdentity {
  participations?: {
    profiles?: { full_name?: string | null; email?: string | null } | null;
  } | null;
  respondent_first_name?: string | null;
  respondent_last_name?: string | null;
  respondent_email?: string | null;
}

export function respondentName(r: RespondentIdentity): string {
  const authName = r.participations?.profiles?.full_name;
  if (authName) return authName;
  const full = [r.respondent_first_name, r.respondent_last_name].filter(Boolean).join(" ").trim();
  return full || "Unnamed";
}

export function respondentEmail(r: RespondentIdentity): string {
  return r.participations?.profiles?.email ?? r.respondent_email ?? "—";
}

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
    base.config = { min: 1, max: 5, step: 1, min_label: "Not at all", max_label: "Extremely" };
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

/** Quick-insert preset: a single_choice question pre-filled with the
 *  standard 5-point Likert labels and the face-icon rendering flag
 *  (ChoiceField.tsx keys the icons to position, not to these values, so
 *  editing the labels afterwards doesn't disturb them). */
export function newLikertQuestionDraft(): SurveyQuestionDraft {
  const base = newQuestionDraft("single_choice");
  base.options = [
    { label: "Strongly disagree", value: "strongly_disagree" },
    { label: "Disagree", value: "disagree" },
    { label: "Neutral", value: "neutral" },
    { label: "Agree", value: "agree" },
    { label: "Strongly agree", value: "strongly_agree" },
  ];
  base.config = { display_style: "likert" };
  return base;
}

/**
 * Settings a rating group's rows always share (FB-00028) — editing one on
 * any row applies it to every row, so the scale, its labels and the card's
 * look can't drift apart. Each row keeps its own prompt (the item label) and
 * its own required flag.
 */
export const RATING_GROUP_SHARED_KEYS: readonly (keyof SurveyQuestionConfig)[] = [
  "group_prompt",
  "min",
  "max",
  "step",
  "min_label",
  "max_label",
  "na_label",
  "question_size",
  "font_family",
  "question_text_color",
  "body_text_color",
  "card_background_color",
  "media_url",
  "media_type",
  "media_position",
  "media_fit",
  "video_format",
];

function newGroupId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** One more row for an existing group, copying its shared settings. */
export function newRatingGroupRow(from: SurveyQuestionDraft, label: string): SurveyQuestionDraft {
  const row = newQuestionDraft("scale");
  const shared: Record<string, unknown> = {};
  for (const k of RATING_GROUP_SHARED_KEYS) {
    if (from.config[k] !== undefined) shared[k] = from.config[k];
  }
  row.config = { ...shared, group_id: from.config.group_id } as SurveyQuestionConfig;
  row.prompt = label;
  row.help_text = from.help_text;
  row.required = from.required;
  return row;
}

/** "Rating group" preset (FB-00028): three items on one 1–5 scale. */
export function newRatingGroupDrafts(): SurveyQuestionDraft[] {
  const first = newQuestionDraft("scale");
  first.prompt = "Item 1";
  first.config = {
    min: 1,
    max: 5,
    step: 1,
    min_label: "Poor",
    max_label: "Excellent",
    group_id: newGroupId(),
    group_prompt: "How would you rate each of the following?",
  };
  return [first, newRatingGroupRow(first, "Item 2"), newRatingGroupRow(first, "Item 3")];
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
 * What's wrong with one question draft, or null when it's valid — without the
 * "Question N" prefix, so the builder can show it on the card itself.
 */
export function questionProblem(d: SurveyQuestionDraft): string | null {
  const spec = SURVEY_QUESTION_TYPES.find((s) => s.type === d.type);
  if (!spec) return "Unknown question type.";
  if (spec.hasPrompt && !d.prompt.trim()) {
    return d.type === "scale" && d.config.group_id ? "Item label is required." : "Prompt is required.";
  }
  if (d.type === "scale" && d.config.group_id && !d.config.group_prompt?.trim()) {
    return "The rating group needs its question text.";
  }
  if (spec.hasOptions) {
    const options = d.options.filter((o) => o.label.trim() && o.value.trim());
    if (options.length < 2) {
      return "Needs at least two options.";
    }
    const values = options.map((o) => o.value);
    if (new Set(values).size !== values.length) {
      return "Option values must be unique.";
    }
    if (values.includes(SURVEY_OTHER_VALUE)) {
      return `"${SURVEY_OTHER_VALUE}" is reserved for the Other option — rename that option.`;
    }
  }
  if (d.type === "attention_check" && !d.config.expected_answer) {
    return "Set the expected answer for the attention check.";
  }
  if (d.type === "scale" || d.type === "number") {
    const min = d.config.min ?? (d.type === "scale" ? 1 : 0);
    const max = d.config.max ?? (d.type === "scale" ? 5 : 10);
    const step = d.config.step ?? 1;
    if (max <= min) {
      return "Maximum must be greater than minimum.";
    }
    if (step <= 0 || (max - min) % step !== 0) {
      return "Step must divide evenly into the range (e.g. min 1, max 10, step 1).";
    }
  }
  if (d.type === "hidden_field") {
    const source = d.config.profile_field;
    if (!source || !HIDDEN_FIELD_SOURCES.some((s) => s.value === source)) {
      return "Pick which profile field this hidden field maps to.";
    }
  }
  return null;
}

/** questionProblem() plus this question's skip logic (0071), which needs to
 *  know what comes after it. */
export function questionProblemAt(drafts: SurveyQuestionDraft[], i: number): string | null {
  const d = drafts[i];
  return (
    questionProblem(d) ??
    logicProblem(
      d,
      drafts.slice(i + 1).map((x) => x.key),
    )
  );
}

/** "“Yes” → Q5 · Always → End" for a question card. */
export function logicSummary(drafts: SurveyQuestionDraft[], i: number): string | null {
  const d = drafts[i];
  const rules = logicRules(d);
  if (rules.length === 0) return null;
  const position = new Map(drafts.map((x, n) => [x.key, n + 1]));
  return rules
    .map((r) =>
      describeRule(
        r,
        (value) =>
          value === SURVEY_OTHER_VALUE ? otherLabel(d.config) : d.options.find((o) => o.value === value)?.label ?? value,
        (goto) => (goto === LOGIC_END ? "End" : position.has(goto) ? `Q${position.get(goto)}` : "?"),
      ),
    )
    .join(" · ");
}

/** The first invalid draft, with its position — the builder selects it. */
export function firstQuestionProblem(
  drafts: SurveyQuestionDraft[],
): { index: number; key: string; message: string } | null {
  for (const [i] of drafts.entries()) {
    const d = drafts[i];
    const problem = questionProblemAt(drafts, i);
    if (problem) {
      const label = SURVEY_QUESTION_TYPES.find((s) => s.type === d.type)?.label ?? "question";
      // Names the type as well as the number (FB-00027): "Question 4: prompt
      // is required" alone read as being about the question just edited.
      return { index: i, key: d.key, message: `Question ${i + 1} (${label}): ${problem}` };
    }
  }
  return null;
}

/**
 * Shared by the client (inline warnings) and the server action (authoritative
 * — the save payload is client-authored JSON, so the server must not trust
 * it as-is). Returns the first problem found, or null if the draft is valid.
 */
export function validateQuestions(drafts: SurveyQuestionDraft[]): string | null {
  if (drafts.length === 0) return "Add at least one question.";
  return firstQuestionProblem(drafts)?.message ?? null;
}

/** The client-side answer shape while a participant is filling in a survey. */
export interface SurveyAnswerDraft {
  question_id: string;
  value: SurveyAnswerValue;
  shown_at: string | null;
  answered_at: string | null;
  /** What was typed into "Other — please specify" (FB-00029). Stored by
   *  submit_*_survey_response() (0065) only when Other was chosen. */
  other_text?: string | null;
}

/**
 * Value of the "Other — please specify" option (FB-00029, 0065). Reserved:
 * the builder refuses it as a normal option value. Kept in step with the
 * literal in validate_survey_answer_types() / survey_answer_chose_other().
 */
export const SURVEY_OTHER_VALUE = "__other__";
export const OTHER_TEXT_MAX = 200;
/** Question types that can offer an "Other" option. */
export const OTHER_CAPABLE_TYPES: readonly SurveyQuestionType[] = ["single_choice", "multiple_choice", "dropdown"];

export function offersOther(q: { type: SurveyQuestionType; config: SurveyQuestionConfig }): boolean {
  return OTHER_CAPABLE_TYPES.includes(q.type) && q.config.allow_other === true && q.config.display_style !== "likert";
}

/**
 * What a respondent sees as one card (one step, in stepped layout): a single
 * question, or a rating group — consecutive scale questions sharing a
 * config.group_id (FB-00028). Only *consecutive* rows group; a row the admin
 * drags away from its group renders as its own one-row group card.
 */
export interface SurveyBlock {
  key: string;
  group: boolean;
  questions: SurveyQuestion[];
}

export function surveyBlocks(questions: SurveyQuestion[]): SurveyBlock[] {
  const blocks: SurveyBlock[] = [];
  for (const q of questions) {
    const groupId = q.type === "scale" ? q.config.group_id : undefined;
    const last = blocks[blocks.length - 1];
    if (groupId && last?.group && last.questions[0].config.group_id === groupId) {
      last.questions.push(q);
    } else {
      blocks.push({ key: q.id, group: Boolean(groupId), questions: [q] });
    }
  }
  return blocks;
}

/** First unanswered required question in a block, or an "Other" chosen
 *  without its text — what blocks the stepped layout's Next button. */
export function blockProblem(
  block: SurveyBlock,
  values: Record<string, SurveyAnswerValue>,
  otherTexts: Record<string, string>,
): string | null {
  for (const q of block.questions) {
    const v = values[q.id] ?? null;
    if (q.required && isAnswerEmpty(v)) {
      return block.group ? `Please rate "${q.prompt}" to continue.` : "Please answer this question to continue.";
    }
    if (offersOther(q) && choseOther(v) && !(otherTexts[q.id] ?? "").trim()) {
      return `Please say what "${otherLabel(q.config)}" is.`;
    }
  }
  return null;
}

export function otherLabel(config: SurveyQuestionConfig): string {
  return config.other_label?.trim() || "Other";
}

export function choseOther(value: SurveyAnswerValue): boolean {
  return Array.isArray(value) ? value.includes(SURVEY_OTHER_VALUE) : value === SURVEY_OTHER_VALUE;
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

  // Skip logic (0071): only the questions on this respondent's path are
  // required, and an answer to a skipped question is refused — same rule as
  // survey_path_question_ids() in the submit functions.
  const onPath = new Set(
    surveyPath(questions, Object.fromEntries(answers.map((a) => [a.question_id, a.value]))).map((q) => q.id),
  );
  if (answers.some((a) => !onPath.has(a.question_id) && !isAnswerEmpty(a.value))) {
    return "An answer was sent for a question your earlier answers skipped. Please go back and check.";
  }

  for (const [i, q] of questions.entries()) {
    if (!onPath.has(q.id)) continue;
    // Name the question as well as its number — a rating group's rows and a
    // stepped survey don't show numbers to the respondent.
    const n = q.prompt ? `${i + 1} ("${q.prompt.length > 60 ? `${q.prompt.slice(0, 57)}…` : q.prompt}")` : `${i + 1}`;
    const spec = questionSpec(q.type);
    const entry = byId.get(q.id);
    const value = entry?.value ?? null;
    const other = offersOther(q);

    if (isAnswerEmpty(value)) {
      if (q.required) return `Question ${n} needs an answer.`;
      continue;
    }

    if (spec.answerShape === "string[]") {
      const values = Array.isArray(value) ? value : [];
      const validValues = new Set((q.options ?? []).map((o) => o.value));
      if (other) validValues.add(SURVEY_OTHER_VALUE);
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
        if (other) validValues.add(SURVEY_OTHER_VALUE);
        if (!validValues.has(value)) return `Question ${n} has an invalid answer.`;
      } else if (q.config.max_length != null && value.length > q.config.max_length) {
        return `Question ${n} is too long.`;
      }
    } else if (spec.answerShape === "number") {
      if (q.type === "scale" && q.config.na_label && value === SCALE_NA_VALUE) continue;
      if (typeof value !== "number" || Number.isNaN(value)) {
        return `Question ${n} must be a number.`;
      }
      if (q.config.min != null && value < q.config.min) return `Question ${n} is out of range.`;
      if (q.config.max != null && value > q.config.max) return `Question ${n} is out of range.`;
    }

    if (other && choseOther(value)) {
      const text = (entry?.other_text ?? "").trim();
      if (!text) return `Question ${n}: please say what "${otherLabel(q.config)}" is.`;
      if (text.length > OTHER_TEXT_MAX) return `Question ${n}: the "${otherLabel(q.config)}" answer is too long.`;
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
 * Value written for a scale question's "not applicable" tile
 * (config.na_label). A string, not a number, so it can never collide with a
 * real point on any admin-chosen range — the cost is one exemption in the
 * numeric branch of validateAnswers() above and one in
 * validate_survey_answer_types()'s scale branch (migration 0041). Kept in
 * step with the literal in both places and in score_survey_response().
 * Separate mechanism from OPT_OUT_LABEL_PATTERNS below — scale N/A is
 * config-driven, not a label match, since a scale question has no options
 * array to match a label against.
 */
export const SCALE_NA_VALUE = "__na__";

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
